import type ProjectPlannerPlugin from "../main";
import type { PlannerTask, DependencyType } from "../types";

// Helper to get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

// Helper to parse YYYY-MM-DD date string without timezone issues
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
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

export class TaskStore {
  private plugin: ProjectPlannerPlugin;

  private tasks: PlannerTask[] = [];
  private tasksByProject: Record<string, PlannerTask[]> = {};
  private listeners: Set<() => void> = new Set();
  private loaded = false;
  /** Cached non-task data from data.json, loaded once and kept in sync */
  private cachedRawData: StoredData | null = null;

  constructor(plugin: ProjectPlannerPlugin) {
    this.plugin = plugin;
  }

  private get activeProjectId(): string {
    return this.plugin.settings.activeProjectId;
  }

  // ---------------------------------------------------------------------------
  // LOADING WITH FULL MIGRATION + NON-DESTRUCTIVE LOGIC
  // ---------------------------------------------------------------------------

  async load(): Promise<void> {
    const raw = ((await this.plugin.loadData()) || {}) as StoredData;

    // Cache the raw data to avoid re-reading from disk on every save
    this.cachedRawData = raw;

    // Always try to load existing multiproject data
    this.tasksByProject = raw.tasksByProject ?? {};

    const projectId = this.activeProjectId;

    // MIGRATION: If legacy tasks exist and no multiproject data yet
    if (
      (!this.tasksByProject || Object.keys(this.tasksByProject).length === 0) &&
      Array.isArray(raw.tasks) &&
      raw.tasks.length > 0
    ) {
      // Create tasksByProject
      this.tasksByProject = {
        [projectId]: raw.tasks
      };

      // Save migrated structure safely
      raw.tasksByProject = this.tasksByProject;
      delete raw.tasks; // optional: remove legacy field to avoid confusion
      await this.plugin.saveData(raw);
    }

    // Ensure this project has a valid bucket
    if (!this.tasksByProject[projectId]) {
      this.tasksByProject[projectId] = [];
      raw.tasksByProject = this.tasksByProject;
      await this.plugin.saveData(raw);
    }

    // Set the working tasks reference
    this.tasks = this.tasksByProject[projectId];
    this.loaded = true;
    this.emit();
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

    // Update current project bucket
    this.tasksByProject[projectId] = this.tasks;

    // Use cached data instead of re-reading from disk on every save.
    // Falls back to loadData() if cache is missing (e.g., external modification).
    const raw = this.cachedRawData ?? ((await this.plugin.loadData()) || {}) as StoredData;
    raw.tasksByProject = this.tasksByProject;
    this.cachedRawData = raw;

    await this.plugin.saveData(raw);
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
      try { l(); } catch { }
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
      status: "Not Started",
      priority: "Medium",
      completed: false,
      parentId: null,
      collapsed: false,
      createdDate: today,
      lastModifiedDate: today,
      startDate: today, // Set start date to today by default
    };

    this.tasks.push(task);
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
    }

    // Update the project bucket
    this.tasksByProject[projectId] = projectTasks;

    // Update project timestamp
    const project = this.plugin.settings.projects.find(p => p.id === projectId);
    if (project) {
      project.lastUpdatedDate = new Date().toISOString();
    }

    // Save and emit changes
    const raw = this.cachedRawData ?? ((await this.plugin.loadData()) || {}) as StoredData;
    raw.tasksByProject = this.tasksByProject;
    this.cachedRawData = raw;
    await this.plugin.saveData(raw);

    // If this is the active project, refresh the working tasks
    if (projectId === this.activeProjectId) {
      this.tasks = this.tasksByProject[projectId];
    }

    this.emit();
  }

  async updateTask(id: string, partial: Partial<PlannerTask>): Promise<void> {
    const task = this.tasks.find((t) => t.id === id);
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

    Object.assign(task, partial);
    this.updateProjectTimestamp();
    // Persist without emitting — cascade/rollup may trigger additional saves.
    // We emit exactly once at the very end to avoid N full DOM rebuilds.
    await this.saveQuietly();

    // Sync to markdown if enabled
    if (this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
      try {
        // If title changed, delete old file and create new one
        if (titleChanged) {
          await this.plugin.taskSync.handleTaskRename(task, oldTitle, this.activeProjectId);
        } else {
          await this.plugin.taskSync.syncTaskToMarkdown(task, this.activeProjectId);
        }
      } catch (error) {
        console.error("Failed to sync task to markdown:", error);
      }
    }

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
    if (this.plugin.settings.enableParentRollUp && task.parentId) {
      await this.rollUpParentFields(task.parentId);
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

    this.updateProjectTimestamp();
    await this.saveQuietly();

    // Delete markdown note if enabled
    if (task && this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
      const project = this.plugin.settings.projects.find(p => p.id === this.activeProjectId);
      if (project) {
        await this.plugin.taskSync.deleteTaskMarkdown(task, project.name);
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
    return this.tasks.find(t => t.id === id);
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
