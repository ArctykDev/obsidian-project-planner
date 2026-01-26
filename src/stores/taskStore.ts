import type ProjectPlannerPlugin from "../main";
import type { PlannerTask } from "../types";

// Helper to get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
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

  private async save(): Promise<void> {
    const projectId = this.activeProjectId;
    if (!projectId) return;

    // Update current project bucket
    this.tasksByProject[projectId] = this.tasks;

    // Merge with existing plugin data
    const raw = ((await this.plugin.loadData()) || {}) as StoredData;
    raw.tasksByProject = this.tasksByProject;

    await this.plugin.saveData(raw);
    this.emit();
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
      // Update instead of adding duplicate
      Object.assign(existing, task);
      // Preserve lastModifiedDate from the task object (don't overwrite with today)
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
    const raw = ((await this.plugin.loadData()) || {}) as StoredData;
    raw.tasksByProject = this.tasksByProject;
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

    // Bidirectional sync: status takes precedence
    if (partial.status !== undefined) {
      partial.completed = partial.status === "Completed";
    } else if (partial.completed !== undefined) {
      partial.status = partial.completed ? "Completed" : task.status || "Not Started";
    }

    // Set last modified timestamp
    partial.lastModifiedDate = getTodayDate();

    Object.assign(task, partial);
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
  }

  async deleteTask(id: string): Promise<void> {
    // Get task before deleting for sync purposes
    const task = this.tasks.find(t => t.id === id);

    // Find children of the task being deleted
    const children = this.tasks.filter(t => t.parentId === id);

    // Promote children to top-level tasks (orphan handling)
    for (const child of children) {
      child.parentId = null;
    }

    // Remove the task itself
    this.tasks = this.tasks.filter(t => t.id !== id);

    this.updateProjectTimestamp();
    await this.save();

    // Delete markdown note if enabled
    if (task && this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
      const project = this.plugin.settings.projects.find(p => p.id === this.activeProjectId);
      if (project) {
        await this.plugin.taskSync.deleteTaskMarkdown(task, project.name);
      }
    }
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
    task.parentId = parentId;
    await this.save();
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
    task.parentId = null;
    await this.save();
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
