import { ItemView, WorkspaceLeaf, Menu, setIcon } from "obsidian";
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

const NON_HIDEABLE_COLUMNS = new Set(["drag", "number", "check"]);

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
    sortKey: "Manual" as SortKey, // locked to Manual - drag/drop order only
    sortDirection: "asc" as "asc" | "desc",
  };

  private visibleRows: VisibleRow[] = [];
  private currentDragId: string | null = null;
  private numberingMap: Map<string, number> = new Map();
  private tableElement: HTMLTableElement | null = null;

  // manual-dnd state
  private dragTargetTaskId: string | null = null;
  private dragInsertAfter: boolean = false;

  // Column sizing + advanced sorting
  private columnWidths: Record<string, number> = {};
  private secondarySortKeys: SortKey[] = [];
  private columnVisibility: Record<string, boolean> = {};

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

    // -----------------------------------------------------------------------
    // Project switcher
    // -----------------------------------------------------------------------
    const projectContainer = header.createDiv("planner-project-switcher");

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

    const headerActions = header.createDiv("planner-header-actions");

    const addBtn = headerActions.createEl("button", {
      cls: "planner-add-btn",
      text: "Add Task",
    });

    addBtn.onclick = async () => {
      await this.taskStore.addTask("New Task");
      this.render();
    };

    const columnsBtn = headerActions.createEl("button", {
      cls: "planner-columns-btn",
      title: "Show / hide columns",
      text: "Columns",
    });

    columnsBtn.onclick = (evt) => {
      const menu = new Menu();

      this.getColumnDefinitions()
        .filter((c) => c.hideable)
        .forEach((col) => {
          const visible = this.isColumnVisible(col.key);
          menu.addItem((item) => {
            item.setTitle(col.label);
            item.setIcon(visible ? "check-small" : "circle-small");
            item.onClick(() => this.toggleColumnVisibility(col.key));
          });
        });

      menu.showAtMouseEvent(evt as MouseEvent);
    };

    const settingsBtn = headerActions.createEl("button", {
      cls: "planner-settings-btn",
      title: "Open plugin settings",
    });
    setIcon(settingsBtn, "settings");

    settingsBtn.onclick = () => {
      // Open plugin settings
      (this.app as any).setting.open();
      (this.app as any).setting.openTabById(this.plugin.manifest.id);
    };

    // -----------------------------------------------------------------------
    // Filtering + Sorting
    // -----------------------------------------------------------------------
    const filterBar = wrapper.createDiv("planner-filter-bar");

    const statusFilter = filterBar.createEl("select", {
      cls: "planner-filter",
    });
    const statusOptions = settings.availableStatuses || [];
    const statusNames = statusOptions.map((s: any) => s.name);

    ["All", ...statusNames].forEach((s) =>
      statusFilter.createEl("option", { text: s })
    );
    statusFilter.value = this.currentFilters.status;

    const priorityFilter = filterBar.createEl("select", {
      cls: "planner-filter",
    });
    const priorityOptions = settings.availablePriorities || [];
    const priorityNames = priorityOptions.map((p: any) => p.name);

    ["All", ...priorityNames].forEach((p) =>
      priorityFilter.createEl("option", { text: p })
    );
    priorityFilter.value = this.currentFilters.priority;

    const searchInput = filterBar.createEl("input", {
      cls: "planner-search",
      attr: { type: "text", placeholder: "Search tasks..." },
    });
    searchInput.value = this.currentFilters.search;

    // Clear filters button
    const clearFilterBtn = filterBar.createEl("button", {
      cls: "planner-clear-filter",
      title: "Clear all filters",
    });
    clearFilterBtn.innerHTML = "✕";

    const updateClearButtonVisibility = () => {
      const hasFilters =
        this.currentFilters.status !== "All" ||
        this.currentFilters.priority !== "All" ||
        this.currentFilters.search.trim() !== "";
      clearFilterBtn.style.display = hasFilters ? "block" : "none";
    };

    clearFilterBtn.onclick = () => {
      statusFilter.value = "All";
      priorityFilter.value = "All";
      searchInput.value = "";
      this.currentFilters = {
        status: "All",
        priority: "All",
        search: "",
        sortKey: "Manual", // always use manual order for drag and drop
        sortDirection: "asc",
      };
      this.secondarySortKeys = [];
      this.saveGridViewSettings();
      updateClearButtonVisibility();
      this.render();
    };

    const applyFilters = (isSearchInput = false) => {
      this.currentFilters = {
        status: statusFilter.value,
        priority: priorityFilter.value,
        search: searchInput.value.toLowerCase(),
        sortKey: "Manual", // always use manual order for drag and drop
        sortDirection: this.currentFilters.sortDirection,
      };
      this.secondarySortKeys = [];
      this.saveGridViewSettings();
      updateClearButtonVisibility();

      // For search input, only re-render the table body, not the whole view
      if (isSearchInput) {
        this.renderTableBody();
      } else {
        this.render();
      }
    };

    statusFilter.onchange = () => applyFilters(false);
    priorityFilter.onchange = () => applyFilters(false);
    searchInput.oninput = () => applyFilters(true);

    // Initial visibility check
    updateClearButtonVisibility();

    // -----------------------------------------------------------------------
    // Build visible hierarchy (with filters + sort)
    // -----------------------------------------------------------------------
    const all = this.taskStore.getAll();
    const matchesFilter = new Map<string, boolean>();
    const f = this.currentFilters;

    for (const t of all) {
      let match = true;

      if (f.status !== "All" && t.status !== f.status) match = false;
      const defaultPriority = settings.availablePriorities?.[0]?.name || "Medium";
      if (f.priority !== "All" && (t.priority || defaultPriority) !== f.priority)
        match = false;
      if (f.search.trim() !== "" && !t.title.toLowerCase().includes(f.search))
        match = false;

      matchesFilter.set(t.id, match);
    }

    // Roots: keep manual order only (no sorting)
    const roots = all.filter((t) => !t.parentId);

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

    this.tableElement = table;

    const headerRow = table.createEl("tr");

    const columns = this.getColumnDefinitions();
    const visibleColumns = columns.filter((c) => this.isColumnVisible(c.key));

    let visibleIndex = 0;
    visibleColumns.forEach((col) => {
      const th = headerRow.createEl("th");
      th.style.position = "relative";

      // Apply saved width if any
      if (this.columnWidths[col.key] != null) {
        th.style.width = `${this.columnWidths[col.key]}px`;
      }

      // Label
      const labelSpan = th.createSpan({ text: col.label });

      // Column resizing + double-click auto-fit
      this.attachColumnResizer(th, col.key, table, visibleIndex);
      visibleIndex++;
    });

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
  // Re-render only table body (for search filtering)
  // ---------------------------------------------------------------------------

  private renderTableBody() {
    if (!this.tableElement) {
      // Fallback to full render if table doesn't exist
      this.render();
      return;
    }

    const pluginAny = this.plugin as any;
    const settings = pluginAny.settings || {};

    // -----------------------------------------------------------------------
    // Build visible hierarchy (with filters)
    // -----------------------------------------------------------------------
    const all = this.taskStore.getAll();
    const matchesFilter = new Map<string, boolean>();
    const f = this.currentFilters;

    for (const t of all) {
      let match = true;

      if (f.status !== "All" && t.status !== f.status) match = false;
      const defaultPriority = settings.availablePriorities?.[0]?.name || "Medium";
      if (f.priority !== "All" && (t.priority || defaultPriority) !== f.priority)
        match = false;
      if (f.search.trim() !== "" && !t.title.toLowerCase().includes(f.search))
        match = false;

      matchesFilter.set(t.id, match);
    }

    // Roots: keep manual order only
    const roots = all.filter((t) => !t.parentId);

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

    // -------------------------------------------------------
    // Generate Planner-style numbering
    // -------------------------------------------------------
    const numberingMap = new Map<string, number>();
    let counter = 1;

    for (const row of visibleRows) {
      numberingMap.set(row.task.id, counter++);
    }

    this.numberingMap = numberingMap;

    // Remove all existing rows except the header
    const rows = Array.from(this.tableElement.querySelectorAll('tr'));
    rows.forEach((row, index) => {
      // Keep the first row (header)
      if (index > 0) {
        row.remove();
      }
    });

    // Add new rows
    visibleRows.forEach((r, i) =>
      this.renderTaskRow(this.tableElement!, r.task, r.isChild, r.hasChildren, i)
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
    if (this.isColumnVisible("drag")) {
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
    }

    // Number cell (Planner style)
    if (this.isColumnVisible("number")) {
      const numberCell = row.createEl("td", { cls: "planner-num-cell" });
      numberCell.setText(String(this.numberingMap.get(task.id) || ""));
    }

    // ---------------------------------------------------------------------
    // Checkbox cell
    // ---------------------------------------------------------------------
    if (this.isColumnVisible("check")) {
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
    }

    // ---------------------------------------------------------------------
    // Title cell: caret + title + menu
    // ---------------------------------------------------------------------
    if (this.isColumnVisible("title")) {
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
    }

    // ---------------------------------------------------------------------
    // Status
    // ---------------------------------------------------------------------
    if (this.isColumnVisible("status")) {
      const statusCell = row.createEl("td");
      const pluginAny = this.plugin as any;
      const settings = pluginAny.settings || {};
      const availableStatuses = settings.availableStatuses || [];
      const statusNames = availableStatuses.map((s: any) => s.name);

      this.createEditableSelectCell(
        statusCell,
        task.status,
        statusNames,
        async (value) => {
          // Update directly via TaskStore for GridView
          await this.taskStore.updateTask(task.id, { status: value });

          // Re-render using the updated in-memory list from TaskStore
          this.render();
        },
        (val, target) => this.createStatusPill(val, target)
      );
    }

    // ---------------------------------------------------------------------
    // Priority
    // ---------------------------------------------------------------------
    if (this.isColumnVisible("priority")) {
      const priorityCell = row.createEl("td");
      const pluginAny = this.plugin as any;
      const settings = pluginAny.settings || {};
      const availablePriorities = settings.availablePriorities || [];
      const priorityNames = availablePriorities.map((p: any) => p.name);
      const defaultPriority = availablePriorities[0]?.name || "Medium";

      this.createEditableSelectCell(
        priorityCell,
        task.priority || defaultPriority,
        priorityNames,
        async (value) => {
          await this.taskStore.updateTask(task.id, { priority: value });
          this.render();
        },
        (val, target) => this.createPriorityPill(val, target)
      );
    }

    // ---------------------------------------------------------------------
    // Tags
    // ---------------------------------------------------------------------
    if (this.isColumnVisible("tags")) {
      const tagsCell = row.createEl("td", { cls: "planner-tags-cell" });
      this.renderTaskTags(tagsCell, task);
    }

    // ---------------------------------------------------------------------
    // Start Date
    // ---------------------------------------------------------------------
    if (this.isColumnVisible("start")) {
      const startCell = row.createEl("td");
      this.createEditableDateOnlyCell(
        startCell,
        task.startDate || "",
        async (value) => {
          await this.taskStore.updateTask(task.id, { startDate: value });
          this.render();
        }
      );
    }

    // ---------------------------------------------------------------------
    // Dependencies
    // ---------------------------------------------------------------------
    if (this.isColumnVisible("dependencies")) {
      const depsCell = row.createEl("td", { cls: "planner-deps-cell" });
      const dependencies = task.dependencies || [];

      if (dependencies.length > 0) {
        const violations = this.checkDependencyViolations(task);
        const hasViolations = violations.length > 0;

        const indicator = depsCell.createEl("span", {
          cls: hasViolations
            ? "planner-dependency-indicator planner-dependency-warning"
            : "planner-dependency-indicator",
          text: hasViolations ? "⚠️" : "🔗",
          attr: {
            title: hasViolations
              ? `${violations.length} violation(s):\n${violations.join("\n")}`
              : `${dependencies.length} dependency/ies`
          }
        });

        indicator.onclick = () => {
          // Open task detail panel
          (this.plugin as any).openTaskDetail(task);
        };
      }
    }

    // ---------------------------------------------------------------------
    // Dependents (tasks that depend on this task)
    // ---------------------------------------------------------------------
    if (this.isColumnVisible("dependents")) {
      const dependentsCell = row.createEl("td", { cls: "planner-dependents-cell" });
      
      // Find all tasks that have this task as a predecessor
      const allTasks = this.taskStore.getAll();
      const dependentTasks = allTasks.filter(t => 
        t.dependencies?.some(dep => dep.predecessorId === task.id)
      );

      if (dependentTasks.length > 0) {
        const indicator = dependentsCell.createEl("span", {
          cls: "planner-dependent-indicator",
          text: "🔒",
          attr: {
            title: `Blocking ${dependentTasks.length} task(s):\n${dependentTasks.map(t => t.title).join("\n")}`
          }
        });

        indicator.onclick = () => {
          // Open task detail panel
          (this.plugin as any).openTaskDetail(task);
        };
      }
    }

    // ---------------------------------------------------------------------
    // Due Date
    // ---------------------------------------------------------------------
    if (this.isColumnVisible("due")) {
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

  private createStatusPill(value: string, container: HTMLElement) {
    const pill = container.createEl("span", {
      cls: "status-pill",
      text: value
    });

    // Find the status color
    const pluginAny = this.plugin as any;
    const settings = pluginAny.settings || {};
    const availableStatuses = settings.availableStatuses || [];
    const status = availableStatuses.find((s: any) => s.name === value);

    if (status) {
      pill.style.backgroundColor = status.color;
    }

    return pill;
  }

  private createPriorityPill(value: string, container: HTMLElement) {
    const pill = container.createEl("span", {
      cls: "priority-pill",
      text: value
    });

    // Find the priority color
    const pluginAny = this.plugin as any;
    const settings = pluginAny.settings || {};
    const availablePriorities = settings.availablePriorities || [];
    const priority = availablePriorities.find((p: any) => p.name === value);

    if (priority) {
      pill.style.backgroundColor = priority.color;
    }

    return pill;
  }

  // ---------------------------------------------------------------------------
  // Dependency validation helpers
  // ---------------------------------------------------------------------------

  private checkDependencyViolations(task: PlannerTask): string[] {
    const violations: string[] = [];
    if (!task.dependencies || task.dependencies.length === 0) return violations;

    const allTasks = this.taskStore.getAll();

    for (const dep of task.dependencies) {
      const predecessor = allTasks.find(t => t.id === dep.predecessorId);
      if (!predecessor) {
        violations.push(`Predecessor task not found`);
        continue;
      }

      const taskStartDate = task.startDate ? new Date(task.startDate) : null;
      const taskDueDate = task.dueDate ? new Date(task.dueDate) : null;
      const predStartDate = predecessor.startDate ? new Date(predecessor.startDate) : null;
      const predDueDate = predecessor.dueDate ? new Date(predecessor.dueDate) : null;

      switch (dep.type) {
        case "FS": // Finish-to-Start: Task can't start until predecessor finishes
          if (taskStartDate && predDueDate && taskStartDate < predDueDate) {
            violations.push(`FS: Cannot start before "${predecessor.title}" finishes`);
          }
          if (!predecessor.completed && task.completed) {
            violations.push(`FS: "${predecessor.title}" must be completed first`);
          }
          break;

        case "SS": // Start-to-Start: Task can't start until predecessor starts
          if (taskStartDate && predStartDate && taskStartDate < predStartDate) {
            violations.push(`SS: Cannot start before "${predecessor.title}" starts`);
          }
          break;

        case "FF": // Finish-to-Finish: Task can't finish until predecessor finishes
          if (taskDueDate && predDueDate && taskDueDate < predDueDate) {
            violations.push(`FF: Cannot finish before "${predecessor.title}" finishes`);
          }
          if (task.completed && !predecessor.completed) {
            violations.push(`FF: "${predecessor.title}" must be completed first`);
          }
          break;

        case "SF": // Start-to-Finish: Task can't finish until predecessor starts (rare)
          if (taskDueDate && predStartDate && taskDueDate < predStartDate) {
            violations.push(`SF: Cannot finish before "${predecessor.title}" starts`);
          }
          break;
      }
    }

    return violations;
  }

  private createEditableTextSpan(
    container: HTMLElement,
    value: string,
    onSave: (value: string) => Promise<void> | void
  ): HTMLElement {
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
        const newValue = select.value as T;
        await onSave(newValue);
        // Don't call setupDisplay() here - let onSave (which calls this.render()) 
        // completely rebuild the grid with fresh data from the store
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
  // Column visibility
  // ---------------------------------------------------------------------------

  private getColumnDefinitions() {
    return [
      { key: "drag", label: "", hideable: false },
      { key: "number", label: "#", hideable: false },
      { key: "check", label: "", hideable: false },
      { key: "title", label: "Title", hideable: true },
      { key: "status", label: "Status", hideable: true },
      { key: "priority", label: "Priority", hideable: true },
      { key: "tags", label: "Tags", hideable: true },
      { key: "dependencies", label: "Deps", hideable: true },
      { key: "dependents", label: "Blocks", hideable: true },
      { key: "start", label: "Start Date", hideable: true },
      { key: "due", label: "Due Date", hideable: true },
    ];
  }

  private isColumnVisible(key: string): boolean {
    if (NON_HIDEABLE_COLUMNS.has(key)) return true;
    const stored = this.columnVisibility[key];
    return stored !== false;
  }

  private toggleColumnVisibility(key: string) {
    if (NON_HIDEABLE_COLUMNS.has(key)) return;
    const current = this.columnVisibility[key];
    this.columnVisibility[key] = current === false ? true : false;
    this.saveGridViewSettings();
    this.render();
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

    if (settings.gridViewVisibleColumns) {
      this.columnVisibility = { ...settings.gridViewVisibleColumns };
    }

    // Ensure non-hideable columns stay visible and defaults exist for new columns
    this.getColumnDefinitions().forEach((col) => {
      if (!col.hideable || NON_HIDEABLE_COLUMNS.has(col.key)) {
        this.columnVisibility[col.key] = true;
      } else if (this.columnVisibility[col.key] === undefined) {
        this.columnVisibility[col.key] = true;
      }
    });

    // Always use Manual sort for drag and drop - ignore saved sortKey
    this.currentFilters.sortKey = "Manual";

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
    settings.gridViewVisibleColumns = { ...this.columnVisibility };

    if (typeof pluginAny.saveSettings === "function") {
      void pluginAny.saveSettings();
    }
  }

  // ---------------------------------------------------------------------------
  // Tags rendering
  // ---------------------------------------------------------------------------

  private renderTaskTags(cell: HTMLElement, task: PlannerTask) {
    const pluginAny = this.plugin as any;
    const settings = pluginAny.settings || {};
    const availableTags = settings.availableTags || [];
    const taskTags = task.tags || [];

    // Make cell clickable to open tag selector
    cell.classList.add("planner-tags-cell-interactive");
    cell.style.cursor = "pointer";

    const tagsContainer = cell.createDiv("planner-tags-badges");

    // Display existing tags with remove buttons
    if (taskTags.length > 0) {
      taskTags.forEach((tagId: string) => {
        const tag = availableTags.find((t: any) => t.id === tagId);
        if (tag) {
          const badge = tagsContainer.createDiv({
            cls: "planner-tag-badge-small planner-tag-badge-grid",
            text: tag.name
          });
          badge.style.backgroundColor = tag.color;

          // Add remove button
          const removeBtn = badge.createEl("span", {
            cls: "planner-tag-remove-grid",
            text: "×"
          });
          removeBtn.onclick = async (e) => {
            e.stopPropagation();
            const newTags = taskTags.filter(id => id !== tagId);
            await this.taskStore.updateTask(task.id, { tags: newTags });
            this.render();
          };
        }
      });
    } else {
      tagsContainer.createEl("span", {
        text: "—",
        cls: "planner-empty-cell"
      });
    }

    // Click on cell to add tags
    cell.onclick = (e) => {
      e.stopPropagation();

      // Find unassigned tags
      const unassignedTags = availableTags.filter((t: any) =>
        !taskTags.includes(t.id)
      );

      if (unassignedTags.length === 0) {
        return; // All tags already assigned
      }

      // Create menu
      const menu = new Menu();

      unassignedTags.forEach((tag: any) => {
        menu.addItem((item) => {
          const itemEl = item.setTitle(tag.name);

          // Add color indicator to menu item
          const iconEl = (itemEl as any).iconEl;
          if (iconEl) {
            iconEl.style.backgroundColor = tag.color;
            iconEl.style.borderRadius = "3px";
            iconEl.style.width = "12px";
            iconEl.style.height = "12px";
          }

          item.onClick(async () => {
            const newTags = [...taskTags, tag.id];
            await this.taskStore.updateTask(task.id, { tags: newTags });
            this.render();
          });
        });
      });

      menu.showAtMouseEvent(e as MouseEvent);
    };
  }
}
