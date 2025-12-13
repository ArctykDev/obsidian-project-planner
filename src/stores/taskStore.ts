import type ProjectPlannerPlugin from "../main";
import type { PlannerTask } from "../types";

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
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------

  getAll(): PlannerTask[] {
    return this.tasks;
  }

  async addTask(title: string): Promise<PlannerTask> {
    const task: PlannerTask = {
      id: crypto.randomUUID(),
      title,
      status: "Not Started",
      priority: "Medium",
      completed: false,
      parentId: null,
      collapsed: false,
    };

    this.tasks.push(task);
    await this.save();
    return task;
  }

  async updateTask(id: string, partial: Partial<PlannerTask>): Promise<void> {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return;

    // Bidirectional sync: status takes precedence
    if (partial.status !== undefined) {
      partial.completed = partial.status === "Completed";
    } else if (partial.completed !== undefined) {
      partial.status = partial.completed ? "Completed" : "Not Started";
    }

    Object.assign(task, partial);
    await this.save();
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks = this.tasks.filter(
      (t) => t.id !== id && t.parentId !== id
    );
    await this.save();
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

  async promoteSubtask(taskId: string): Promise<void> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.parentId = null;
    await this.save();
  }
}
