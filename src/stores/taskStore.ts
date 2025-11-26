import type ProjectPlannerPlugin from "../main";
import type { PlannerTask } from "../types";

interface StoredDataV1 {
  tasks?: PlannerTask[]; // legacy single-project
}

interface StoredDataV2 {
  tasksByProject?: Record<string, PlannerTask[]>;
}

type StoredData = StoredDataV1 & StoredDataV2;

export class TaskStore {
  private plugin: ProjectPlannerPlugin;

  private tasks: PlannerTask[] = []; // current project tasks
  private tasksByProject: Record<string, PlannerTask[]> = {};

  constructor(plugin: ProjectPlannerPlugin) {
    this.plugin = plugin;
  }

  // Load tasks for the current active project
  async load() {
    const raw = (await this.plugin.loadData()) as StoredData | null;

    this.tasksByProject = raw?.tasksByProject || {};

    const activeProjectId = this.plugin.settings.activeProjectId;
    if (!activeProjectId) {
      this.tasks = [];
      return;
    }

    // MIGRATION: If we have legacy "tasks" and no project-specific tasks yet
    if (!this.tasksByProject[activeProjectId]) {
      if (raw?.tasks && raw.tasks.length > 0) {
        // Move legacy tasks into current project
        this.tasksByProject[activeProjectId] = raw.tasks;
      } else {
        this.tasksByProject[activeProjectId] = [];
      }
    }

    this.tasks = this.tasksByProject[activeProjectId];
  }

  private async save() {
    const activeProjectId = this.plugin.settings.activeProjectId;
    if (!activeProjectId) return;

    // Ensure current project tasks are stored
    this.tasksByProject[activeProjectId] = this.tasks;

    const toSave: StoredDataV2 = {
      tasksByProject: this.tasksByProject,
    };

    await this.plugin.saveData(toSave);
  }

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
      // add any other default fields you have
    };
    this.tasks.push(task);
    await this.save();
    return task;
  }

  async updateTask(id: string, partial: Partial<PlannerTask>) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return;

    // Keep status <-> completed consistent (you already have this logic)
    if (partial.status !== undefined) {
      partial.completed = partial.status === "Completed";
    }
    if (partial.completed !== undefined) {
      partial.status = partial.completed ? "Completed" : "Not Started";
    }

    Object.assign(task, partial);
    await this.save();
  }

  async deleteTask(id: string) {
    // Remove task and its subtasks if you support hierarchy
    this.tasks = this.tasks.filter(
      (t) => t.id !== id && t.parentId !== id
    );
    await this.save();
  }

  async setOrder(ids: string[]) {
    const idToTask = new Map(this.tasks.map((t) => [t.id, t]));
    this.tasks = ids.map((id) => idToTask.get(id)).filter(Boolean) as PlannerTask[];
    await this.save();
  }

  // You already have these; keep the signatures the same.
  async toggleCollapsed(id: string) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return;
    task.collapsed = !task.collapsed;
    await this.save();
  }

  async makeSubtask(taskId: string, parentId: string) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.parentId = parentId;
    await this.save();
  }

  async promoteSubtask(taskId: string) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.parentId = null;
    await this.save();
  }
}
