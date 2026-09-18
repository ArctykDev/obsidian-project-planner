import { normalizePath } from "obsidian";
import type ProjectPlannerPlugin from "../main";
import type { PlannerTask, DependencyType } from "../types";
import { getTaskEstimatedCost, getTaskActualCost } from "../utils/costUtils";

// Helper to get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

// Validate YYYY-MM-DD format
function isValidDateStr(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

// Helper to parse YYYY-MM-DD date string without timezone issues
function parseDate(dateStr: string): Date {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return new Date(NaN);
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}

// Helper to format a Date to YYYY-MM-DD
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Helper to add days to a date string, returning a new YYYY-MM-DD string
function addDays(dateStr: string, days: number): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

interface StoredData {
  tasks?: PlannerTask[]; // legacy single-project storage
  tasksByProject?: Record<string, PlannerTask[]>;
  settings?: unknown;
  [key: string]: unknown; // allow other plugin data to coexist
}

/** Shape of per-project vault files: {basePath}/{projectName}/.planner-tasks.json */
interface ProjectFileData {
  version: number;
  projectId: string;
  tasks: PlannerTask[];
}

export class TaskStore {
  private plugin: ProjectPlannerPlugin;

  private tasks: PlannerTask[] = [];
  private tasksByProject: Record<string, PlannerTask[]> = {};
  private taskIndex: Map<string, PlannerTask> = new Map();
  private listeners: Set<() => void> = new Set();
  private loaded = false;

  constructor(plugin: ProjectPlannerPlugin) {
    this.plugin = plugin;
  }

  // ---------------------------------------------------------------------------
  // VAULT FILE HELPERS — per-project .planner-tasks.json
  // ---------------------------------------------------------------------------

  /**
   * Returns the vault-relative path for a project's task file.
   * e.g. "Project Planner/My Project/.planner-tasks.json"
   */
  private getProjectFilePath(projectId: string): string | null {
    const project = this.plugin.settings.projects.find(p => p.id === projectId);
    if (!project) return null;
    const basePath = (this.plugin.settings.projectsBasePath || "Project Planner").trim();
    const projectFolder = project.storageKey ?? project.name;
    return normalizePath(`${basePath}/${projectFolder}/.planner-tasks.json`);
  }

  /** Read a project's tasks from its vault file. Returns null if file doesn't exist yet. */
  private async readProjectFile(projectId: string): Promise<PlannerTask[] | null> {
    const filePath = this.getProjectFilePath(projectId);
    if (!filePath) return null;
    try {
      const adapter = this.plugin.app.vault.adapter;
      if (!(await adapter.exists(filePath))) return null;
      const raw = await adapter.read(filePath);
      const data = JSON.parse(raw) as ProjectFileData;
      return Array.isArray(data.tasks) ? data.tasks : null;
    } catch {
      return null;
    }
  }

  /** Write a project's tasks to its vault file, creating the folder if needed. */
  private async writeProjectFile(projectId: string, tasks: PlannerTask[]): Promise<void> {
    const filePath = this.getProjectFilePath(projectId);
    if (!filePath) return;
    const adapter = this.plugin.app.vault.adapter;
    const folder = normalizePath(filePath.substring(0, filePath.lastIndexOf("/")));
    if (folder && !(await adapter.exists(folder))) {
      await adapter.mkdir(folder);
    }
    const data: ProjectFileData = { version: 1, projectId, tasks };
    await adapter.write(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Copy all tasks from sourceProjectId to targetProjectId, assigning fresh IDs
   * to every task, subtask, and dependency reference. bucketIdMap remaps old
   * bucket IDs to the new IDs used by the copied project.
   */
  async copyProjectTasks(
    sourceProjectId: string,
    targetProjectId: string,
    bucketIdMap: Map<string, string>
  ): Promise<void> {
    const sourceTasks = (await this.readProjectFile(sourceProjectId)) ?? [];

    // Build a task ID remap: old task ID → new task ID
    const taskIdMap = new Map<string, string>();
    for (const task of sourceTasks) {
      taskIdMap.set(task.id, crypto.randomUUID());
    }

    const copiedTasks: PlannerTask[] = sourceTasks.map((task) => ({
      ...task,
      id: taskIdMap.get(task.id)!,
      parentId: task.parentId ? (taskIdMap.get(task.parentId) ?? null) : task.parentId,
      bucketId: task.bucketId ? (bucketIdMap.get(task.bucketId) ?? undefined) : task.bucketId,
      dependencies: task.dependencies?.map((dep) => ({
        ...dep,
        predecessorId: taskIdMap.get(dep.predecessorId) ?? dep.predecessorId,
      })),
      subtasks: task.subtasks?.map((st) => ({
        ...st,
        id: crypto.randomUUID(),
      })),
    }));

    await this.writeProjectFile(targetProjectId, copiedTasks);
  }

  private get activeProjectId(): string {
    return this.plugin.settings.activeProjectId;
  }

  // ---------------------------------------------------------------------------
  // LOADING WITH FULL MIGRATION + NON-DESTRUCTIVE LOGIC
  // ---------------------------------------------------------------------------

  async load(): Promise<void> {
    const raw = ((await this.plugin.loadData()) || {}) as StoredData;

    // -----------------------------------------------------------------------
    // MIGRATION: move legacy tasksByProject / tasks from data.json to vault files
    // -----------------------------------------------------------------------
    const legacyByProject = raw.tasksByProject as Record<string, PlannerTask[]> | undefined;
    const legacyTasks = raw.tasks as PlannerTask[] | undefined;
    let migrated = false;

    if (legacyByProject && Object.keys(legacyByProject).length > 0) {
      for (const [pid, tasks] of Object.entries(legacyByProject)) {
        // Only write vault file if one doesn't already exist
        if (!(await this.readProjectFile(pid))) {
          await this.writeProjectFile(pid, Array.isArray(tasks) ? tasks : []);
        }
      }
      delete raw.tasksByProject;
      migrated = true;
    }

    if (Array.isArray(legacyTasks) && legacyTasks.length > 0) {
      if (!(await this.readProjectFile(this.activeProjectId))) {
        await this.writeProjectFile(this.activeProjectId, legacyTasks);
      }
      delete raw.tasks;
      migrated = true;
    }

    if (migrated) {
      // Persist cleaned data.json (settings only, no task data)
      await this.plugin.saveData(raw);
    }

    // -----------------------------------------------------------------------
    // Load all projects from their vault files
    // -----------------------------------------------------------------------
    this.tasksByProject = {};
    this.taskIndex.clear();

    for (const project of this.plugin.settings.projects) {
      const tasks = await this.readProjectFile(project.id) ?? [];
      this.tasksByProject[project.id] = tasks;
    }

    const projectId = this.activeProjectId;

    // Ensure active project has a file even if brand-new
    if (!this.tasksByProject[projectId]) {
      this.tasksByProject[projectId] = [];
      await this.writeProjectFile(projectId, []);
    }

    this.tasks = this.tasksByProject[projectId];
    this.rebuildIndex();
    this.loaded = true;
    this.emit();
  }

  /** Rebuild the O(1) lookup index from the current tasks array. */
  private rebuildIndex(): void {
    this.taskIndex.clear();
    for (const t of this.tasks) {
      this.taskIndex.set(t.id, t);
    }
  }

  // ---------------------------------------------------------------------------
  // NON-DESTRUCTIVE SAVE (MERGES INTO EXISTING DATA)
  // ---------------------------------------------------------------------------

  /**
   * Persist current task data to disk AND notify all view subscribers.
   * Use this for simple, single-step operations (addTask, setOrder, etc.).
   */
  private async save(): Promise<void> {
    await this.saveQuietly();
    this.emit();
  }

  /**
   * Persist current task data to disk WITHOUT notifying views.
   * Used by multi-step operations (updateTask, deleteTask, makeSubtask,
   * promoteSubtask) that need to cascade / roll-up before emitting once
   * at the very end to avoid triggering N full DOM rebuilds per action.
   */
  private async saveQuietly(): Promise<void> {
    const projectId = this.activeProjectId;
    if (!projectId) return;

    // Keep in-memory map in sync
    this.tasksByProject[projectId] = this.tasks;

    // Write active project to its vault file (task data is no longer in data.json)
    await this.writeProjectFile(projectId, this.tasks);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------

  getAll(): PlannerTask[] {
    return this.tasks;
  }

  getAllForProject(projectId: string): PlannerTask[] {
    return this.tasksByProject[projectId] || [];
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const l of this.listeners) {
      try { l(); } catch (e) { console.error("TaskStore subscriber error:", e); }
    }
  }

  // Public method to manually trigger view updates (e.g., after settings change)
  refresh() {
    this.emit();
  }

  async addTask(title: string): Promise<PlannerTask> {
    const today = getTodayDate();
    const task: PlannerTask = {
      id: crypto.randomUUID(),
      title,
      status: this.plugin.settings.defaultTaskStatus || "Not Started",
      priority: "Medium",
      completed: false,
      parentId: null,
      collapsed: false,
      createdDate: today,
      lastModifiedDate: today,
      startDate: today, // Set start date to today by default
    };

    this.tasks.push(task);
    this.taskIndex.set(task.id, task);
    this.updateProjectTimestamp();
    await this.save();

    // Sync to markdown if enabled
    if (this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
      try {
        await this.plugin.taskSync.syncTaskToMarkdown(task, this.activeProjectId);
      } catch (error) {
        console.error("Failed to sync task to markdown:", error);
      }
    }

    return task;
  }

  /**
   * Create a new task and insert it at a specific index in one atomic
   * operation. Only emits once after the task is in its final position,
   * preventing intermediate renders that flash the task at the wrong spot.
   */
  async addTaskAtIndex(
    title: string,
    index: number,
    overrides?: Partial<PlannerTask>
  ): Promise<PlannerTask> {
    const today = getTodayDate();
    const task: PlannerTask = {
      id: crypto.randomUUID(),
      title,
      status: this.plugin.settings.defaultTaskStatus || "Not Started",
      priority: "Medium",
      completed: false,
      parentId: null,
      collapsed: false,
      createdDate: today,
      lastModifiedDate: today,
      startDate: today,
    };

    if (overrides) Object.assign(task, overrides);

    // Insert directly at the requested position
    const clampedIndex = Math.max(0, Math.min(index, this.tasks.length));
    this.tasks.splice(clampedIndex, 0, task);
    this.taskIndex.set(task.id, task);
    this.updateProjectTimestamp();
    await this.save(); // save + emit once

    // Sync to markdown if enabled
    if (this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
      try {
        await this.plugin.taskSync.syncTaskToMarkdown(task, this.activeProjectId);
      } catch (error) {
        console.error("Failed to sync task to markdown:", error);
      }
    }

    return task;
  }

  async addTaskFromObject(task: PlannerTask): Promise<void> {
    // Check if task already exists
    const existing = this.tasks.find(t => t.id === task.id);
    if (existing) {
      // Merge incoming task into existing — only overwrite properties that are
      // explicitly present on the incoming task object.  This prevents stale
      // markdown sync-back from wiping in-memory fields (e.g. bucketId) that
      // were never written to the markdown file.
      for (const key of Object.keys(task) as (keyof PlannerTask)[]) {
        if (task[key] !== undefined) {
          // Safe dynamic assignment — both sides share the same key
          (existing[key] as PlannerTask[typeof key]) = task[key];
        }
      }
    } else {
      // Set timestamps if not already set
      if (!task.createdDate) task.createdDate = getTodayDate();
      if (!task.lastModifiedDate) task.lastModifiedDate = getTodayDate();
      this.tasks.push(task);
      this.taskIndex.set(task.id, task);
    }

    this.updateProjectTimestamp();
    await this.save();
  }

  async addTaskToProject(task: PlannerTask, projectId: string): Promise<void> {
    // Ensure project bucket exists
    if (!this.tasksByProject[projectId]) {
      this.tasksByProject[projectId] = [];
    }

    // Check if task already exists in this project
    const projectTasks = this.tasksByProject[projectId];
    const existing = projectTasks.find(t => t.id === task.id);

    if (existing) {
      // Update instead of adding duplicate
      Object.assign(existing, task);
      existing.lastModifiedDate = getTodayDate();
    } else {
      // Set timestamps if not already set
      if (!task.createdDate) task.createdDate = getTodayDate();
      if (!task.lastModifiedDate) task.lastModifiedDate = getTodayDate();
      projectTasks.push(task);
      this.taskIndex.set(task.id, task);
    }

    // Update the project bucket
    this.tasksByProject[projectId] = projectTasks;

    // Update project timestamp
    const project = this.plugin.settings.projects.find(p => p.id === projectId);
    if (project) {
      project.lastUpdatedDate = new Date().toISOString();
    }

    // Write to vault file
    await this.writeProjectFile(projectId, projectTasks);

    // If this is the active project, refresh the working tasks reference
    if (projectId === this.activeProjectId) {
      this.tasks = this.tasksByProject[projectId];
    }

    this.emit();
  }

  async updateTask(id: string, partial: Partial<PlannerTask>, options?: { skipParentRollUp?: boolean }): Promise<void> {
    let task = this.tasks.find((t) => t.id === id);
    let crossProjectId: string | null = null;

    // If not in the active project, search all projects (needed by MyDayView
    // which aggregates tasks across every project).
    if (!task) {
      for (const [projId, projTasks] of Object.entries(this.tasksByProject)) {
        task = projTasks.find((t) => t.id === id);
        if (task) {
          crossProjectId = projId;
          break;
        }
      }
    }

    if (!task) return;

    // Track old title for file rename detection
    const oldTitle = task.title;
    const titleChanged = partial.title !== undefined && partial.title !== oldTitle;

    // Bidirectional sync: status takes precedence
    if (partial.status !== undefined) {
      partial.completed = partial.status === "Completed";
    } else if (partial.completed !== undefined) {
      partial.status = partial.completed ? "Completed" : task.status || "Not Started";
    }

    // Effort sync: Microsoft Planner style
    // - When completed hours change, remaining auto-decreases from total
    // - When remaining changes directly, total adjusts
    // - When task is marked Completed, remaining → 0, completed = total
    const oldCompleted = task.effortCompleted ?? 0;
    const oldRemaining = task.effortRemaining ?? 0;
    const oldTotal = oldCompleted + oldRemaining;

    if (partial.status === "Completed" || partial.completed === true) {
      // Move all remaining into completed
      if (oldTotal > 0) {
        partial.effortCompleted = oldTotal;
        partial.effortRemaining = 0;
      }
    } else if (partial.effortCompleted !== undefined && partial.effortRemaining === undefined) {
      // User changed completed hours only → auto-adjust remaining from total
      partial.effortRemaining = Math.max(0, oldTotal - partial.effortCompleted);
    }

    // Auto-calculate percentComplete from effort values
    const finalCompleted = partial.effortCompleted ?? task.effortCompleted ?? 0;
    const finalRemaining = partial.effortRemaining ?? task.effortRemaining ?? 0;
    const totalEffortCalc = finalCompleted + finalRemaining;
    if (totalEffortCalc > 0) {
      partial.percentComplete = Math.round((finalCompleted / totalEffortCalc) * 100);
      // Auto-sync status based on calculated percent
      if (partial.percentComplete === 100 && (partial.status ?? task.status) !== "Completed") {
        partial.status = "Completed";
        partial.completed = true;
      } else if (partial.percentComplete < 100 && (partial.status ?? task.status) === "Completed") {
        partial.status = "In Progress";
        partial.completed = false;
      }
    } else {
      // No effort data — keep percentComplete as-is (or 0)
      if (partial.effortCompleted !== undefined || partial.effortRemaining !== undefined) {
        partial.percentComplete = 0;
      }
    }

    // Track old dates for dependency scheduling cascade
    const oldStartDate = task.startDate;
    const oldDueDate = task.dueDate;

    // Set last modified timestamp
    partial.lastModifiedDate = getTodayDate();

    // Object.assign mutates the task in-place. For cross-project tasks
    // this correctly modifies the reference inside tasksByProject[crossProjectId].
    Object.assign(task, partial);
    this.updateProjectTimestamp();
    // Persist without emitting — cascade/rollup may trigger additional saves.
    // We emit exactly once at the very end to avoid N full DOM rebuilds.
    await this.saveQuietly();

    // For cross-project tasks, saveQuietly() only writes the active project file.
    // Explicitly write the cross-project file too.
    if (crossProjectId) {
      await this.writeProjectFile(crossProjectId, this.tasksByProject[crossProjectId]);
    }

    // Resolve the project ID the task actually belongs to
    const effectiveProjectId = crossProjectId ?? this.activeProjectId;

    // Sync to markdown if enabled
    if (this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
      try {
        // If title changed, delete old file and create new one
        if (titleChanged) {
          await this.plugin.taskSync.handleTaskRename(task, oldTitle, effectiveProjectId);
        } else {
          await this.plugin.taskSync.syncTaskToMarkdown(task, effectiveProjectId);
        }
      } catch (error) {
        console.error("Failed to sync task to markdown:", error);
      }
    }

    // Cascade & roll-up only apply within the active project's task array.
    // Cross-project updates skip these — the task's dependents and parent
    // live in its own project and will cascade when that project is active.
    if (!crossProjectId) {
      // Dependency-driven auto-scheduling: cascade date changes to dependent tasks
      if (this.plugin.settings.enableDependencyScheduling) {
        const datesChanged =
          (partial.startDate !== undefined && task.startDate !== oldStartDate) ||
          (partial.dueDate !== undefined && task.dueDate !== oldDueDate);
        if (datesChanged) {
          await this.cascadeDependencyDates(task.id, new Set());
        }
      }

      // Parent task roll-up: recalculate parent's dates, effort, and % complete
      if (this.plugin.settings.enableParentRollUp && task.parentId && !options?.skipParentRollUp) {
        await this.rollUpParentFields(task.parentId);
      }
    }

    // Single emit after ALL work is done — views render once with final data
    this.emit();
  }

  // ---------------------------------------------------------------------------
  // Parent Task Roll-Up (MS Project style)
  // ---------------------------------------------------------------------------

  /**
   * Recalculate a parent task's dates, effort, and % complete from its
   * direct children. Cascades upward if the parent itself has a parent.
   *
   * - **Dates**: startDate = earliest child start; dueDate = latest child due
   * - **Effort**: effortCompleted = Σ children completed; effortRemaining = Σ children remaining
   * - **% Complete**: duration-weighted average: Σ(childDuration × child%) / Σ(childDuration)
   *   If no children have durations, uses equal weighting.
   */
  private async rollUpParentFields(parentId: string): Promise<void> {
    const parent = this.tasks.find(t => t.id === parentId);
    if (!parent) return;

    const children = this.tasks.filter(t => t.parentId === parentId);
    if (children.length === 0) return;

    // --- Date roll-up: earliest start, latest due ---
    let earliestStart: string | undefined;
    let latestDue: string | undefined;

    for (const child of children) {
      if (child.startDate) {
        if (!earliestStart || child.startDate < earliestStart) {
          earliestStart = child.startDate;
        }
      }
      if (child.dueDate) {
        if (!latestDue || child.dueDate > latestDue) {
          latestDue = child.dueDate;
        }
      }
    }

    // --- Effort roll-up: sum of children ---
    let totalCompleted = 0;
    let totalRemaining = 0;
    for (const child of children) {
      totalCompleted += child.effortCompleted ?? 0;
      totalRemaining += child.effortRemaining ?? 0;
    }

    // --- Cost roll-up: sum of children's estimated and actual costs ---
    const project = this.plugin.settings.projects?.find(p => p.id === this.activeProjectId);
    let totalCostEstimate = 0;
    let totalCostActual = 0;
    for (const child of children) {
      totalCostEstimate += getTaskEstimatedCost(child, project);
      totalCostActual += getTaskActualCost(child, project);
    }
    const anyCostData = totalCostEstimate > 0 || totalCostActual > 0;

    // --- % Complete roll-up: duration-weighted average ---
    let weightedPct = 0;
    let totalWeight = 0;

    for (const child of children) {
      let duration = 1; // default equal weight
      if (child.startDate && child.dueDate) {
        const s = parseDate(child.startDate);
        const e = parseDate(child.dueDate);
        const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000));
        duration = days;
      }
      const childPct = child.percentComplete ?? 0;
      weightedPct += duration * childPct;
      totalWeight += duration;
    }

    const rolledPct = totalWeight > 0 ? Math.round(weightedPct / totalWeight) : 0;

    // --- Determine if the parent's status should sync with rolled-up % ---
    const totalEffort = totalCompleted + totalRemaining;
    let newStatus: string | undefined;
    let newCompleted: boolean | undefined;

    if (rolledPct === 100) {
      newStatus = "Completed";
      newCompleted = true;
    } else if (rolledPct > 0 && parent.status === "Completed") {
      // Was marked complete but children say otherwise
      newStatus = "In Progress";
      newCompleted = false;
    }

    // --- Apply changes only if something actually changed ---
    const changes: Partial<PlannerTask> = {};
    let changed = false;

    if (earliestStart !== undefined && earliestStart !== parent.startDate) {
      changes.startDate = earliestStart;
      changed = true;
    }
    if (latestDue !== undefined && latestDue !== parent.dueDate) {
      changes.dueDate = latestDue;
      changed = true;
    }
    if (totalEffort > 0) {
      if (totalCompleted !== (parent.effortCompleted ?? 0)) {
        changes.effortCompleted = totalCompleted;
        changed = true;
      }
      if (totalRemaining !== (parent.effortRemaining ?? 0)) {
        changes.effortRemaining = totalRemaining;
        changed = true;
      }
    }
    if (rolledPct !== (parent.percentComplete ?? 0)) {
      changes.percentComplete = rolledPct;
      changed = true;
    }
    // Cost roll-up
    if (anyCostData) {
      if (totalCostEstimate !== (parent.costEstimate ?? 0)) {
        changes.costEstimate = totalCostEstimate;
        changed = true;
      }
      if (totalCostActual !== (parent.costActual ?? 0)) {
        changes.costActual = totalCostActual;
        changed = true;
      }
      // Mark parent as fixed cost type so rolled values display correctly
      if (parent.costType !== "fixed") {
        changes.costType = "fixed" as const;
        changed = true;
      }
    }
    if (newStatus !== undefined && newStatus !== parent.status) {
      changes.status = newStatus;
      changes.completed = newCompleted;
      changed = true;
    }

    if (!changed) return;

    changes.lastModifiedDate = getTodayDate();
    Object.assign(parent, changes);

    // Sync parent to markdown if enabled
    if (this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
      try {
        await this.plugin.taskSync.syncTaskToMarkdown(parent, this.activeProjectId);
      } catch (error) {
        console.error("Failed to sync rolled-up parent to markdown:", error);
      }
    }

    // Save the updated parent (quiet — caller will emit once at the end)
    this.updateProjectTimestamp();
    await this.saveQuietly();

    // Cascade upward: if this parent also has a parent, roll up again
    if (parent.parentId) {
      await this.rollUpParentFields(parent.parentId);
    }
  }

  // ---------------------------------------------------------------------------
  // Dependency-Driven Auto-Scheduling (MS Project / GanttProject style)
  // ---------------------------------------------------------------------------

  /**
   * Find all tasks that depend on `predecessorId` and shift their dates
   * according to each dependency type. Cascades recursively to downstream
   * dependents. Uses a `visited` Set to prevent infinite loops from
   * circular dependencies.
   */
  private async cascadeDependencyDates(predecessorId: string, visited: Set<string>): Promise<void> {
    if (visited.has(predecessorId)) return; // Circular dependency guard
    visited.add(predecessorId);

    const predecessor = this.tasks.find(t => t.id === predecessorId);
    if (!predecessor) return;

    // Find all tasks that list this task as a predecessor
    const dependents = this.tasks.filter(t =>
      t.dependencies?.some(d => d.predecessorId === predecessorId)
    );

    for (const dependent of dependents) {
      const dep = dependent.dependencies!.find(d => d.predecessorId === predecessorId)!;
      const updates = this.calculateScheduledDates(predecessor, dependent, dep.type);

      if (!updates) continue; // No changes needed

      // Check if dates actually changed to avoid unnecessary saves
      const startChanged = updates.startDate !== undefined && updates.startDate !== dependent.startDate;
      const dueChanged = updates.dueDate !== undefined && updates.dueDate !== dependent.dueDate;

      if (!startChanged && !dueChanged) continue;

      // Apply the date changes
      const partial: Partial<PlannerTask> = { lastModifiedDate: getTodayDate() };
      if (startChanged) partial.startDate = updates.startDate;
      if (dueChanged) partial.dueDate = updates.dueDate;

      Object.assign(dependent, partial);

      // Sync to markdown if enabled
      if (this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
        try {
          await this.plugin.taskSync.syncTaskToMarkdown(dependent, this.activeProjectId);
        } catch (error) {
          console.error("Failed to sync cascaded task to markdown:", error);
        }
      }

      // Recurse: this dependent's dates changed, so cascade to its own dependents
      await this.cascadeDependencyDates(dependent.id, visited);
    }

    // Save once after all cascades from this level (quiet — caller emits)
    this.updateProjectTimestamp();
    await this.saveQuietly();
  }

  /**
   * Calculate what the dependent task's start/due dates should be based on
   * the predecessor's dates, the dependency type, and the dependent task's
   * current duration (preserves task duration when shifting).
   *
   * Returns { startDate, dueDate } partial, or null if no shift is needed
   * (e.g., predecessor has no dates set).
   */
  private calculateScheduledDates(
    predecessor: PlannerTask,
    dependent: PlannerTask,
    depType: DependencyType
  ): { startDate?: string; dueDate?: string } | null {
    // Compute the dependent's current duration in days (to preserve when shifting)
    let durationDays = 0;
    if (dependent.startDate && dependent.dueDate) {
      const s = parseDate(dependent.startDate);
      const e = parseDate(dependent.dueDate);
      durationDays = Math.max(0, Math.round((e.getTime() - s.getTime()) / (86400000)));
    }

    switch (depType) {
      case "FS": {
        // Finish-to-Start: dependent starts the day after predecessor finishes
        if (!predecessor.dueDate) return null;
        const newStart = addDays(predecessor.dueDate, 1);
        // Only shift forward (don't pull tasks earlier than they already are)
        if (dependent.startDate && newStart <= dependent.startDate) return null;
        const newDue = durationDays > 0 ? addDays(newStart, durationDays) : undefined;
        return { startDate: newStart, dueDate: newDue ?? dependent.dueDate };
      }

      case "SS": {
        // Start-to-Start: dependent starts when predecessor starts
        if (!predecessor.startDate) return null;
        const newStart = predecessor.startDate;
        if (dependent.startDate && newStart <= dependent.startDate) return null;
        const newDue = durationDays > 0 ? addDays(newStart, durationDays) : undefined;
        return { startDate: newStart, dueDate: newDue ?? dependent.dueDate };
      }

      case "FF": {
        // Finish-to-Finish: dependent finishes when predecessor finishes
        if (!predecessor.dueDate) return null;
        const newDue = predecessor.dueDate;
        if (dependent.dueDate && newDue <= dependent.dueDate) return null;
        const newStart = durationDays > 0 ? addDays(newDue, -durationDays) : undefined;
        return { startDate: newStart ?? dependent.startDate, dueDate: newDue };
      }

      case "SF": {
        // Start-to-Finish: dependent finishes when predecessor starts
        if (!predecessor.startDate) return null;
        const newDue = predecessor.startDate;
        if (dependent.dueDate && newDue <= dependent.dueDate) return null;
        const newStart = durationDays > 0 ? addDays(newDue, -durationDays) : undefined;
        return { startDate: newStart ?? dependent.startDate, dueDate: newDue };
      }

      default:
        return null;
    }
  }

  /**
   * Move a task to a different project.
   * Clears project-scoped fields (bucketId, parentId, dependencies) since
   * those references are meaningless in the target project.
   */
  async moveTaskToProject(taskId: string, targetProjectId: string): Promise<void> {
    if (targetProjectId === this.activeProjectId) return;

    // Find which project currently owns this task
    let sourceProjectId: string | null = null;
    let task: PlannerTask | undefined;

    for (const [projId, projTasks] of Object.entries(this.tasksByProject)) {
      const found = projTasks.find(t => t.id === taskId);
      if (found) {
        sourceProjectId = projId;
        task = found;
        break;
      }
    }

    if (!task || !sourceProjectId) return;

    const oldParentId = task.parentId;

    // Promote children in the source project to top-level
    const sourceTasks = this.tasksByProject[sourceProjectId] || [];
    for (const child of sourceTasks) {
      if (child.parentId === taskId) child.parentId = null;
    }

    // Remove from source
    this.tasksByProject[sourceProjectId] = sourceTasks.filter(t => t.id !== taskId);
    if (sourceProjectId === this.activeProjectId) {
      this.tasks = this.tasksByProject[sourceProjectId];
    }
    this.taskIndex.delete(taskId);

    // Roll up source parent before the task disappears
    if (this.plugin.settings.enableParentRollUp && oldParentId && sourceProjectId === this.activeProjectId) {
      await this.rollUpParentFields(oldParentId);
    }

    // Clear project-scoped fields
    task.bucketId = undefined;
    task.parentId = null;
    task.dependencies = [];
    task.lastModifiedDate = getTodayDate();

    // Add to target
    if (!this.tasksByProject[targetProjectId]) {
      this.tasksByProject[targetProjectId] = [];
    }
    this.tasksByProject[targetProjectId].push(task);
    this.taskIndex.set(taskId, task);
    if (targetProjectId === this.activeProjectId) {
      this.tasks = this.tasksByProject[targetProjectId];
    }

    // Persist both affected project files
    await this.writeProjectFile(sourceProjectId, this.tasksByProject[sourceProjectId]);
    await this.writeProjectFile(targetProjectId, this.tasksByProject[targetProjectId]);

    this.emit();
  }

  async deleteTask(id: string): Promise<void> {
    // Get task before deleting for sync purposes
    const task = this.tasks.find(t => t.id === id);
    const deletedParentId = task?.parentId;

    // Find children of the task being deleted
    const children = this.tasks.filter(t => t.parentId === id);

    // Promote children to top-level tasks (orphan handling)
    for (const child of children) {
      child.parentId = null;
    }

    // Remove the task itself
    this.tasks = this.tasks.filter(t => t.id !== id);
    this.taskIndex.delete(id);

    this.updateProjectTimestamp();
    await this.saveQuietly();

    // Delete markdown note if enabled
    if (task && this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
      const project = this.plugin.settings.projects.find(p => p.id === this.activeProjectId);
      if (project) {
        await this.plugin.taskSync.deleteTaskMarkdown(task, project.id);
      }
    }

    // Roll up parent after child deletion
    if (this.plugin.settings.enableParentRollUp && deletedParentId) {
      await this.rollUpParentFields(deletedParentId);
    }

    // Single emit after all work is done
    this.emit();
  }

  async setOrder(ids: string[]): Promise<void> {
    const idToTask = new Map(this.tasks.map((t) => [t.id, t]));
    this.tasks = ids
      .map((id) => idToTask.get(id))
      .filter((t): t is PlannerTask => !!t);
    this.rebuildIndex();
    await this.save();
  }

  async toggleCollapsed(id: string): Promise<void> {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return;
    task.collapsed = !task.collapsed;
    await this.save();
  }

  async makeSubtask(taskId: string, parentId: string): Promise<void> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const oldParentId = task.parentId;
    task.parentId = parentId;
    await this.saveQuietly();

    // Roll up both new and old parent
    if (this.plugin.settings.enableParentRollUp) {
      await this.rollUpParentFields(parentId);
      if (oldParentId) await this.rollUpParentFields(oldParentId);
    }

    // Single emit after all work is done
    this.emit();
  }

  getTaskById(id: string): PlannerTask | undefined {
    return this.taskIndex.get(id);
  }

  /** Look up a task by id across all loaded projects, not just the active one. */
  getTaskByIdAcrossProjects(id: string): PlannerTask | null {
    const indexed = this.taskIndex.get(id);
    if (indexed) return indexed;
    for (const tasks of Object.values(this.tasksByProject)) {
      const found = tasks.find(t => t.id === id);
      if (found) return found;
    }
    return null;
  }

  getTasks(): PlannerTask[] {
    return this.tasks;
  }

  async promoteSubtask(taskId: string): Promise<void> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const oldParentId = task.parentId;
    task.parentId = null;
    await this.saveQuietly();

    // Roll up old parent after losing a child
    if (this.plugin.settings.enableParentRollUp && oldParentId) {
      await this.rollUpParentFields(oldParentId);
    }

    // Single emit after all work is done
    this.emit();
  }

  private updateProjectTimestamp(): void {
    const activeProject = this.plugin.settings.projects.find(
      p => p.id === this.plugin.settings.activeProjectId
    );
    if (activeProject) {
      activeProject.lastUpdatedDate = new Date().toISOString();
    }
  }
}
