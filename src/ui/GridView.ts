import { ItemView, WorkspaceLeaf, Menu, setIcon, Notice, TFile } from "obsidian";
import type ProjectPlannerPlugin from "../main";
import type { PlannerTask, TaskStatus } from "../types";
import { TaskStore } from "../stores/taskStore";
import { renderPlannerHeader } from "./Header";

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
  depth: number; // Track nesting depth for visual indentation
}

export class GridView extends ItemView {
  private plugin: ProjectPlannerPlugin;
  private taskStore: TaskStore;
  private unsubscribe: (() => void) | null = null;

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
  private dragDropOnto: boolean = false; // true when dropping onto task to make it a child
  private lastTargetRow: HTMLTableRowElement | null = null; // Track for cleanup
  private pendingNewTaskId: string | null = null; // Track new task for animation
  private isEditingInline: boolean = false; // Track active inline editing to prevent re-renders

  // Column sizing + advanced sorting
  private columnWidths: Record<string, number> = {};
  private secondarySortKeys: SortKey[] = [];

  // Clipboard for Cut/Copy/Paste
  private clipboardTask: { task: PlannerTask; isCut: boolean } | null = null;
  private columnVisibility: Record<string, boolean> = {};
  
  // Column reordering (drag and drop)
  private columnOrder: string[] = [];
  private draggedColumnKey: string | null = null;
  private dropTargetColumnKey: string | null = null;
  
  // Scroll position preservation
  private savedScrollTop: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ProjectPlannerPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.taskStore = plugin.taskStore;
  }

  // Allow plugin / detail view to update tasks
  public async updateTask(id: string, fields: Partial<PlannerTask>) {
    await this.taskStore.updateTask(id, fields);
    // Don't call render() - TaskStore subscription handles it
  }

  async onOpen() {
    this.loadGridViewSettings();
    await this.taskStore.ensureLoaded();
    this.unsubscribe = this.taskStore.subscribe(() => {
      // Don't re-render while user is actively editing inline
      if (this.isEditingInline) {
        return;
      }
      this.render();
    });
    this.render();
  }

  async onClose() {
    this.containerEl.empty();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
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
    
    // Save scroll position before clearing (if content exists)
    const existingContent = container.querySelector('.planner-grid-content') as HTMLElement;
    if (existingContent && this.savedScrollTop === null) {
      // Only save if we haven't explicitly saved already (for operations that need it)
      this.savedScrollTop = existingContent.scrollTop;
    }
    
    container.empty();

    const wrapper = container.createDiv("planner-grid-wrapper");

    // -----------------------------------------------------------------------
    // Header
    // -----------------------------------------------------------------------
    const settings = this.plugin.settings;
    const projects = settings.projects || [];
    let activeProjectId = settings.activeProjectId;

    const { actionsEl: headerActions } = renderPlannerHeader(wrapper, this.plugin, {
      active: "grid",
      onProjectChange: async () => {
        await this.taskStore.load();
        this.render();
      },
      buildExtraActions: (actionsEl) => {
        const columnsBtn = actionsEl.createEl("button", {
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
      }
    });

    // -----------------------------------------------------------------------
    // Filtering + Sorting
    // -----------------------------------------------------------------------
    const filterBar = wrapper.createDiv("planner-filter-bar");

    // Status filter
    const statusFilterGroup = filterBar.createDiv("planner-filter-group");
    statusFilterGroup.createSpan({ cls: "planner-filter-label", text: "Status:" });
    const statusFilter = statusFilterGroup.createEl("select", {
      cls: "planner-filter",
    });
    const statusOptions = settings.availableStatuses || [];
    const statusNames = statusOptions.map((s: any) => s.name);

    ["All", ...statusNames].forEach((s) =>
      statusFilter.createEl("option", { text: s })
    );
    statusFilter.value = this.currentFilters.status;

    // Priority filter
    const priorityFilterGroup = filterBar.createDiv("planner-filter-group");
    priorityFilterGroup.createSpan({ cls: "planner-filter-label", text: "Priority:" });
    const priorityFilter = priorityFilterGroup.createEl("select", {
      cls: "planner-filter",
    });
    const priorityOptions = settings.availablePriorities || [];
    const priorityNames = priorityOptions.map((p: any) => p.name);

    ["All", ...priorityNames].forEach((p) =>
      priorityFilter.createEl("option", { text: p })
    );
    priorityFilter.value = this.currentFilters.priority;

    // Search input
    const searchInput = filterBar.createEl("input", {
      cls: "planner-search",
      attr: { type: "text", placeholder: "Search tasks..." },
    });
    searchInput.value = this.currentFilters.search;

    // Clear filters button
    const clearFilterBtn = filterBar.createEl("button", {
      cls: "planner-clear-filter",
      title: "Clear all filters",
      text: "✕"
    });

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
    let all = this.taskStore.getAll();
    
    // Filter out completed tasks if setting is disabled (Grid View only)
    const pluginAny = this.plugin as any;
    const showCompleted = pluginAny.settings?.showCompleted ?? true;
    if (!showCompleted) {
      all = all.filter((t) => !t.completed);
    }
    
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

    // Recursive function to build hierarchy
    const addTaskAndChildren = (task: PlannerTask, depth: number) => {
      const children = all.filter((t) => t.parentId === task.id);
      const taskMatches = matchesFilter.get(task.id) ?? true;
      const matchingChildren = children.filter(
        (c) => matchesFilter.get(c.id) ?? true
      );

      const hasChildren = children.length > 0;

      if (!taskMatches && matchingChildren.length === 0) return;

      visibleRows.push({
        task,
        isChild: depth > 0,
        hasChildren,
        depth,
      });

      if (!task.collapsed) {
        const toRender = taskMatches ? children : matchingChildren;

        for (const child of toRender) {
          addTaskAndChildren(child, depth + 1);
        }
      }
    };

    for (const root of roots) {
      addTaskAndChildren(root, 0);
    }

    this.visibleRows = visibleRows;

    // -----------------------------------------------------------------------
    // Grid table (wrapped in scrollable content area)
    // -----------------------------------------------------------------------
    const content = wrapper.createDiv("planner-grid-content");
    
    // Restore scroll position after content is created
    if (this.savedScrollTop !== null) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        content.scrollTop = this.savedScrollTop!;
        this.savedScrollTop = null; // Clear after restoring
      });
    }
    
    const table = content.createEl("table", {
      cls: "planner-grid-table",
    });

    this.tableElement = table;

    // Create thead for sticky header
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");

    const columns = this.getColumnDefinitions();
    const visibleColumns = columns.filter((c) => this.isColumnVisible(c.key));

    let visibleIndex = 0;
    visibleColumns.forEach((col) => {
      const th = headerRow.createEl("th");
      th.style.position = "relative";
      th.setAttribute("data-column-key", col.key);

      // Apply saved width if any
      if (this.columnWidths[col.key] != null) {
        th.style.width = `${this.columnWidths[col.key]}px`;
      }

      // Make header draggable if reorderable
      if ((col as any).reorderable) {
        th.draggable = true;
        th.classList.add("planner-column-draggable");
        this.setupColumnDrag(th, col.key, headerRow);
      }

      // Label
      const labelSpan = th.createSpan({ text: col.label });

      // Column resizing + double-click auto-fit
      this.attachColumnResizer(th, col.key, table, visibleIndex);
      visibleIndex++;
    });

    // Create tbody for table rows
    const tbody = table.createEl("tbody");

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
      this.renderTaskRow(tbody, r.task, r.isChild, r.hasChildren, i, r.depth)
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

    const settings = this.plugin.settings;

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

    // Recursive function to build hierarchy
    const addTaskAndChildren = (task: PlannerTask, depth: number) => {
      const children = all.filter((t) => t.parentId === task.id);
      const taskMatches = matchesFilter.get(task.id) ?? true;
      const matchingChildren = children.filter(
        (c) => matchesFilter.get(c.id) ?? true
      );

      const hasChildren = children.length > 0;

      if (!taskMatches && matchingChildren.length === 0) return;

      visibleRows.push({
        task,
        isChild: depth > 0,
        hasChildren,
        depth,
      });

      if (!task.collapsed) {
        const toRender = taskMatches ? children : matchingChildren;

        for (const child of toRender) {
          addTaskAndChildren(child, depth + 1);
        }
      }
    };

    for (const root of roots) {
      addTaskAndChildren(root, 0);
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

    // Get or create tbody
    let tbody = this.tableElement.querySelector('tbody');
    if (!tbody) {
      tbody = this.tableElement.createEl('tbody');
    } else {
      // Clear existing rows in tbody
      tbody.empty();
    }

    // Add new rows
    visibleRows.forEach((r, i) =>
      this.renderTaskRow(tbody!, r.task, r.isChild, r.hasChildren, i, r.depth)
    );
  }

  // ---------------------------------------------------------------------------
  // Render individual row
  // ---------------------------------------------------------------------------

  private renderTaskRow(
    parent: HTMLElement,
    task: PlannerTask,
    isChild: boolean,
    hasChildren: boolean,
    index: number,
    depth: number
  ) {
    const row = parent.createEl("tr", {
      cls: isChild
        ? "planner-row planner-row-child"
        : "planner-row planner-row-parent",
    });

    row.dataset.taskId = task.id;
    row.dataset.rowIndex = String(index);
    
    // Add animation class for newly created tasks
    if (this.pendingNewTaskId === task.id) {
      row.classList.add("planner-row-new");
      // Remove animation class after animation completes
      setTimeout(() => {
        row.classList.remove("planner-row-new");
        this.pendingNewTaskId = null;
      }, 400); // Match CSS animation duration
    }

    // Right–click context menu
    row.oncontextmenu = (evt) => {
      evt.preventDefault();
      this.showTaskMenu(task, index, evt);
    };

    // Build a map of column key → cell render function
    // Then iterate in getColumnDefinitions() order so reordering works
    const cellRenderers: Record<string, () => void> = {

      drag: () => {
        const dragCell = row.createEl("td", { cls: "planner-drag-cell" });
        const dragHandle = dragCell.createSpan({
          cls: "planner-drag-handle",
          text: "⋮⋮",
        });
        dragHandle.onpointerdown = (evt: PointerEvent) => {
          this.handleRowDragStart(evt, row, task);
        };
      },

      number: () => {
        const numberCell = row.createEl("td", { cls: "planner-num-cell" });
        numberCell.setText(String(this.numberingMap.get(task.id) || ""));
      },

      check: () => {
        const completeCell = row.createEl("td", { cls: "planner-complete-cell" });
        const checkbox = completeCell.createEl("input", { attr: { type: "checkbox" } });
        checkbox.checked = !!task.completed;
        checkbox.onchange = async (ev) => {
          ev.stopPropagation();
          this.saveScrollPosition();
          const isDone = checkbox.checked;
          await this.taskStore.updateTask(task.id, {
            completed: isDone,
            status: isDone ? "Completed" : "Not Started",
          });
        };
      },

      title: () => {
        const titleCell = row.createEl("td", {
          cls: isChild ? "planner-title-cell subtask" : "planner-title-cell",
        });
        if (depth > 0) {
          titleCell.style.paddingLeft = `${8 + (depth * 20)}px`;
        }
        if (hasChildren) {
          const caret = titleCell.createSpan({
            cls: "planner-expand-toggle",
            text: task.collapsed ? "▸" : "▾",
          });
          caret.onclick = async (evt) => {
            evt.stopPropagation();
            this.saveScrollPosition();
            await this.taskStore.toggleCollapsed(task.id);
          };
        } else {
          titleCell.createSpan({ cls: "planner-expand-spacer", text: "" });
        }
        const titleInner = titleCell.createDiv({ cls: "planner-title-inner" });
        const titleSpan = this.createEditableTextSpan(
          titleInner,
          task.title,
          async (value) => {
            this.saveScrollPosition();
            await this.taskStore.updateTask(task.id, { title: value });
          }
        );
        if (hasChildren) titleSpan.classList.add("planner-parent-bold");
        if (task.completed) titleSpan.classList.add("planner-task-completed");
        const titleMenuBtn = titleCell.createEl("button", {
          cls: "planner-task-menu",
          text: "⋯",
        });
        titleMenuBtn.onclick = (evt) => {
          evt.stopPropagation();
          this.buildInlineMenu(task, evt);
        };
      },

      status: () => {
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
            this.saveScrollPosition();
            await this.taskStore.updateTask(task.id, { status: value });
          },
          (val, target) => this.createStatusPill(val, target)
        );
      },

      priority: () => {
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
          },
          (val, target) => this.createPriorityPill(val, target)
        );
      },

      bucket: () => {
        const bucketCell = row.createEl("td");
        if (hasChildren) {
          bucketCell.createSpan({ cls: "planner-disabled-cell", text: "—" });
        } else {
          const pluginAny = this.plugin as any;
          const settings = pluginAny.settings || {};
          const activeProject = settings.projects?.find(
            (p: any) => p.id === settings.activeProjectId
          );
          const buckets = activeProject?.buckets || [];
          const bucketNames = ["Unassigned", ...buckets.map((b: any) => b.name)];
          const currentBucketId = task.bucketId;
          const currentBucketName = currentBucketId
            ? buckets.find((b: any) => b.id === currentBucketId)?.name || "Unassigned"
            : "Unassigned";
          this.createEditableSelectCell(
            bucketCell,
            currentBucketName,
            bucketNames,
            async (value) => {
              this.saveScrollPosition();
              if (value === "Unassigned") {
                await this.taskStore.updateTask(task.id, { bucketId: undefined });
              } else {
                const selectedBucket = buckets.find((b: any) => b.name === value);
                if (selectedBucket) {
                  await this.taskStore.updateTask(task.id, { bucketId: selectedBucket.id });
                }
              }
            }
          );
        }
      },

      tags: () => {
        const tagsCell = row.createEl("td", { cls: "planner-tags-cell" });
        this.renderTaskTags(tagsCell, task);
      },

      dependencies: () => {
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
          indicator.onclick = () => { this.plugin.openTaskDetail(task); };
        }
      },

      start: () => {
        const startCell = row.createEl("td");
        this.createEditableDateOnlyCell(
          startCell,
          task.startDate || "",
          async (value) => {
            await this.taskStore.updateTask(task.id, { startDate: value });
          }
        );
      },

      due: () => {
        const dueCell = row.createEl("td");
        this.createEditableDateOnlyCell(
          dueCell,
          task.dueDate || "",
          async (value) => {
            await this.taskStore.updateTask(task.id, { dueDate: value });
          },
          true
        );
      },

      created: () => {
        row.createEl("td", {
          cls: "planner-date-cell-readonly",
          text: task.createdDate || "-"
        });
      },

      modified: () => {
        row.createEl("td", {
          cls: "planner-date-cell-readonly",
          text: task.lastModifiedDate || "-"
        });
      },

      percentComplete: () => {
        const pct = task.percentComplete ?? 0;
        row.createEl("td", {
          cls: "planner-effort-cell planner-percent-cell",
          text: `${pct}%`
        });
      },

      effortCompleted: () => {
        const ecCell = row.createEl("td", { cls: "planner-effort-cell" });
        const ecInput = ecCell.createEl("input", {
          attr: { type: "number", min: "0", step: "0.5" },
          cls: "planner-inline-number-input"
        });
        ecInput.value = task.effortCompleted ? String(task.effortCompleted) : "";
        ecInput.placeholder = "0";
        const commitEc = async () => {
          const val = parseFloat(ecInput.value) || 0;
          this.isEditingInline = false;
          await this.taskStore.updateTask(task.id, { effortCompleted: val });
        };
        ecInput.onfocus = () => { this.isEditingInline = true; };
        ecInput.onblur = commitEc;
        ecInput.onkeydown = (e) => { if (e.key === "Enter") { ecInput.blur(); } };
      },

      effortRemaining: () => {
        const erCell = row.createEl("td", { cls: "planner-effort-cell" });
        const erInput = erCell.createEl("input", {
          attr: { type: "number", min: "0", step: "0.5" },
          cls: "planner-inline-number-input"
        });
        erInput.value = task.effortRemaining ? String(task.effortRemaining) : "";
        erInput.placeholder = "0";
        const commitEr = async () => {
          const val = parseFloat(erInput.value) || 0;
          this.isEditingInline = false;
          await this.taskStore.updateTask(task.id, { effortRemaining: val });
        };
        erInput.onfocus = () => { this.isEditingInline = true; };
        erInput.onblur = commitEr;
        erInput.onkeydown = (e) => { if (e.key === "Enter") { erInput.blur(); } };
      },

      effortTotal: () => {
        const total = (task.effortCompleted ?? 0) + (task.effortRemaining ?? 0);
        row.createEl("td", {
          cls: "planner-effort-cell planner-effort-total-cell",
          text: total > 0 ? `${total}h` : "-"
        });
      },

      duration: () => {
        let durationText = "-";
        if (task.startDate && task.dueDate) {
          const start = new Date(task.startDate);
          const end = new Date(task.dueDate);
          const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0) {
            durationText = diffDays === 1 ? "1 day" : `${diffDays} days`;
          } else {
            durationText = "Invalid";
          }
        }
        row.createEl("td", {
          cls: "planner-effort-cell planner-duration-cell",
          text: durationText
        });
      },

    };

    // Render cells in the dynamic column order (respects drag-and-drop reordering)
    const columns = this.getColumnDefinitions();
    for (const col of columns) {
      if (!this.isColumnVisible(col.key)) continue;
      const renderer = cellRenderers[col.key];
      if (renderer) renderer();
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

    menu.addSeparator();

    // Cut
    menu.addItem((item) =>
      item
        .setTitle("Cut")
        .setIcon("scissors")
        .onClick(() => {
          this.clipboardTask = { task: { ...task }, isCut: true };
        })
    );

    // Copy
    menu.addItem((item) =>
      item
        .setTitle("Copy")
        .setIcon("copy")
        .onClick(() => {
          this.clipboardTask = { task: { ...task }, isCut: false };
        })
    );

    // Paste
    menu.addItem((item) =>
      item
        .setTitle("Paste")
        .setIcon("clipboard")
        .setDisabled(!this.clipboardTask)
        .onClick(async () => {
          if (!this.clipboardTask) return;

          const { task: clipTask, isCut } = this.clipboardTask;

          if (isCut) {
            // Move the task by updating its parentId
            await this.taskStore.updateTask(clipTask.id, {
              parentId: task.parentId,
            });
            this.clipboardTask = null;
          } else {
            // Copy: create a duplicate task
            const newTask = await this.taskStore.addTask(clipTask.title);
            await this.taskStore.updateTask(newTask.id, {
              description: clipTask.description,
              status: clipTask.status,
              priority: clipTask.priority,
              startDate: clipTask.startDate,
              dueDate: clipTask.dueDate,
              tags: clipTask.tags ? [...clipTask.tags] : [],
              completed: clipTask.completed,
              parentId: task.parentId,
              bucketId: clipTask.bucketId,
              links: clipTask.links ? [...clipTask.links] : [],
              dependencies: [], // Don't copy dependencies
            });
          }

          // Don't call render() - TaskStore subscription handles it
        })
    );

    menu.addSeparator();

    // Copy link to task
    menu.addItem((item) =>
      item
        .setTitle("Copy link to task")
        .setIcon("link")
        .onClick(async () => {
          const projectId = this.plugin.settings.activeProjectId;
          const uri = `obsidian://open-planner-task?id=${encodeURIComponent(
            task.id
          )}&project=${encodeURIComponent(projectId)}`;

          try {
            await navigator.clipboard.writeText(uri);
            new Notice("Task link copied to clipboard");
          } catch (err) {
            console.error("Failed to copy link:", err);
            new Notice("Failed to copy link");
          }
        })
    );

    // Open Markdown task note
    menu.addItem((item) =>
      item
        .setTitle("Open Markdown task note")
        .setIcon("file-text")
        .setDisabled(!this.plugin.settings.enableMarkdownSync)
        .onClick(async () => {
          if (!this.plugin.settings.enableMarkdownSync) return;

          const projectId = this.plugin.settings.activeProjectId;
          const project = this.plugin.settings.projects.find(
            (p) => p.id === projectId
          );
          if (!project) return;

          // Use the same path as TaskSync
          const filePath = this.plugin.taskSync.getTaskFilePath(task, project.name);

          try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file && file instanceof TFile) {
              await this.app.workspace.openLinkText(filePath, "", true);
            } else {
              // Note doesn't exist - create it
              new Notice("Creating task note...");
              await this.plugin.taskSync.syncTaskToMarkdown(task, projectId);
              // Wait a moment for the file to be created, then open it
              setTimeout(async () => {
                await this.app.workspace.openLinkText(filePath, "", true);
              }, 100);
            }
          } catch (err) {
            console.error("Failed to open task note:", err);
            new Notice("Failed to open task note");
          }
        })
    );

    menu.addSeparator();

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
          // Don't call render() - TaskStore subscription handles it
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
          // Don't call render() - TaskStore subscription handles it
        })
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle("Delete task")
        .setIcon("trash")
        .onClick(async () => {
          await this.taskStore.deleteTask(task.id);
          // Don't call render() - TaskStore subscription handles it
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

    menu.addSeparator();

    // Cut
    menu.addItem((item) =>
      item
        .setTitle("Cut")
        .setIcon("scissors")
        .onClick(() => {
          this.clipboardTask = { task: { ...task }, isCut: true };
        })
    );

    // Copy
    menu.addItem((item) =>
      item
        .setTitle("Copy")
        .setIcon("copy")
        .onClick(() => {
          this.clipboardTask = { task: { ...task }, isCut: false };
        })
    );

    // Paste
    menu.addItem((item) =>
      item
        .setTitle("Paste")
        .setIcon("clipboard")
        .setDisabled(!this.clipboardTask)
        .onClick(async () => {
          if (!this.clipboardTask) return;

          const { task: clipTask, isCut } = this.clipboardTask;

          if (isCut) {
            // Move the task by updating its parentId
            await this.taskStore.updateTask(clipTask.id, {
              parentId: task.parentId,
            });
            this.clipboardTask = null;
          } else {
            // Copy: create a duplicate task
            const newTask = await this.taskStore.addTask(clipTask.title);
            await this.taskStore.updateTask(newTask.id, {
              description: clipTask.description,
              status: clipTask.status,
              priority: clipTask.priority,
              startDate: clipTask.startDate,
              dueDate: clipTask.dueDate,
              tags: clipTask.tags ? [...clipTask.tags] : [],
              completed: clipTask.completed,
              parentId: task.parentId,
              bucketId: clipTask.bucketId,
              links: clipTask.links ? [...clipTask.links] : [],
              dependencies: [], // Don't copy dependencies
            });
          }

          // Don't call render() - TaskStore subscription handles it
        })
    );

    menu.addSeparator();

    // Copy link to task
    menu.addItem((item) =>
      item
        .setTitle("Copy link to task")
        .setIcon("link")
        .onClick(async () => {
          const projectId = this.plugin.settings.activeProjectId;
          const uri = `obsidian://open-planner-task?id=${encodeURIComponent(
            task.id
          )}&project=${encodeURIComponent(projectId)}`;

          try {
            await navigator.clipboard.writeText(uri);
            new Notice("Task link copied to clipboard");
          } catch (err) {
            console.error("Failed to copy link:", err);
            new Notice("Failed to copy link");
          }
        })
    );

    // Open Markdown task note
    menu.addItem((item) =>
      item
        .setTitle("Open Markdown task note")
        .setIcon("file-text")
        .setDisabled(!this.plugin.settings.enableMarkdownSync)
        .onClick(async () => {
          if (!this.plugin.settings.enableMarkdownSync) return;

          const projectId = this.plugin.settings.activeProjectId;
          const project = this.plugin.settings.projects.find(
            (p) => p.id === projectId
          );
          if (!project) return;

          // Use the same path as TaskSync
          const filePath = this.plugin.taskSync.getTaskFilePath(task, project.name);

          try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file && file instanceof TFile) {
              await this.app.workspace.openLinkText(filePath, "", true);
            } else {
              // Note doesn't exist - create it
              new Notice("Creating task note...");
              await this.plugin.taskSync.syncTaskToMarkdown(task, projectId);
              // Wait a moment for the file to be created, then open it
              setTimeout(async () => {
                await this.app.workspace.openLinkText(filePath, "", true);
              }, 100);
            }
          } catch (err) {
            console.error("Failed to open task note:", err);
            new Notice("Failed to open task note");
          }
        })
    );

    menu.addSeparator();

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
          // Don't call render() - TaskStore subscription handles it
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
          // Don't call render() - TaskStore subscription handles it
        })
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle("Delete task")
        .setIcon("trash")
        .onClick(async () => {
          await this.taskStore.deleteTask(task.id);
          // Don't call render() - TaskStore subscription handles it
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
    
    // Mark as pending for animation
    this.pendingNewTaskId = newTask.id;

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

    // Don't call render() here - TaskStore.setOrder() triggers emit() which re-renders via subscription
    // Focus with timing optimized for smooth animation
    this.focusNewTaskTitleImmediate(newTask.id);
  }

  // Helper: Focus the title input of the newly created task
  private focusNewTaskTitleImmediate(taskId: string) {
    // Delay to ensure row animation starts before activating editor for smooth transition
    setTimeout(() => {
      const titleEl = this.containerEl.querySelector(
        `tr[data-task-id="${taskId}"] .planner-title-inner .planner-editable`
      ) as HTMLElement | null;

      if (titleEl) {
        // Smooth activation of inline editor
        titleEl.click();
        
        // Ensure input field is selected after editor opens
        requestAnimationFrame(() => {
          const inputEl = this.containerEl.querySelector(
            `tr[data-task-id="${taskId}"] .planner-input`
          ) as HTMLInputElement | null;
          
          if (inputEl) {
            inputEl.select();
          }
        });
      }
    }, 150); // Coordinate with row slide-in animation
  }

  // Helper: Save current scroll position for restoration after re-render
  private saveScrollPosition() {
    const content = this.containerEl.querySelector('.planner-grid-content') as HTMLElement;
    if (content) {
      this.savedScrollTop = content.scrollTop;
    }
  }

  // ---------------------------------------------------------------------------
  // Drag-and-drop reordering (Planner-style blocks, manual DnD)
  // ---------------------------------------------------------------------------

  private handleRowDragStart(evt: PointerEvent, row: HTMLTableRowElement, task: PlannerTask) {
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
    ghost.style.opacity = "0";
    ghost.style.background =
      getComputedStyle(row).backgroundColor || "var(--background-primary)";
    ghost.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.25)";
    ghost.style.transition = "opacity 0.1s ease-out";

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
    indicator.style.transition = "top 0.1s ease-out, opacity 0.1s ease-out";

    document.body.appendChild(ghost);
    document.body.appendChild(indicator);

    // Fade in ghost element smoothly
    requestAnimationFrame(() => {
      ghost.style.opacity = "0.9";
    });

    this.currentDragId = task.id;
    this.dragTargetTaskId = null;
    this.dragInsertAfter = false;
    this.dragDropOnto = false;

    row.classList.add("planner-row-dragging");
    document.body.style.userSelect = "none";
    (document.body.style as any).webkitUserSelect = "none";
    document.body.style.cursor = "grabbing";

    const offsetY = evt.clientY - rowRect.top;

    // Throttle drop zone calculations for better performance
    let lastTargetCheck = 0;
    const TARGET_CHECK_INTERVAL = 16; // ~60fps

    // Auto-scroll when dragging near viewport edges
    let autoScrollInterval: number | null = null;
    const AUTO_SCROLL_THRESHOLD = 80; // pixels from edge
    const AUTO_SCROLL_SPEED = 10; // pixels per frame

    const updateAutoScroll = (clientY: number) => {
      const viewportHeight = window.innerHeight;
      const scrollContainer = this.containerEl.querySelector('.planner-grid-scroll-container') as HTMLElement;

      if (!scrollContainer) {
        if (autoScrollInterval !== null) {
          cancelAnimationFrame(autoScrollInterval);
          autoScrollInterval = null;
        }
        return;
      }

      if (clientY < AUTO_SCROLL_THRESHOLD) {
        if (autoScrollInterval === null) {
          const scroll = () => {
            scrollContainer.scrollTop -= AUTO_SCROLL_SPEED;
            autoScrollInterval = requestAnimationFrame(scroll);
          };
          autoScrollInterval = requestAnimationFrame(scroll);
        }
      } else if (clientY > viewportHeight - AUTO_SCROLL_THRESHOLD) {
        if (autoScrollInterval === null) {
          const scroll = () => {
            scrollContainer.scrollTop += AUTO_SCROLL_SPEED;
            autoScrollInterval = requestAnimationFrame(scroll);
          };
          autoScrollInterval = requestAnimationFrame(scroll);
        }
      } else {
        if (autoScrollInterval !== null) {
          cancelAnimationFrame(autoScrollInterval);
          autoScrollInterval = null;
        }
      }
    };

    const onMove = (moveEvt: PointerEvent) => {
      moveEvt.preventDefault();

      const y = moveEvt.clientY - offsetY;
      ghost.style.top = `${y}px`;

      updateAutoScroll(moveEvt.clientY);

      const now = Date.now();
      if (now - lastTargetCheck < TARGET_CHECK_INTERVAL) return;
      lastTargetCheck = now;

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
        if (this.lastTargetRow) {
          this.lastTargetRow.classList.remove("planner-row-drop-target", "planner-row-drop-onto");
          this.lastTargetRow = null;
        }
        return;
      }

      const targetRect = targetRow.getBoundingClientRect();
      const relativeY = moveEvt.clientY - targetRect.top;
      const height = targetRect.height;

      const topZone = height * 0.25;
      const bottomZone = height * 0.75;

      let dropOnto = false;
      let before = false;

      if (relativeY < topZone) {
        before = true;
      } else if (relativeY > bottomZone) {
        before = false;
      } else {
        dropOnto = true;
      }

      this.dragTargetTaskId = targetRow.dataset.taskId;
      this.dragInsertAfter = !before;
      this.dragDropOnto = dropOnto;

      if (this.lastTargetRow !== targetRow) {
        if (this.lastTargetRow) {
          this.lastTargetRow.classList.remove("planner-row-drop-target", "planner-row-drop-onto");
        }
        this.lastTargetRow = targetRow;
        targetRow.classList.add("planner-row-drop-target");
        if (dropOnto) targetRow.classList.add("planner-row-drop-onto");
      } else {
        targetRow.classList.remove("planner-row-drop-target", "planner-row-drop-onto");
        targetRow.classList.add("planner-row-drop-target");
        if (dropOnto) targetRow.classList.add("planner-row-drop-onto");
      }

      if (dropOnto) {
        indicator.style.opacity = "0";
        requestAnimationFrame(() => { indicator.style.display = "none"; });
      } else {
        if (indicator.style.display === "none") {
          indicator.style.display = "block";
          indicator.style.opacity = "0";
          requestAnimationFrame(() => { indicator.style.opacity = "1"; });
        }
        indicator.style.left = `${targetRect.left}px`;
        indicator.style.width = `${targetRect.width}px`;
        indicator.style.height = "2px";
        indicator.style.top = before
          ? `${targetRect.top - 1}px`
          : `${targetRect.bottom - 1}px`;
        indicator.style.backgroundColor = "var(--interactive-accent)";
        indicator.style.border = "none";
        indicator.style.borderRadius = "0";
      }
    };

    const onUp = async (upEvt: PointerEvent) => {
      upEvt.preventDefault();

      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);

      if (autoScrollInterval !== null) {
        cancelAnimationFrame(autoScrollInterval);
        autoScrollInterval = null;
      }

      ghost.style.opacity = "0";
      indicator.style.opacity = "0";

      setTimeout(() => {
        ghost.remove();
        indicator.remove();
      }, 100);

      row.classList.remove("planner-row-dragging");
      document.body.style.userSelect = "";
      (document.body.style as any).webkitUserSelect = "";
      document.body.style.cursor = "";

      if (this.lastTargetRow) {
        this.lastTargetRow.classList.remove("planner-row-drop-target", "planner-row-drop-onto");
        this.lastTargetRow = null;
      }

      const dragId = this.currentDragId;
      const targetId = this.dragTargetTaskId;
      const insertAfter = this.dragInsertAfter;
      const dropOnto = this.dragDropOnto;

      this.currentDragId = null;
      this.dragTargetTaskId = null;
      this.dragInsertAfter = false;
      this.dragDropOnto = false;

      if (dragId && targetId && dragId !== targetId) {
        await this.handleDrop(dragId, targetId, insertAfter, dropOnto);
      }
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
  }

  private async handleDrop(
    dragId: string,
    targetId: string,
    insertAfter: boolean,
    dropOnto: boolean = false
  ) {
    // Save scroll position before drag-drop operations that will trigger re-render
    this.saveScrollPosition();
    
    const tasks = this.taskStore.getAll();
    const dragTask = tasks.find((t) => t.id === dragId);
    const targetTask = tasks.find((t) => t.id === targetId);

    if (!dragTask || !targetTask) return;
    if (dragTask.id === targetTask.id) return;

    // Prevent dropping onto own child (circular reference)
    if (dropOnto && dragTask.id === targetTask.parentId) return;
    
    // Prevent dropping parent onto its own descendant
    if (dropOnto && !dragTask.parentId) {
      const isDescendant = (taskId: string): boolean => {
        const children = tasks.filter(t => t.parentId === taskId);
        if (children.some(c => c.id === targetTask.id)) return true;
        return children.some(c => isDescendant(c.id));
      };
      if (isDescendant(dragTask.id)) return;
    }

    const ids = tasks.map((t) => t.id);

    // Handle dropping onto a task (make it a child)
    if (dropOnto) {
      // If dragging a parent task, move it with all its children
      if (!dragTask.parentId) {
        const blockIds: string[] = [];
        blockIds.push(dragTask.id);
        for (const t of tasks) {
          if (t.parentId === dragTask.id) {
            blockIds.push(t.id);
          }
        }
        
        // Remove block from current position
        const firstIdx = ids.indexOf(blockIds[0]);
        if (firstIdx === -1) return;
        ids.splice(firstIdx, blockIds.length);
        
        // Find position: right after target task (as first child)
        const targetIndex = ids.indexOf(targetId);
        if (targetIndex === -1) return;
        
        ids.splice(targetIndex + 1, 0, ...blockIds);
        
        // Update parent relationship for the dragged task only
        await this.taskStore.updateTask(dragId, { parentId: targetId });
        await this.taskStore.setOrder(ids);
        // Don't call render() - TaskStore subscription handles it
        return;
      } else {
        // Dragging a child task - move just this task
        const fromIndex = ids.indexOf(dragId);
        if (fromIndex === -1) return;
        ids.splice(fromIndex, 1);

        // Find position: right after target task (as first child)
        const targetIndex = ids.indexOf(targetId);
        if (targetIndex === -1) return;
        
        ids.splice(targetIndex + 1, 0, dragId);
        
        // Update parent relationship
        await this.taskStore.updateTask(dragId, { parentId: targetId });
        await this.taskStore.setOrder(ids);
        // Don't call render() - TaskStore subscription handles it
        return;
      }
    }

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
      // Don't call render() - TaskStore subscription handles it
      return;
    }

    // Child drag: move single subtask and update hierarchy if needed
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

    // Determine new parent based on drop location
    let newParentId: string | null = null;

    // If dropping on/near the target task
    if (targetTask.parentId) {
      // Target is a child - use target's parent
      newParentId = targetTask.parentId;
    } else {
      // Target is a root task
      if (insertAfter) {
        // Dropping after a root - check if there's a task after target
        // If next task is a child of target, adopt target as parent
        // Otherwise, become a root
        const targetIndex = ids.indexOf(targetId);
        if (targetIndex !== -1 && targetIndex + 1 < ids.length) {
          const nextTaskId = ids[targetIndex + 1];
          const nextTask = tasks.find(t => t.id === nextTaskId);
          if (nextTask?.parentId === targetId) {
            // Inserting as first child of target
            newParentId = targetId;
          }
          // else: becomes root (newParentId stays null)
        }
        // else: end of list, becomes root
      } else {
        // Dropping before a root - becomes root
        newParentId = null;
      }
    }

    // Update the task's parent if it changed
    if (dragTask.parentId !== newParentId) {
      await this.taskStore.updateTask(dragId, { parentId: newParentId });
    }

    await this.taskStore.setOrder(ids);
    // Don't call render() - TaskStore subscription handles it
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
      // Mark that we're editing to prevent re-renders
      this.isEditingInline = true;
      
      const input = container.createEl("input", {
        attr: { type: "text" },
      });
      input.value = value;
      input.classList.add("planner-input");
      
      // Smooth fade-in transition for input
      input.style.opacity = "0";
      span.replaceWith(input);
      
      requestAnimationFrame(() => {
        input.style.opacity = "1";
        input.focus();
        input.select();
      });

      const save = async () => {
        const newValue = input.value.trim();
        
        // Create new span with updated value immediately (optimistic update)
        const newSpan = container.createEl("span", { text: newValue });
        newSpan.classList.add("planner-editable");
        newSpan.onclick = openEditor;
        
        // Smooth fade transition
        input.style.opacity = "0";
        newSpan.style.opacity = "0";
        
        setTimeout(() => {
          input.replaceWith(newSpan);
          requestAnimationFrame(() => {
            newSpan.style.opacity = "1";
          });
        }, 150);
        
        // Save in background
        await onSave(newValue);
        
        // Re-enable renders after a brief delay to ensure smooth transition completes
        setTimeout(() => {
          this.isEditingInline = false;
          // Trigger a render to sync any other changes
          this.render();
        }, 200);
      };

      const cancel = () => {
        // Re-enable renders immediately on cancel
        this.isEditingInline = false;
        
        // Smooth fade transition on cancel
        input.style.opacity = "0";
        setTimeout(() => {
          input.replaceWith(span);
          span.style.opacity = "1";
        }, 150);
      };

      input.onblur = () => void save();
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void save();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
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
    onSave: (value: string) => Promise<void> | void,
    applyConditionalFormatting: boolean = false
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
      
      // Use the configured date format
      const dateFormat = this.plugin.settings.dateFormat || "iso";
      switch (dateFormat) {
        case "iso":
          return `${y}-${m}-${d}`;
        case "us":
          return `${m}/${d}/${y}`;
        case "uk":
          return `${d}/${m}/${y}`;
        default:
          return `${m}/${d}/${y}`;
      }
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

    if (applyConditionalFormatting && !isEmpty) {
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
          if (applyConditionalFormatting && d) {
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
    const allColumns = [
      { key: "drag", label: "", hideable: false, reorderable: false },
      { key: "number", label: "#", hideable: false, reorderable: false },
      { key: "check", label: "", hideable: false, reorderable: false },
      { key: "title", label: "Title", hideable: true, reorderable: true },
      { key: "status", label: "Status", hideable: true, reorderable: true },
      { key: "priority", label: "Priority", hideable: true, reorderable: true },
      { key: "bucket", label: "Bucket", hideable: true, reorderable: true },
      { key: "tags", label: "Tags", hideable: true, reorderable: true },
      { key: "dependencies", label: "Deps", hideable: true, reorderable: true },
      { key: "start", label: "Start Date", hideable: true, reorderable: true },
      { key: "due", label: "Due Date", hideable: true, reorderable: true },
      { key: "created", label: "Created", hideable: true, reorderable: true },
      { key: "modified", label: "Modified", hideable: true, reorderable: true },
      { key: "percentComplete", label: "% Complete", hideable: true, reorderable: true },
      { key: "effortCompleted", label: "Effort Done", hideable: true, reorderable: true },
      { key: "effortRemaining", label: "Effort Left", hideable: true, reorderable: true },
      { key: "effortTotal", label: "Effort Total", hideable: true, reorderable: true },
      { key: "duration", label: "Duration", hideable: true, reorderable: true },
    ];
    
    // Apply custom column order if available
    if (this.columnOrder.length > 0) {
      // Separate non-reorderable columns (drag, number, check)
      const nonReorderable = allColumns.filter(c => !c.reorderable);
      const reorderable = allColumns.filter(c => c.reorderable);
      
      // Sort reorderable columns by custom order
      const orderedReorderable = this.columnOrder
        .map(key => reorderable.find(c => c.key === key))
        .filter(c => c !== undefined) as typeof allColumns;
      
      // Add any new columns that aren't in the saved order
      const missingColumns = reorderable.filter(
        c => !this.columnOrder.includes(c.key)
      );
      
      return [...nonReorderable, ...orderedReorderable, ...missingColumns];
    }
    
    return allColumns;
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
  // Column drag and drop for reordering
  // ---------------------------------------------------------------------------

  private setupColumnDrag(th: HTMLTableCellElement, columnKey: string, headerRow: HTMLTableRowElement) {
    // Drag start
    th.ondragstart = (e) => {
      this.draggedColumnKey = columnKey;
      th.classList.add("planner-column-dragging");
      e.dataTransfer!.effectAllowed = "move";
      e.dataTransfer!.setData("text/plain", columnKey);
    };

    // Drag end
    th.ondragend = () => {
      this.draggedColumnKey = null;
      th.classList.remove("planner-column-dragging");
      // Remove all dragover states
      document.querySelectorAll(".planner-column-dragover").forEach(el => {
        el.classList.remove("planner-column-dragover");
      });
    };

    // Drag over - allow drop
    th.ondragover = (e) => {
      if (!this.draggedColumnKey) return;

      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer!.dropEffect = "move";

      if (this.draggedColumnKey !== columnKey) {
        th.classList.add("planner-column-dragover");
      }
    };

    // Drag leave
    th.ondragleave = (e) => {
      if (!this.draggedColumnKey) return;

      // Only remove highlight if we're actually leaving the column
      const rect = th.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;

      if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
        th.classList.remove("planner-column-dragover");
      }
    };

    // Drop - reorder columns
    th.ondrop = async (e) => {
      if (!this.draggedColumnKey) return;

      e.preventDefault();
      e.stopPropagation();
      th.classList.remove("planner-column-dragover");

      const draggedKey = this.draggedColumnKey;
      const targetKey = columnKey;

      if (draggedKey === targetKey) return;

      // Get all reorderable columns
      const allColumns = this.getColumnDefinitions();
      const reorderableColumns = allColumns.filter((c: any) => c.reorderable);
      
      // Initialize columnOrder if empty, or sync missing columns
      if (this.columnOrder.length === 0) {
        this.columnOrder = reorderableColumns.map(c => c.key);
      } else {
        const missing = reorderableColumns
          .map(c => c.key)
          .filter(k => !this.columnOrder.includes(k));
        if (missing.length > 0) {
          this.columnOrder.push(...missing);
        }
      }

      // Find indices in the order array
      const draggedIndex = this.columnOrder.indexOf(draggedKey);
      const targetIndex = this.columnOrder.indexOf(targetKey);

      if (draggedIndex === -1 || targetIndex === -1) return;

      // Reorder columns array
      const newOrder = [...this.columnOrder];
      const [draggedColumn] = newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedColumn);

      this.columnOrder = newOrder;

      // Save new order and re-render
      this.saveGridViewSettings();
      this.render();
    };
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
    
    if (settings.gridViewColumnOrder) {
      this.columnOrder = [...settings.gridViewColumnOrder];
    }

    // Ensure columnOrder includes ALL reorderable columns (handles newly added columns)
    const allDefs = this.getColumnDefinitions();
    if (this.columnOrder.length > 0) {
      const reorderableKeys = allDefs.filter((c: any) => c.reorderable).map(c => c.key);
      const missing = reorderableKeys.filter(k => !this.columnOrder.includes(k));
      if (missing.length > 0) {
        this.columnOrder.push(...missing);
      }
    }

    // Ensure non-hideable columns stay visible and defaults exist for new columns
    allDefs.forEach((col) => {
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
    settings.gridViewColumnOrder = [...this.columnOrder];

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
            // Don't call render() - TaskStore subscription handles it
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
            // Don't call render() - TaskStore subscription handles it
          });
        });
      });

      menu.showAtMouseEvent(e as MouseEvent);
    };
  }
}
