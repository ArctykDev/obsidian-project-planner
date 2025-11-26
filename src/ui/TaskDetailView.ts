import { ItemView, WorkspaceLeaf } from "obsidian";
import type ProjectPlannerPlugin from "../main";
import type { PlannerTask } from "../types";

export const VIEW_TYPE_TASK_DETAIL = "project-planner-task-detail";

// Strongly typed priorities
const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

// Strongly typed statuses
const STATUSES = ["Not Started", "In Progress", "Blocked", "Completed"] as const;

export class TaskDetailView extends ItemView {
  private plugin: ProjectPlannerPlugin;
  private task: PlannerTask | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ProjectPlannerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_TASK_DETAIL;
  }

  getDisplayText() {
    return "Task Details";
  }

  // Called when GridView selects a task
  setTask(task: PlannerTask) {
    this.task = task;
    this.render();
  }

  async onOpen() {
    this.render();
  }

  async onClose() {
    this.containerEl.empty();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  render() {
    const container = this.containerEl;
    container.empty();
    container.addClass("planner-detail-wrapper");

    if (!this.task) {
      container.createEl("div", { text: "No task selected." });
      return;
    }

    const task = this.task;

    //
    // TITLE — editable
    //
    container.createEl("h2", { text: "Task Title" });
    this.createEditableInput(container, task.title, async (val) => {
      await this.update({ title: val });
    });

    //
    // STATUS — dropdown
    //
    container.createEl("h3", { text: "Status" });
    this.createEditableSelect(container, task.status, STATUSES, async (val) => {
      await this.update({ status: val });
    });

    //
    // PRIORITY — dropdown
    //
    container.createEl("h3", { text: "Priority" });
    this.createEditableSelect(
      container,
      task.priority || "Medium",
      PRIORITIES,
      async (val) => {
        await this.update({ priority: val });
      }
    );

    //
    // START DATE / TIME
    //
    container.createEl("h3", { text: "Start Date / Time" });
    this.createEditableDateTime(container, task.startDate, async (val) => {
      await this.update({ startDate: val });
    });

    //
    // DUE DATE / TIME
    //
    container.createEl("h3", { text: "Due Date / Time" });
    this.createEditableDateTime(container, task.dueDate, async (val) => {
      await this.update({ dueDate: val });
    });

    //
    // DESCRIPTION
    //
    container.createEl("h3", { text: "Description" });
    this.createEditableTextarea(
      container,
      task.description || "",
      async (val) => {
        await this.update({ description: val });
      }
    );

    //
    // CHECKLIST / SUBTASKS
    //
    container.createEl("h3", { text: "Checklist" });

    const checklistWrapper = container.createDiv("planner-subtask-list");
    const subtasks = task.subtasks ?? [];

    if (subtasks.length === 0) {
      checklistWrapper.createEl("div", {
        text: "No checklist items. Use the button below to add one.",
        cls: "planner-subtask-empty",
      });
    } else {
      for (const sub of subtasks) {
        this.renderSubtaskRow(checklistWrapper, sub.id);
      }
    }

    const addBtn = container.createEl("button", {
      cls: "planner-subtask-add",
      text: "Add checklist item",
    });

    addBtn.onclick = async () => {
      if (!this.task) return;

      const current = this.task.subtasks ?? [];
      const newSubtasks = [
        ...current,
        {
          id: this.createSubtaskId(),
          title: "New checklist item",
          completed: false,
        },
      ];

      await this.update({ subtasks: newSubtasks });
    };
  }

  // Render a single subtask row by id (uses latest task state)
  private renderSubtaskRow(parent: HTMLElement, subtaskId: string) {
    if (!this.task) return;

    const subtasks = this.task.subtasks ?? [];
    const sub = subtasks.find((s) => s.id === subtaskId);
    if (!sub) return;

    const row = parent.createDiv("planner-subtask-row");

    // Checkbox
    const checkbox = row.createEl("input", {
      attr: { type: "checkbox" },
    });
    checkbox.checked = !!sub.completed;

    checkbox.onchange = async () => {
      if (!this.task) return;

      const updated = (this.task.subtasks ?? []).map((s) =>
        s.id === sub.id ? { ...s, completed: checkbox.checked } : s
      );
      await this.update({ subtasks: updated });
    };

    // Title (click-to-edit)
    const titleSpan = row.createEl("span", {
      text: sub.title,
      cls: "planner-subtask-title",
    });

    if (sub.completed) {
      titleSpan.classList.add("planner-subtask-completed");
    }

    titleSpan.onclick = () => {
      // Inline editor
      const input = row.createEl("input", {
        attr: { type: "text" },
        cls: "planner-subtask-input",
      });

      input.value = sub.title;
      titleSpan.replaceWith(input);
      input.focus();
      input.select();

      const commit = async () => {
        if (!this.task) return;

        const newTitle = input.value.trim() || sub.title;
        const updated = (this.task.subtasks ?? []).map((s) =>
          s.id === sub.id ? { ...s, title: newTitle } : s
        );
        await this.update({ subtasks: updated });
      };

      input.onblur = () => void commit();
      input.onkeydown = (e) => {
        if (e.key === "Enter") void commit();
        if (e.key === "Escape") this.render(); // revert
      };
    };

    // Delete button
    const delBtn = row.createEl("button", {
      text: "✕",
      cls: "planner-subtask-delete",
    });

    delBtn.onclick = async () => {
      if (!this.task) return;

      const updated = (this.task.subtasks ?? []).filter((s) => s.id !== sub.id);
      await this.update({ subtasks: updated });
    };
  }

  // ---------------------------------------------------------------------------
  // Update Helper – delegates to plugin.updateTask(...)
  // ---------------------------------------------------------------------------

  private async update(fields: Partial<PlannerTask>) {
    if (!this.task) return;

    await this.plugin.updateTask(this.task.id, fields);

    // Keep local copy in sync
    this.task = { ...this.task, ...fields };

    // Re-render panel
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Editable Controls
  // ---------------------------------------------------------------------------

  private createEditableInput(
    container: HTMLElement,
    value: string,
    onSave: (val: string) => Promise<void>
  ) {
    const input = container.createEl("input", {
      attr: { type: "text" },
    });

    input.value = value;
    input.classList.add("planner-detail-input");

    const commit = () => onSave(input.value.trim());

    input.onblur = commit;
    input.onkeydown = (e) => {
      if (e.key === "Enter") commit();
    };
  }

  private createEditableTextarea(
    container: HTMLElement,
    value: string,
    onSave: (val: string) => Promise<void>
  ) {
    const area = container.createEl("textarea", {
      cls: "planner-detail-textarea",
    });

    area.value = value;

    area.onblur = () => {
      void onSave(area.value.trim());
    };
  }

  private createEditableSelect<T extends string>(
    container: HTMLElement,
    value: T,
    options: readonly T[],
    onSave: (val: T) => Promise<void>
  ) {
    const select = container.createEl("select", {
      cls: "planner-detail-select",
    });

    for (const opt of options) {
      const optionEl = select.createEl("option", { text: opt });
      if (opt === value) optionEl.selected = true;
    }

    select.onchange = () => {
      void onSave(select.value as T);
    };
  }

  private createEditableDateTime(
    container: HTMLElement,
    value: string | undefined,
    onSave: (val: string) => Promise<void>
  ) {
    const input = container.createEl("input", {
      attr: { type: "datetime-local" },
      cls: "planner-detail-date",
    });

    if (value) {
      input.value = new Date(value).toISOString().slice(0, 16);
    }

    input.onchange = () => {
      const iso = input.value ? new Date(input.value).toISOString() : "";
      void onSave(iso);
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private createSubtaskId(): string {
    // Browser crypto if available, fallback to timestamp/random
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
