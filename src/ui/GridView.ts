import { ItemView, WorkspaceLeaf, Menu } from "obsidian";
import type ProjectPlannerPlugin from "../main";
import type { PlannerTask, TaskStatus } from "../types";
import { TaskStore } from "../stores/taskStore";

export const GRID_VIEW_ICON = "layout-grid";

type SortKey =
  | "Manual"
  | "Title"
  | "Priority"
  | "Status"
  | "StartDate"
  | "DueDate";

// Strongly typed priorities
const PRIORITIES: NonNullable<PlannerTask["priority"]>[] = [
  "Low",
  "Medium",
  "High",
  "Critical",
];

// Strongly typed statuses
const STATUSES: TaskStatus[] = [
  "Not Started",
  "In Progress",
  "Blocked",
  "Completed",
];

interface VisibleRow {
  task: PlannerTask;
  isChild: boolean;
  hasChildren: boolean;
}

export class GridView extends ItemView {
  private plugin: ProjectPlannerPlugin;
  private taskStore: TaskStore;

  private currentFilters = {
    status: "All",
    priority: "All",
    search: "",
    sortKey: "Manual" as SortKey, // default to Manual so drag/drop order is used
    sortDirection: "asc" as "asc" | "desc",
  };

  private visibleRows: VisibleRow[] = [];
  private currentDragId: string | null = null;
  private numberingMap: Map<string, number> = new Map();

  // manual-dnd state
  private dragTargetTaskId: string | null = null;
  private dragInsertAfter: boolean = false;

  // Column sizing + advanced sorting
  private columnWidths: Record<string, number> = {};
  private secondarySortKeys: SortKey[] = [];

  constructor(leaf: WorkspaceLeaf, plugin: ProjectPlannerPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.taskStore = new TaskStore(plugin);
  }

  // Allow plugin / detail view to update tasks
  public async updateTask(id: string, fields: Partial<PlannerTask>) {
    await this.taskStore.updateTask(id, fields);
    this.render();
  }

  async onOpen() {
    this.loadGridViewSettings();
    await this.taskStore.load();
    this.render();
  }

  async onClose() {
    this.containerEl.empty();
  }

  getViewType() {
    return "project-planner-view";
  }

  getDisplayText() {
    return "Project Planner";
  }

  getIcon(): string {
    return GRID_VIEW_ICON;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  render() {
    const container = this.containerEl;
    container.empty();

    const wrapper = container.createDiv("planner-grid-wrapper");

    // -----------------------------------------------------------------------
    // Header
    // -----------------------------------------------------------------------
    const header = wrapper.createDiv("planner-grid-header");
    header.createEl("h2", { text: "Project Planner — Grid View" });

    // -----------------------------------------------------------------------
    // Project switcher
    // -----------------------------------------------------------------------
    const projectContainer = header.createDiv("planner-project-switcher");

    projectContainer.createSpan({
      text: "Project:",
      cls: "planner-project-label",
    });

    const projectSelect = projectContainer.createEl("select", {
      cls: "planner-project-select",
    });

    const pluginAny = this.plugin as any;
    const settings = pluginAny.settings || {};
    const projects = (settings.projects as { id: string; name: string }[]) || [];
    let activeProjectId = settings.activeProjectId as string | undefined;

    if (!activeProjectId && projects.length > 0) {
      activeProjectId = projects[0].id;
      settings.activeProjectId = activeProjectId;
      pluginAny.settings = settings;
      if (typeof pluginAny.saveSettings === "function") {
        void pluginAny.saveSettings();
      }
    }

    if (projects.length === 0) {
      projectSelect.createEl("option", {
        text: "No projects",
      });
      projectSelect.disabled = true;
    } else {
      for (const p of projects) {
        const opt = projectSelect.createEl("option", {
          text: p.name,
          value: p.id,
        });
        if (p.id === activeProjectId) {
          opt.selected = true;
        }
      }

      projectSelect.onchange = async () => {
        const newId = projectSelect.value;
        settings.activeProjectId = newId;
        pluginAny.settings = settings;
        if (typeof pluginAny.saveSettings === "function") {
          await pluginAny.saveSettings();
        }
        await this.taskStore.load();
        this.render();
      };
    }

    const addBtn = header.createEl("button", {
      cls: "planner-add-btn",
      text: "Add Task",
    });

    addBtn.onclick = async () => {
      await this.taskStore.addTask("New Task");
      this.render();
    };

    // -----------------------------------------------------------------------
    // Filtering + Sorting
    // -----------------------------------------------------------------------
    const filterBar = wrapper.createDiv("planner-filter-bar");

    const statusFilter = filterBar.createEl("select", {
      cls: "planner-filter",
    });
    ["All", ...STATUSES].forEach((s) =>
      statusFilter.createEl("option", { text: s })
    );
    statusFilter.value = this.currentFilters.status;

    const priorityFilter = filterBar.createEl("select", {
      cls: "planner-filter",
    });
    ["All", ...PRIORITIES].forEach((p) =>
      priorityFilter.createEl("option", { text: p })
    );
    priorityFilter.value = this.currentFilters.priority;

    const searchInput = filterBar.createEl("input", {
      cls: "planner-search",
      attr: { type: "text", placeholder: "Search tasks..." },
    });
    searchInput.value = this.currentFilters.search;

    const sortContainer = filterBar.createDiv("planner-sort-container");
    const sortSelect = sortContainer.createEl("select", {
      cls: "planner-filter",
    });
    ["Manual", "Title", "Priority", "Status", "StartDate", "DueDate"].forEach(
      (k) => sortSelect.createEl("option", { text: k })
    );
    sortSelect.value = this.currentFilters.sortKey;

    const sortDirBtn = sortContainer.createEl("button", {
      cls: "planner-sort-btn",
      text: this.currentFilters.sortDirection === "asc" ? "Asc" : "Desc",
    });

    sortDirBtn.onclick = () => {
      this.currentFilters.sortDirection =
        this.currentFilters.sortDirection === "asc" ? "desc" : "asc";
      this.secondarySortKeys = [];
      this.saveGridViewSettings();
      this.render();
    };

    const applyFilters = () => {
      this.currentFilters = {
        status: statusFilter.value,
        priority: priorityFilter.value,
        search: searchInput.value.toLowerCase(),
        sortKey: sortSelect.value as SortKey,
        sortDirection: this.currentFilters.sortDirection,
      };
      this.secondarySortKeys = [];
      this.saveGridViewSettings();
      this.render();
    };

    statusFilter.onchange =
      priorityFilter.onchange =
      sortSelect.onchange =
      searchInput.oninput =
      () => applyFilters();

    // -----------------------------------------------------------------------
    // Build visible hierarchy (with filters + sort)
    // -----------------------------------------------------------------------
    const all = this.taskStore.getAll();
    const matchesFilter = new Map<string, boolean>();
    const f = this.currentFilters;

    for (const t of all) {
      let match = true;

      if (f.status !== "All" && t.status !== f.status) match = false;
      if (f.priority !== "All" && (t.priority || "Medium") !== f.priority)
        match = false;
      if (f.search.trim() !== "" && !t.title.toLowerCase().includes(f.search))
        match = false;

      matchesFilter.set(t.id, match);
    }

    const getSortValueForKey = (t: PlannerTask, key: SortKey) => {
      switch (key) {
        case "Title":
          return t.title.toLowerCase();
        case "Priority":
          return PRIORITIES.indexOf(t.priority || "Medium");
        case "Status":
          return STATUSES.indexOf(t.status);
        case "StartDate":
          return t.startDate ? new Date(t.startDate).getTime() : 0;
        case "DueDate":
          return t.dueDate ? new Date(t.dueDate).getTime() : 0;
        case "Manual":
        default:
          return 0;
      }
    };

    const compareByKey = (
      a: PlannerTask,
      b: PlannerTask,
      key: SortKey,
      direction: "asc" | "desc"
    ) => {
      if (key === "Manual") return 0;
      const factor = direction === "asc" ? 1 : -1;
      const A = getSortValueForKey(a, key);
      const B = getSortValueForKey(b, key);
      if (A === B) return 0;
      return A! > B! ? factor : -factor;
    };

    const compareTasks = (a: PlannerTask, b: PlannerTask) => {
      const primaryKey = f.sortKey;
      const primaryDir = f.sortDirection;

      // Primary key
      if (primaryKey !== "Manual") {
        const res = compareByKey(a, b, primaryKey, primaryDir);
        if (res !== 0) return res;
      }

      // Secondary keys (always ascending)
      for (const key of this.secondarySortKeys) {
        if (key === primaryKey || key === "Manual") continue;
        const res = compareByKey(a, b, key, "asc");
        if (res !== 0) return res;
      }

      return 0;
    };

    // Roots: either keep manual order or apply sort
    const roots =
      f.sortKey === "Manual"
        ? all.filter((t) => !t.parentId)
        : all.filter((t) => !t.parentId).sort(compareTasks);

    const visibleRows: VisibleRow[] = [];

    for (const root of roots) {
      const children = all.filter((t) => t.parentId === root.id);
      const rootMatches = matchesFilter.get(root.id) ?? true;
      const matchingChildren = children.filter(
        (c) => matchesFilter.get(c.id) ?? true
      );

      const hasChildren = children.length > 0;

      if (!rootMatches && matchingChildren.length === 0) continue;

      visibleRows.push({
        task: root,
        isChild: false,
        hasChildren,
      });

      if (!root.collapsed) {
        const toRender = rootMatches ? children : matchingChildren;

        // Only sort children when not in Manual mode
        if (f.sortKey !== "Manual") {
          toRender.sort(compareTasks);
        }

        for (const child of toRender) {
          visibleRows.push({
            task: child,
            isChild: true,
            hasChildren: false,
          });
        }
      }
    }

    this.visibleRows = visibleRows;

    // -----------------------------------------------------------------------
    // Grid table
    // -----------------------------------------------------------------------
    const table = wrapper.createEl("table", {
      cls: "planner-grid-table",
    });

    const headerRow = table.createEl("tr");

    // Column definitions (allows sorting, resizing)
    const columns: {
      key: string;
      label: string;
      sortable: boolean;
      sortKey?: SortKey;
    }[] = [
        { key: "drag", label: "", sortable: false },
        { key: "number", label: "#", sortable: false },
        { key: "check", label: "", sortable: false },
        { key: "title", label: "Title", sortable: true, sortKey: "Title" },
        { key: "status", label: "Status", sortable: true, sortKey: "Status" },
        {
          key: "priority",
          label: "Priority",
          sortable: true,
          sortKey: "Priority",
        },
        {
          key: "start",
          label: "Start Date",
          sortable: true,
          sortKey: "StartDate",
        },
        { key: "due", label: "Due Date", sortable: true, sortKey: "DueDate" },
      ];

    columns.forEach((col, colIndex) => {
      const th = headerRow.createEl("th");
      th.style.position = "relative";

      // Apply saved width if any
      if (this.columnWidths[col.key] != null) {
        th.style.width = `${this.columnWidths[col.key]}px`;
      }

      // Label + sort indicator
      const labelSpan = th.createSpan({ text: col.label });
      if (col.sortable && col.sortKey) {
        const indicator = th.createSpan({
          cls: "planner-sort-indicator",
          text: "",
        });
        indicator.style.marginLeft = "4px";
      }

      // Sorting behavior (click / shift+click)
      if (col.sortable && col.sortKey) {
        th.addClass("planner-sortable");
        th.onclick = (evt) => {
          evt.stopPropagation();
          const clickedKey = col.sortKey as SortKey;

          if (evt.shiftKey) {
            // Multi-column sort: shift+click adds/reorders secondary keys
            if (this.currentFilters.sortKey === clickedKey) {
              // Toggle primary direction
              this.currentFilters.sortDirection =
                this.currentFilters.sortDirection === "asc" ? "desc" : "asc";
            } else {
              const idx = this.secondarySortKeys.indexOf(clickedKey);
              if (idx === -1) {
                this.secondarySortKeys.push(clickedKey);
              } else {
                this.secondarySortKeys.splice(idx, 1);
                this.secondarySortKeys.push(clickedKey);
              }
            }
          } else {
            // Normal sort: set primary, clear secondary
            if (this.currentFilters.sortKey === clickedKey) {
              this.currentFilters.sortDirection =
                this.currentFilters.sortDirection === "asc" ? "desc" : "asc";
            } else {
              this.currentFilters.sortKey = clickedKey;
              this.currentFilters.sortDirection = "asc";
            }
            this.secondarySortKeys = [];
          }

          this.saveGridViewSettings();
          this.render();
        };
      }

      // Column resizing + double-click auto-fit
      this.attachColumnResizer(th, col.key, table, colIndex);
    });

    this.updateSortIndicators(headerRow, columns);

    // -------------------------------------------------------
    // Generate Planner-style numbering (1, 2, 3, ...)
    // -------------------------------------------------------
    const numberingMap = new Map<string, number>();
    let counter = 1;

    for (const row of visibleRows) {
      numberingMap.set(row.task.id, counter++);
    }

    this.numberingMap = numberingMap;

    visibleRows.forEach((r, i) =>
      this.renderTaskRow(table, r.task, r.isChild, r.hasChildren, i)
    );
  }

  // ---------------------------------------------------------------------------
  // Render individual row
  // ---------------------------------------------------------------------------

  private renderTaskRow(
    table: HTMLTableElement,
    task: PlannerTask,
    isChild: boolean,
    hasChildren: boolean,
    index: number
  ) {
    const row = table.createEl("tr", {
      cls: isChild
        ? "planner-row planner-row-child"
        : "planner-row planner-row-parent",
    });

    row.dataset.taskId = task.id;
    row.dataset.rowIndex = String(index);

    // Right–click context menu
    row.oncontextmenu = (evt) => {
      evt.preventDefault();
      this.showTaskMenu(task, index, evt);
    };

    // ---------------------------------------------------------------------
    // Drag handle cell — FIRST column
    // ---------------------------------------------------------------------
    const dragCell = row.createEl("td", { cls: "planner-drag-cell" });

    const dragHandle = dragCell.createSpan({
      cls: "planner-drag-handle",
      text: "⋮⋮",
    });

    dragHandle.onpointerdown = (evt: PointerEvent) => {
      evt.preventDefault();
      evt.stopPropagation();

      const rowRect = row.getBoundingClientRect();

      // Create ghost row
      const ghost = document.createElement("div");
      ghost.className = "planner-row-ghost";
      ghost.style.position = "fixed";
      ghost.style.left = `${rowRect.left}px`;
      ghost.style.top = `${rowRect.top}px`;
      ghost.style.width = `${rowRect.width}px`;
      ghost.style.pointerEvents = "none";
      ghost.style.zIndex = "9998";
      ghost.style.opacity = "0.9";
      ghost.style.background =
        getComputedStyle(row).backgroundColor || "var(--background-primary)";
      ghost.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.25)";

      const inner = row.cloneNode(true) as HTMLElement;
      inner.classList.remove("planner-row-dragging");
      ghost.appendChild(inner);

      // Create drop indicator line
      const indicator = document.createElement("div");
      indicator.className = "planner-drop-indicator";
      indicator.style.position = "fixed";
      indicator.style.height = "2px";
      indicator.style.backgroundColor = "var(--interactive-accent)";
      indicator.style.pointerEvents = "none";
      indicator.style.zIndex = "9999";
      indicator.style.left = `${rowRect.left}px`;
      indicator.style.width = `${rowRect.width}px`;
      indicator.style.display = "none";

      document.body.appendChild(ghost);
      document.body.appendChild(indicator);

      this.currentDragId = task.id;
      this.dragTargetTaskId = null;
      this.dragInsertAfter = false;

      row.classList.add("planner-row-dragging");
      document.body.style.userSelect = "none";
      (document.body.style as any).webkitUserSelect = "none";
      document.body.style.cursor = "grabbing";

      const offsetY = evt.clientY - rowRect.top;

      const onMove = (moveEvt: PointerEvent) => {
        moveEvt.preventDefault();

        const y = moveEvt.clientY - offsetY;
        ghost.style.top = `${y}px`;

        const targetEl = document.elementFromPoint(
          moveEvt.clientX,
          moveEvt.clientY
        ) as HTMLElement | null;

        const targetRow = targetEl?.closest("tr.planner-row") as
          | HTMLTableRowElement
          | null;

        if (!targetRow || !targetRow.dataset.taskId) {
          indicator.style.display = "none";
          this.dragTargetTaskId = null;
          return;
        }

        const targetRect = targetRow.getBoundingClientRect();
        const before =
          moveEvt.clientY < targetRect.top + targetRect.height / 2;

        indicator.style.display = "block";
        indicator.style.left = `${targetRect.left}px`;
        indicator.style.width = `${targetRect.width}px`;
        indicator.style.top = before
          ? `${targetRect.top}px`
          : `${targetRect.bottom}px`;

        this.dragTargetTaskId = targetRow.dataset.taskId;
        this.dragInsertAfter = !before;
      };

      const onUp = async (upEvt: PointerEvent) => {
        upEvt.preventDefault();

        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);

        ghost.remove();
        indicator.remove();

        row.classList.remove("planner-row-dragging");
        document.body.style.userSelect = "";
        (document.body.style as any).webkitUserSelect = "";
        document.body.style.cursor = "";

        const dragId = this.currentDragId;
        const targetId = this.dragTargetTaskId;
        const insertAfter = this.dragInsertAfter;

        this.currentDragId = null;
        this.dragTargetTaskId = null;
        this.dragInsertAfter = false;

        if (dragId && targetId && dragId !== targetId) {
          await this.handleDrop(dragId, targetId, insertAfter);
        }
      };

      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
    };

    // Number cell (Planner style)
    const numberCell = row.createEl("td", { cls: "planner-num-cell" });
    numberCell.setText(String(this.numberingMap.get(task.id) || ""));

    // ---------------------------------------------------------------------
    // Checkbox cell
    // ---------------------------------------------------------------------
    const completeCell = row.createEl("td", { cls: "planner-complete-cell" });

    const checkbox = completeCell.createEl("input", {
      attr: { type: "checkbox" },
    });
    checkbox.checked = !!task.completed;

    checkbox.onchange = async (ev) => {
      ev.stopPropagation();
      const isDone = checkbox.checked;
      await this.taskStore.updateTask(task.id, {
        completed: isDone,
        status: isDone ? "Completed" : "Not Started",
      });
      this.render();
    };

    // ---------------------------------------------------------------------
    // Title cell: caret + title + menu
    // ---------------------------------------------------------------------
    const titleCell = row.createEl("td", {
      cls: isChild ? "planner-title-cell subtask" : "planner-title-cell",
    });

    // Caret for parent tasks
    if (!isChild && hasChildren) {
      const caret = titleCell.createSpan({
        cls: "planner-expand-toggle",
        text: task.collapsed ? "▸" : "▾",
      });
      caret.onclick = async (evt) => {
        evt.stopPropagation();
        await this.taskStore.toggleCollapsed(task.id);
        this.render();
      };
    } else {
      titleCell.createSpan({
        cls: "planner-expand-spacer",
        text: "",
      });
    }

    // Title text (editable)
    const titleInner = titleCell.createDiv({ cls: "planner-title-inner" });
    const titleSpan = this.createEditableTextSpan(
      titleInner,
      task.title,
      async (value) => {
        await this.taskStore.updateTask(task.id, { title: value });
        this.render();
      }
    );

    // Bold only if this is a parent that has children
    if (!isChild && hasChildren) {
      titleSpan.classList.add("planner-parent-bold");
    }
    if (task.completed) {
      titleSpan.classList.add("planner-task-completed");
    }

    // 3-dots menu (hover-visible via CSS)
    const titleMenuBtn = titleCell.createEl("button", {
      cls: "planner-task-menu",
      text: "⋯",
    });

    titleMenuBtn.onclick = (evt) => {
      evt.stopPropagation();
      this.buildInlineMenu(task, evt);
    };

    // ---------------------------------------------------------------------
    // Status
    // ---------------------------------------------------------------------
    const statusCell = row.createEl("td");
    this.createEditableSelectCell(
      statusCell,
      task.status,
      STATUSES,
      async (value) => {
        await this.taskStore.updateTask(task.id, { status: value });
        this.render();
      },
      (val, target) => this.createPill("status", val, target)
    );

    // ---------------------------------------------------------------------
    // Priority
    // ---------------------------------------------------------------------
    const priorityCell = row.createEl("td");
    this.createEditableSelectCell(
      priorityCell,
      task.priority || "Medium",
      PRIORITIES,
      async (value) => {
        await this.taskStore.updateTask(task.id, { priority: value });
        this.render();
      },
      (val, target) => this.createPill("priority", val, target)
    );

    // ---------------------------------------------------------------------
    // Start Date
    // ---------------------------------------------------------------------
    const startCell = row.createEl("td");
    this.createEditableDateOnlyCell(
      startCell,
      task.startDate || "",
      async (value) => {
        await this.taskStore.updateTask(task.id, { startDate: value });
        this.render();
      }
    );

    // ---------------------------------------------------------------------
    // Due Date
    // ---------------------------------------------------------------------
    const dueCell = row.createEl("td");
    this.createEditableDateOnlyCell(
      dueCell,
      task.dueDate || "",
      async (value) => {
        await this.taskStore.updateTask(task.id, { dueDate: value });
        this.render();
      }
    );
  }

  // ---------------------------------------------------------------------------
  // 3-dots inline menu used by title cell
  // ---------------------------------------------------------------------------

  private buildInlineMenu(task: PlannerTask, evt: MouseEvent) {
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle("Open details")
        .setIcon("pencil")
        .onClick(() => this.plugin.openTaskDetail(task))
    );

    menu.addItem((item) =>
      item
        .setTitle("Add new task above")
        .setIcon("plus")
        .onClick(async () => {
          const rowIndex = this.visibleRows.findIndex(
            (r) => r.task.id === task.id
          );
          await this.addTaskAbove(task, rowIndex);
        })
    );

    menu.addItem((item) =>
      item
        .setTitle("Make subtask")
        .setIcon("arrow-right")
        .onClick(async () => {
          const rowIndex = this.visibleRows.findIndex(
            (r) => r.task.id === task.id
          );
          if (rowIndex <= 0) return;
          await this.handleMakeSubtask(task, rowIndex);
          this.render();
        })
    );

    menu.addItem((item) =>
      item
        .setTitle("Promote to parent")
        .setIcon("arrow-left")
        .setDisabled(!task.parentId)
        .onClick(async () => {
          if (!task.parentId) return;
          await this.taskStore.promoteSubtask(task.id);
          this.render();
        })
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle("Delete task")
        .setIcon("trash")
        .onClick(async () => {
          await this.taskStore.deleteTask(task.id);
          this.render();
        })
    );

    menu.showAtMouseEvent(evt);
  }

  // ---------------------------------------------------------------------------
  // Context menu (right-click) mirrors 3-dots menu
  // ---------------------------------------------------------------------------

  private showTaskMenu(task: PlannerTask, rowIndex: number, evt: MouseEvent) {
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle("Open details")
        .setIcon("pencil")
        .onClick(() => this.plugin.openTaskDetail(task))
    );

    menu.addItem((item) =>
      item
        .setTitle("Add new task above")
        .setIcon("plus")
        .onClick(async () => {
          await this.addTaskAbove(task, rowIndex);
        })
    );

    const canMakeSubtask = rowIndex > 0;
    const canPromote = !!task.parentId;

    menu.addItem((item) =>
      item
        .setTitle("Make subtask")
        .setIcon("indent")
        .setDisabled(!canMakeSubtask)
        .onClick(async () => {
          if (!canMakeSubtask) return;
          await this.handleMakeSubtask(task, rowIndex);
          this.render();
        })
    );

    menu.addItem((item) =>
      item
        .setTitle("Promote subtask")
        .setIcon("unindent")
        .setDisabled(!canPromote)
        .onClick(async () => {
          if (!canPromote) return;
          await this.taskStore.promoteSubtask(task.id);
          this.render();
        })
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle("Delete task")
        .setIcon("trash")
        .onClick(async () => {
          await this.taskStore.deleteTask(task.id);
          this.render();
        })
    );

    menu.showAtMouseEvent(evt);
  }

  // ---------------------------------------------------------------------------
  // Make subtask (indent)
  // ---------------------------------------------------------------------------

  private async handleMakeSubtask(task: PlannerTask, rowIndex: number) {
    if (rowIndex <= 0) return;

    const aboveRow = this.visibleRows[rowIndex - 1];
    if (!aboveRow) return;

    const all = this.taskStore.getAll();
    let parent: PlannerTask | undefined;

    if (aboveRow.task.parentId) {
      parent =
        all.find((t) => t.id === aboveRow.task.parentId) ?? aboveRow.task;
    } else {
      parent = aboveRow.task;
    }

    if (!parent || parent.id === task.id) return;

    await this.taskStore.makeSubtask(task.id, parent.id);
  }

  // ---------------------------------------------------------------------------
  // Add new task above
  // ---------------------------------------------------------------------------

  private async addTaskAbove(task: PlannerTask, _rowIndex: number) {
    const all = this.taskStore.getAll();
    const allIds = all.map((t) => t.id);

    // Determine insertion index in global order
    const targetIndex = allIds.indexOf(task.id);
    const insertIndex = targetIndex >= 0 ? targetIndex : 0;

    // Create as root-level first
    const newTask = await this.taskStore.addTask("New Task");

    // If the existing task is a subtask, assign the new task the same parent
    if (task.parentId) {
      await this.taskStore.updateTask(newTask.id, {
        parentId: task.parentId,
      });
    } else {
      await this.taskStore.updateTask(newTask.id, {
        parentId: null,
      });
    }

    // Re-fetch and adjust ordering
    const updated = this.taskStore.getAll();
    const updatedIds = updated.map((t) => t.id);

    const newIndex = updatedIds.indexOf(newTask.id);
    if (newIndex !== -1) {
      updatedIds.splice(newIndex, 1);
    }
    updatedIds.splice(insertIndex, 0, newTask.id);

    await this.taskStore.setOrder(updatedIds);

    this.render();
    this.focusNewTaskTitleImmediate(newTask.id);
  }

  // Helper: Focus the title input of the newly created task
  private focusNewTaskTitleImmediate(taskId: string) {
    setTimeout(() => {
      const titleEl = this.containerEl.querySelector(
        `tr[data-task-id="${taskId}"] .planner-title-inner .planner-editable`
      ) as HTMLElement | null;

      if (titleEl) {
        titleEl.click(); // activates inline editing
      }
    }, 30);
  }

  // ---------------------------------------------------------------------------
  // Drag-and-drop reordering (Planner-style blocks, manual DnD)
  // ---------------------------------------------------------------------------

  private async handleDrop(
    dragId: string,
    targetId: string,
    insertAfter: boolean
  ) {
    const tasks = this.taskStore.getAll();
    const dragTask = tasks.find((t) => t.id === dragId);
    const targetTask = tasks.find((t) => t.id === targetId);

    if (!dragTask || !targetTask) return;
    if (dragTask.id === targetTask.id) return;

    const ids = tasks.map((t) => t.id);

    // Parent drag: move parent + its children as a contiguous block
    if (!dragTask.parentId) {
      const blockIds: string[] = [];
      blockIds.push(dragTask.id);
      for (const t of tasks) {
        if (t.parentId === dragTask.id) {
          blockIds.push(t.id);
        }
      }

      // If target is inside the same block, ignore
      if (blockIds.includes(targetTask.id)) return;

      const targetRootId = targetTask.parentId || targetTask.id;

      // If dropping onto one of own children, ignore
      if (blockIds.includes(targetRootId)) return;

      // Remove block from ids
      const firstIdx = ids.indexOf(blockIds[0]);
      if (firstIdx === -1) return;
      ids.splice(firstIdx, blockIds.length);

      // Find target root index in the remaining list
      let targetRootIndex = ids.indexOf(targetRootId);
      if (targetRootIndex === -1) {
        targetRootIndex = ids.length;
      }

      // If inserting after, move index to after the entire target block
      if (insertAfter && targetRootIndex < ids.length) {
        let endIndex = targetRootIndex;
        for (let i = targetRootIndex + 1; i < ids.length; i++) {
          const t = tasks.find((task) => task.id === ids[i]);
          if (t && t.parentId === targetRootId) {
            endIndex = i;
          } else {
            break;
          }
        }
        targetRootIndex = endIndex + 1;
      }

      ids.splice(targetRootIndex, 0, ...blockIds);
      await this.taskStore.setOrder(ids);
      this.render();
      return;
    }

    // Child drag: move single subtask (simple global reorder based on ids)
    const fromIndex = ids.indexOf(dragId);
    if (fromIndex === -1) return;
    ids.splice(fromIndex, 1);

    let insertIndex = ids.indexOf(targetId);
    if (insertIndex === -1) {
      insertIndex = ids.length;
    } else if (insertAfter) {
      insertIndex += 1;
    }

    ids.splice(insertIndex, 0, dragId);

    await this.taskStore.setOrder(ids);
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Microsoft Planner style pills
  // ---------------------------------------------------------------------------

  private createPill(
    type: "priority" | "status",
    value: string,
    container: HTMLElement
  ) {
    const pill = container.createEl("span");
    const v = value.toLowerCase().replace(/\s+/g, "-");

    pill.className =
      type === "priority"
        ? `priority-pill priority-${v}`
        : `status-pill status-${v}`;

    pill.textContent = value;
    return pill;
  }

  // ---------------------------------------------------------------------------
  // Inline editing helpers
  // ---------------------------------------------------------------------------

  private createEditableTextSpan(
    container: HTMLElement,
    value: string,
    onSave: (value: string) => Promise<void> | void
  ): HTMLSpanElement {
    const span = container.createEl("span", { text: value });
    span.classList.add("planner-editable");

    const openEditor = () => {
      const input = container.createEl("input", {
        attr: { type: "text" },
      });

      input.value = value;
      input.classList.add("planner-input");
      span.replaceWith(input);

      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);

      const save = async () => {
        const newValue = input.value.trim();
        await onSave(newValue);

        value = newValue;
        const newSpan = container.createEl("span", { text: newValue });
        newSpan.classList.add("planner-editable");
        newSpan.onclick = openEditor;
        input.replaceWith(newSpan);
      };

      input.onblur = () => void save();
      input.onkeydown = (e) => {
        if (e.key === "Enter") void save();
        if (e.key === "Escape") input.replaceWith(span);
      };
    };

    span.onclick = openEditor;
    return span;
  }

  private createEditableSelectCell<T extends string>(
    container: HTMLElement,
    value: T,
    options: readonly T[],
    onSave: (value: T) => Promise<void> | void,
    renderDisplay?: (value: T, container: HTMLElement) => HTMLElement
  ) {
    let current = value;

    const setupDisplay = () => {
      container.empty();
      const el = renderDisplay
        ? renderDisplay(current, container)
        : container.createEl("span", { text: current });

      el.classList.add("planner-editable");
      el.onclick = openEditor;
    };

    const openEditor = () => {
      container.empty();

      const select = container.createEl("select");
      select.classList.add("planner-select");

      options.forEach((opt) => {
        const optionEl = select.createEl("option", { text: opt });
        if (opt === current) optionEl.selected = true;
      });

      select.focus();

      const save = async () => {
        current = select.value as T;
        await onSave(current);
        setupDisplay();
      };

      select.onblur = () => void save();
      select.onchange = () => void save();
    };

    setupDisplay();
  }

  // ---------------------------------------------------------------------------
  // Planner-style date-only editor with MM/DD/YYYY display
  // ---------------------------------------------------------------------------

  private createEditableDateOnlyCell(
    container: HTMLElement,
    value: string,
    onSave: (value: string) => Promise<void> | void
  ) {
    // Normalize to YYYY-MM-DD if we were given an ISO datetime
    let rawValue = value || "";
    if (rawValue.includes("T")) {
      rawValue = rawValue.slice(0, 10);
    }

    const isEmpty = !rawValue;

    const formatPlanner = (dateStr: string): string => {
      if (!dateStr) return "Set date";
      const parts = dateStr.split("-");
      if (parts.length !== 3) return "Set date";
      const [y, m, d] = parts;
      // Pure Planner-style MM/DD/YYYY
      return `${m}/${d}/${y}`;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getCompareDate = (dateStr: string | null): Date | null => {
      if (!dateStr) return null;
      const parts = dateStr.split("-");
      if (parts.length !== 3) return null;
      const [y, m, d] = parts;
      const dt = new Date(Number(y), Number(m) - 1, Number(d));
      dt.setHours(0, 0, 0, 0);
      return dt;
    };

    let pillClass = "planner-date-pill-neutral";

    if (!isEmpty) {
      const d = getCompareDate(rawValue);
      if (d) {
        const cmp = d.getTime() - today.getTime();
        if (cmp < 0) {
          pillClass = "planner-date-pill-overdue"; // red
        } else if (cmp === 0) {
          pillClass = "planner-date-pill-today"; // blue
        }
      }
    }

    const span = container.createEl("span", {
      text: formatPlanner(rawValue),
    });

    span.classList.add("planner-editable", "planner-date-pill", pillClass);

    if (isEmpty) {
      span.style.opacity = "0.6";
    }

    span.onclick = () => {
      const input = container.createEl("input", {
        attr: { type: "date" },
      });
      input.classList.add("planner-date");

      if (!isEmpty) {
        input.value = rawValue; // YYYY-MM-DD
      }

      span.remove();
      input.focus();

      const save = async () => {
        const newRaw = input.value; // YYYY-MM-DD or ""
        await onSave(newRaw);

        rawValue = newRaw;
        const newIsEmpty = !rawValue;

        input.replaceWith(span);
        span.setText(formatPlanner(rawValue));

        // Reset classes
        span.className = "planner-editable planner-date-pill";
        span.style.opacity = newIsEmpty ? "0.6" : "1";

        if (newIsEmpty) {
          span.classList.add("planner-date-pill-neutral");
        } else {
          const d = getCompareDate(rawValue);
          if (d) {
            if (d.getTime() < today.getTime()) {
              span.classList.add("planner-date-pill-overdue");
            } else if (d.getTime() === today.getTime()) {
              span.classList.add("planner-date-pill-today");
            } else {
              span.classList.add("planner-date-pill-neutral");
            }
          } else {
            span.classList.add("planner-date-pill-neutral");
          }
        }
      };

      input.onblur = () => void save();
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          void save();
        }
      };
    };
  }

  // ---------------------------------------------------------------------------
  // Column resizing + auto-fit
  // ---------------------------------------------------------------------------

  private attachColumnResizer(
    th: HTMLTableCellElement,
    columnKey: string,
    table: HTMLTableElement,
    columnIndex: number
  ) {
    const handle = th.createDiv("planner-col-resizer");
    handle.style.position = "absolute";
    handle.style.top = "0";
    handle.style.right = "-3px";
    handle.style.width = "6px";
    handle.style.cursor = "col-resize";
    handle.style.userSelect = "none";
    handle.style.height = "100%";

    let startX = 0;
    let startWidth = 0;

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(60, startWidth + delta);
      th.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";

      const finalWidth = th.offsetWidth;
      this.columnWidths[columnKey] = finalWidth;
      this.saveGridViewSettings();
    };

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      startX = e.clientX;
      startWidth = th.offsetWidth;

      document.body.style.cursor = "col-resize";

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });

    // Double-click on the handle: auto-fit
    handle.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.autoFitColumn(th, columnKey, table, columnIndex);
    });
  }

  private autoFitColumn(
    th: HTMLTableCellElement,
    columnKey: string,
    table: HTMLTableElement,
    columnIndex: number
  ) {
    let maxWidth = th.offsetWidth;

    const rows = Array.from(
      table.querySelectorAll("tr")
    ) as HTMLTableRowElement[];

    for (const row of rows) {
      const cell = row.children[columnIndex] as HTMLElement | undefined;
      if (!cell) continue;
      const cellWidth = cell.getBoundingClientRect().width;
      if (cellWidth > maxWidth) maxWidth = cellWidth;
    }

    th.style.width = `${maxWidth}px`;
    this.columnWidths[columnKey] = maxWidth;
    this.saveGridViewSettings();
  }

  // ---------------------------------------------------------------------------
  // Sort indicators
  // ---------------------------------------------------------------------------

  private updateSortIndicators(
    headerRow: HTMLTableRowElement,
    columns: { key: string; label: string; sortable: boolean; sortKey?: SortKey }[]
  ) {
    const cells = Array.from(headerRow.children) as HTMLTableCellElement[];

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const th = cells[i];
      const indicator = th.querySelector(
        ".planner-sort-indicator"
      ) as HTMLElement | null;

      if (!indicator || !col.sortable || !col.sortKey) continue;

      if (this.currentFilters.sortKey === col.sortKey) {
        indicator.textContent =
          this.currentFilters.sortDirection === "asc" ? "▲" : "▼";
        indicator.style.opacity = "1";
      } else if (this.secondarySortKeys.includes(col.sortKey)) {
        // Secondary keys: subtle indicator
        indicator.textContent = "▲";
        indicator.style.opacity = "0.4";
      } else {
        indicator.textContent = "";
        indicator.style.opacity = "0.2";
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Persist / load grid-view-specific settings (sort + column widths)
  // ---------------------------------------------------------------------------

  private loadGridViewSettings() {
    const pluginAny = this.plugin as any;
    const settings: any = pluginAny.settings;
    if (!settings) return;

    if (settings.gridViewColumnWidths) {
      this.columnWidths = { ...settings.gridViewColumnWidths };
    }

    if (settings.gridViewSortKey) {
      this.currentFilters.sortKey = settings.gridViewSortKey as SortKey;
    }

    if (settings.gridViewSortDirection) {
      this.currentFilters.sortDirection =
        settings.gridViewSortDirection === "desc" ? "desc" : "asc";
    }
  }

  private saveGridViewSettings() {
    const pluginAny = this.plugin as any;
    const settings = (pluginAny.settings ||= {});

    settings.gridViewColumnWidths = { ...this.columnWidths };
    settings.gridViewSortKey = this.currentFilters.sortKey;
    settings.gridViewSortDirection = this.currentFilters.sortDirection;

    if (typeof pluginAny.saveSettings === "function") {
      void pluginAny.saveSettings();
    }
  }
}
