import { ItemView, WorkspaceLeaf, Menu, setIcon } from "obsidian";
import type ProjectPlannerPlugin from "../main";
import type { PlannerTask } from "../types";
import { TaskStore } from "../stores/taskStore";
import { renderPlannerHeader } from "./Header";

export const VIEW_TYPE_MY_DAY = "project-planner-my-day-view";

type ViewMode = "today" | "week";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Return a date as YYYY-MM-DD (no timezone drift). */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function getTodayDate(): string {
  return toDateStr(new Date());
}

/** Get the Monday-through-Sunday dates for the week containing `anchor`. */
function getWeekDates(anchor: Date): Date[] {
  const d = new Date(anchor);
  const dayOfWeek = d.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const week: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    week.push(day);
  }
  return week;
}

interface MyDayTask {
  task: PlannerTask;
  projectId: string;
  projectName: string;
}

const PRIORITY_WEIGHT: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

function sortTasks(items: MyDayTask[]): MyDayTask[] {
  return [...items].sort((a, b) => {
    if (a.task.completed !== b.task.completed) return a.task.completed ? 1 : -1;
    const wa = PRIORITY_WEIGHT[a.task.priority || "Medium"] ?? 2;
    const wb = PRIORITY_WEIGHT[b.task.priority || "Medium"] ?? 2;
    return wa - wb;
  });
}

export class MyDayView extends ItemView {
  private plugin: ProjectPlannerPlugin;
  private taskStore: TaskStore;
  private unsubscribe: (() => void) | null = null;

  // View mode
  private viewMode: ViewMode = "today";

  // Week navigation anchor (always the displayed week's reference date)
  private weekAnchor: Date = new Date();

  // Task picker panel
  private pickerOpen = false;
  private pickerSearch = "";

  // Scroll position preservation
  private savedScrollTop: number | null = null;
  private savedScrollLeft: number | null = null;
  private renderVersion = 0;

  // Filters (shared across both modes)
  private currentFilters = {
    priority: "All",
    search: "",
    showCompleted: false,
  };

  constructor(leaf: WorkspaceLeaf, plugin: ProjectPlannerPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.taskStore = plugin.taskStore;
  }

  getViewType() {
    return VIEW_TYPE_MY_DAY;
  }

  getDisplayText() {
    return "My Tasks";
  }

  getIcon() {
    return "sun";
  }

  async onOpen() {
    await this.taskStore.ensureLoaded();
    this.unsubscribe = this.taskStore.subscribe(() => this.render());
    this.render();
  }

  async onClose() {
    this.containerEl.empty();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Data helpers
  // ---------------------------------------------------------------------------

  /** Tasks due on a single specific date string (YYYY-MM-DD). */
  private getTasksForDate(dateStr: string): MyDayTask[] {
    const settings = this.plugin.settings;
    const projects = settings.projects || [];
    const result: MyDayTask[] = [];
    for (const project of projects) {
      const tasks = this.taskStore.getAllForProject(project.id) || [];
      for (const task of tasks) {
        if (task.dueDate === dateStr) {
          result.push({ task, projectId: project.id, projectName: project.name });
        }
      }
    }
    return result;
  }

  private getMyDayTasks(): MyDayTask[] {
    return this.getTasksForDate(getTodayDate());
  }

  /** Tasks across all 7 days of the displayed week, keyed by YYYY-MM-DD. */
  private getWeekTaskMap(): Map<string, MyDayTask[]> {
    const weekDates = getWeekDates(this.weekAnchor);
    const dateStrings = weekDates.map(toDateStr);
    const dateSet = new Set(dateStrings);

    const settings = this.plugin.settings;
    const projects = settings.projects || [];
    const map = new Map<string, MyDayTask[]>();
    for (const ds of dateStrings) map.set(ds, []);

    for (const project of projects) {
      const tasks = this.taskStore.getAllForProject(project.id) || [];
      for (const task of tasks) {
        if (task.dueDate && dateSet.has(task.dueDate)) {
          map.get(task.dueDate)!.push({
            task,
            projectId: project.id,
            projectName: project.name,
          });
        }
      }
    }
    return map;
  }

  private applyFilters(items: MyDayTask[]): MyDayTask[] {
    return items.filter(({ task }) => {
      if (!this.currentFilters.showCompleted && task.completed) return false;
      if (this.currentFilters.priority !== "All" && task.priority !== this.currentFilters.priority) {
        return false;
      }
      if (this.currentFilters.search) {
        const q = this.currentFilters.search.toLowerCase();
        if (!task.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Date formatting
  // ---------------------------------------------------------------------------

  private formatDate(dateStr: string | undefined): string {
    if (!dateStr) return "—";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    const fmt = this.plugin.settings.dateFormat || "iso";
    switch (fmt) {
      case "us":
        return `${m}/${d}/${y}`;
      case "uk":
        return `${d}/${m}/${y}`;
      default:
        return `${y}-${m}-${d}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering – entry point
  // ---------------------------------------------------------------------------

  render() {
    const container = this.containerEl;
    const thisRender = ++this.renderVersion;

    // Save scroll position
    const scrollTarget =
      container.querySelector(".myday-content") as HTMLElement ||
      container.querySelector(".myday-week-scroll") as HTMLElement;
    if (scrollTarget && this.savedScrollTop === null) {
      this.savedScrollTop = scrollTarget.scrollTop;
      this.savedScrollLeft = scrollTarget.scrollLeft;
    }

    container.empty();
    const wrapper = container.createDiv("myday-wrapper");

    // Header (with mode tabs)
    this.renderHeader(wrapper);

    // Toolbar (filters)
    this.renderToolbar(wrapper);

    // Body: main content + optional picker panel side-by-side
    const body = wrapper.createDiv("myday-body");

    // Content
    const mainArea = body.createDiv("myday-main");
    if (this.viewMode === "today") {
      this.renderTodayContent(mainArea, thisRender);
    } else {
      this.renderWeekContent(mainArea, thisRender);
    }

    // Task picker panel (slide-in from the right)
    if (this.pickerOpen) {
      this.renderPickerPanel(body);
    }
  }

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------

  private renderHeader(wrapper: HTMLElement) {
    renderPlannerHeader(wrapper, this.plugin, {
      active: "myday",
      hideAddTask: true,
      onProjectChange: async () => {
        await this.plugin.taskStore.load();
        this.render();
      },
      buildExtraActions: (actionsEl) => {
        // Today / Week segmented toggle
        const modeToggle = actionsEl.createDiv("myday-mode-toggle");

        const todayBtn = modeToggle.createEl("button", {
          text: "Today",
          cls: `myday-mode-btn${this.viewMode === "today" ? " myday-mode-btn-active" : ""}`,
        });
        todayBtn.onclick = () => {
          if (this.viewMode !== "today") {
            this.viewMode = "today";
            this.savedScrollTop = null;
            this.savedScrollLeft = null;
            this.render();
          }
        };

        const weekBtn = modeToggle.createEl("button", {
          text: "Week",
          cls: `myday-mode-btn${this.viewMode === "week" ? " myday-mode-btn-active" : ""}`,
        });
        weekBtn.onclick = () => {
          if (this.viewMode !== "week") {
            this.viewMode = "week";
            this.weekAnchor = new Date();
            this.savedScrollTop = null;
            this.savedScrollLeft = null;
            this.render();
          }
        };
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Toolbar
  // ---------------------------------------------------------------------------

  private renderToolbar(wrapper: HTMLElement) {
    const toolbar = wrapper.createDiv("myday-toolbar");

    // Priority filter
    const priorityGroup = toolbar.createDiv("planner-filter-group");
    priorityGroup.createSpan({ cls: "planner-filter-label", text: "Priority:" });
    const prioritySelect = priorityGroup.createEl("select", { cls: "planner-filter-select" });
    ["All", "Low", "Medium", "High", "Critical"].forEach((p) => {
      const opt = prioritySelect.createEl("option", { text: p, value: p });
      if (p === this.currentFilters.priority) opt.selected = true;
    });
    prioritySelect.onchange = () => {
      this.currentFilters.priority = prioritySelect.value;
      this.render();
    };

    // Search
    const searchInput = toolbar.createEl("input", {
      type: "text",
      placeholder: "Search tasks...",
      cls: "planner-filter-search",
    });
    searchInput.value = this.currentFilters.search;
    searchInput.oninput = () => {
      this.currentFilters.search = searchInput.value;
      this.render();
    };

    // Show completed toggle
    const toggleGroup = toolbar.createDiv("myday-toggle-group");
    const toggleLabel = toggleGroup.createEl("label", { cls: "myday-toggle-label" });
    const toggleCheckbox = toggleLabel.createEl("input", { attr: { type: "checkbox" } });
    toggleCheckbox.checked = this.currentFilters.showCompleted;
    toggleLabel.appendText(" Show completed");
    toggleCheckbox.onchange = () => {
      this.currentFilters.showCompleted = toggleCheckbox.checked;
      this.render();
    };

    // Add Tasks button
    const addTasksBtn = toolbar.createEl("button", {
      cls: `myday-add-tasks-btn${this.pickerOpen ? " myday-add-tasks-btn-active" : ""}`,
    });
    const addIcon = addTasksBtn.createSpan("myday-add-tasks-btn-icon");
    setIcon(addIcon, this.pickerOpen ? "x" : "plus-circle");
    addTasksBtn.createSpan({ text: this.pickerOpen ? "Close" : "Add Tasks" });
    addTasksBtn.onclick = () => {
      this.pickerOpen = !this.pickerOpen;
      this.pickerSearch = "";
      this.render();
    };

    // Week navigation (only in week mode)
    if (this.viewMode === "week") {
      const weekNav = toolbar.createDiv("myday-week-nav");

      const prevBtn = weekNav.createEl("button", { cls: "myday-week-nav-btn", title: "Previous week" });
      setIcon(prevBtn, "chevron-left");
      prevBtn.onclick = () => {
        this.weekAnchor.setDate(this.weekAnchor.getDate() - 7);
        this.savedScrollTop = null;
        this.savedScrollLeft = null;
        this.render();
      };

      const todayNavBtn = weekNav.createEl("button", { cls: "myday-week-nav-today", text: "This Week" });
      todayNavBtn.onclick = () => {
        this.weekAnchor = new Date();
        this.savedScrollTop = null;
        this.savedScrollLeft = null;
        this.render();
      };

      const nextBtn = weekNav.createEl("button", { cls: "myday-week-nav-btn", title: "Next week" });
      setIcon(nextBtn, "chevron-right");
      nextBtn.onclick = () => {
        this.weekAnchor.setDate(this.weekAnchor.getDate() + 7);
        this.savedScrollTop = null;
        this.savedScrollLeft = null;
        this.render();
      };
    }
  }

  // ===========================================================================
  // TODAY content (original grid table)
  // ===========================================================================

  private renderTodayContent(wrapper: HTMLElement, thisRender: number) {
    const allItems = this.getMyDayTasks();
    const filtered = this.applyFilters(allItems);
    const content = wrapper.createDiv("myday-content");

    this.restoreScroll(content, thisRender);

    if (filtered.length === 0) {
      this.renderTodayEmpty(content, allItems.length);
      return;
    }

    // Summary bar
    this.renderSummaryBar(content, allItems, filtered);

    // Task table
    this.renderTable(content, filtered);
  }

  private renderTodayEmpty(content: HTMLElement, totalCount: number) {
    const emptyState = content.createDiv("myday-empty");
    const emptyIcon = emptyState.createDiv("myday-empty-icon");
    setIcon(emptyIcon, "sun");
    if (totalCount === 0) {
      emptyState.createDiv({ text: "No tasks due today", cls: "myday-empty-title" });
      emptyState.createDiv({
        text: "Tasks with today's date as their due date will appear here.",
        cls: "myday-empty-subtitle",
      });
    } else {
      emptyState.createDiv({ text: "All tasks filtered out", cls: "myday-empty-title" });
      emptyState.createDiv({
        text: `${totalCount} task(s) due today are hidden by your current filters.`,
        cls: "myday-empty-subtitle",
      });
    }
  }

  private renderSummaryBar(content: HTMLElement, allItems: MyDayTask[], filtered: MyDayTask[]) {
    const completedCount = allItems.filter((i) => i.task.completed).length;
    const totalCount = allItems.length;
    const summaryBar = content.createDiv("myday-summary");
    summaryBar.createSpan({
      text: `${filtered.length} task${filtered.length !== 1 ? "s" : ""} due today`,
      cls: "myday-summary-count",
    });
    if (totalCount > 0) {
      const pct = Math.round((completedCount / totalCount) * 100);
      const progressContainer = summaryBar.createDiv("myday-summary-progress");
      const bar = progressContainer.createDiv("myday-progress-bar");
      const fill = bar.createDiv("myday-progress-fill");
      fill.style.width = `${pct}%`;
      progressContainer.createSpan({
        text: `${completedCount}/${totalCount} done`,
        cls: "myday-progress-label",
      });
    }
  }

  // ===========================================================================
  // WEEK content (Outlook-style day columns)
  // ===========================================================================

  private renderWeekContent(wrapper: HTMLElement, thisRender: number) {
    const weekDates = getWeekDates(this.weekAnchor);
    const taskMap = this.getWeekTaskMap();
    const todayStr = getTodayDate();

    // Week header with date range
    const weekDatesStr = weekDates.map(toDateStr);
    const firstDate = weekDates[0];
    const lastDate = weekDates[6];
    const rangeLabel =
      firstDate.getMonth() === lastDate.getMonth()
        ? `${MONTH_NAMES[firstDate.getMonth()]} ${firstDate.getDate()} – ${lastDate.getDate()}, ${firstDate.getFullYear()}`
        : `${MONTH_NAMES_SHORT[firstDate.getMonth()]} ${firstDate.getDate()} – ${MONTH_NAMES_SHORT[lastDate.getMonth()]} ${lastDate.getDate()}, ${lastDate.getFullYear()}`;

    const weekHeader = wrapper.createDiv("myday-week-header");
    weekHeader.createSpan({ text: rangeLabel, cls: "myday-week-range-label" });

    // Scrollable columns container
    const scroll = wrapper.createDiv("myday-week-scroll");
    this.restoreScroll(scroll, thisRender);

    const columnsContainer = scroll.createDiv("myday-week-columns");

    for (let i = 0; i < 7; i++) {
      const date = weekDates[i];
      const dateStr = weekDatesStr[i];
      const isToday = dateStr === todayStr;
      const rawTasks = taskMap.get(dateStr) || [];
      const filtered = this.applyFilters(rawTasks);

      const column = columnsContainer.createDiv(
        `myday-week-col${isToday ? " myday-week-col-today" : ""}`
      );

      // Column header
      const colHeader = column.createDiv("myday-week-col-header");
      colHeader.createDiv({
        text: DAY_NAMES_SHORT[date.getDay()],
        cls: "myday-week-col-day",
      });
      const dateNumEl = colHeader.createDiv({
        text: String(date.getDate()),
        cls: `myday-week-col-num${isToday ? " myday-week-col-num-today" : ""}`,
      });
      if (rawTasks.length > 0) {
        colHeader.createDiv({
          text: `${filtered.length} task${filtered.length !== 1 ? "s" : ""}`,
          cls: "myday-week-col-count",
        });
      }

      // Column body (task cards)
      const colBody = column.createDiv("myday-week-col-body");

      if (filtered.length === 0) {
        if (rawTasks.length > 0) {
          colBody.createDiv({ text: "Filtered", cls: "myday-week-col-empty" });
        }
        // Otherwise leave empty — no need for a message on days with nothing
        continue;
      }

      const sorted = sortTasks(filtered);
      for (const item of sorted) {
        this.renderWeekCard(colBody, item);
      }
    }
  }

  private renderWeekCard(container: HTMLElement, item: MyDayTask) {
    const { task, projectName } = item;
    const card = container.createDiv(
      `myday-week-card${task.completed ? " myday-week-card-completed" : ""}`
    );

    // Top row: checkbox + title
    const cardTop = card.createDiv("myday-week-card-top");
    const checkbox = cardTop.createEl("input", { attr: { type: "checkbox" } });
    checkbox.checked = !!task.completed;
    checkbox.onclick = (evt) => evt.stopPropagation();
    checkbox.onchange = async () => {
      const isDone = checkbox.checked;
      await this.taskStore.updateTask(task.id, {
        completed: isDone,
        status: isDone ? "Completed" : "Not Started",
      });
    };

    const titleSpan = cardTop.createSpan({
      text: task.title,
      cls: `myday-week-card-title${task.completed ? " myday-task-completed" : ""}`,
    });
    titleSpan.onclick = () => this.plugin.openTaskDetail(task);

    // Bottom row: project + priority pill
    const cardBottom = card.createDiv("myday-week-card-bottom");
    cardBottom.createSpan({ text: projectName, cls: "myday-week-card-project" });
    this.createPriorityPill(cardBottom, task.priority || "Medium");

    // Context menu
    card.oncontextmenu = (evt) => {
      evt.preventDefault();
      this.showRowMenu(item, evt);
    };
  }

  // ===========================================================================
  // Task picker panel
  // ===========================================================================

  private getAllPickerTasks(): { projectName: string; projectId: string; tasks: PlannerTask[] }[] {
    const settings = this.plugin.settings;
    const projects = settings.projects || [];
    const today = getTodayDate();
    const result: { projectName: string; projectId: string; tasks: PlannerTask[] }[] = [];

    for (const project of projects) {
      const allTasks = this.taskStore.getAllForProject(project.id) || [];
      // Show incomplete tasks that are NOT already due today
      const eligible = allTasks.filter((t) => !t.completed && t.dueDate !== today);
      if (eligible.length > 0) {
        result.push({ projectName: project.name, projectId: project.id, tasks: eligible });
      }
    }
    return result;
  }

  private renderPickerPanel(body: HTMLElement) {
    const panel = body.createDiv("myday-picker");

    // Panel header
    const panelHeader = panel.createDiv("myday-picker-header");
    panelHeader.createDiv({ text: "Add Tasks to My Day", cls: "myday-picker-title" });
    const closeBtn = panelHeader.createEl("button", { cls: "myday-picker-close", title: "Close" });
    setIcon(closeBtn, "x");
    closeBtn.onclick = () => {
      this.pickerOpen = false;
      this.pickerSearch = "";
      this.render();
    };

    // Search
    const searchInput = panel.createEl("input", {
      type: "text",
      placeholder: "Search tasks...",
      cls: "myday-picker-search",
    });
    searchInput.value = this.pickerSearch;
    searchInput.oninput = () => {
      this.pickerSearch = searchInput.value;
      this.renderPickerList(panel);
    };
    // Auto-focus search when picker opens
    requestAnimationFrame(() => searchInput.focus());

    // Task list container
    this.renderPickerList(panel);
  }

  private renderPickerList(panel: HTMLElement) {
    // Remove old list if re-rendering (from search)
    const existing = panel.querySelector(".myday-picker-list");
    if (existing) existing.remove();

    const list = panel.createDiv("myday-picker-list");
    const groups = this.getAllPickerTasks();
    const query = this.pickerSearch.toLowerCase();
    let totalShown = 0;

    for (const group of groups) {
      const matchingTasks = query
        ? group.tasks.filter((t) => t.title.toLowerCase().includes(query))
        : group.tasks;
      if (matchingTasks.length === 0) continue;

      // Project group header
      list.createDiv({ text: group.projectName, cls: "myday-picker-group" });

      for (const task of matchingTasks) {
        totalShown++;
        const row = list.createDiv("myday-picker-row");

        // Task info
        const info = row.createDiv("myday-picker-row-info");
        info.createDiv({ text: task.title, cls: "myday-picker-row-title" });

        const meta = info.createDiv("myday-picker-row-meta");
        if (task.priority) {
          this.createPriorityPill(meta, task.priority);
        }
        if (task.dueDate) {
          meta.createSpan({ text: this.formatDate(task.dueDate), cls: "myday-picker-row-date" });
        } else {
          meta.createSpan({ text: "No due date", cls: "myday-picker-row-date myday-picker-row-nodate" });
        }

        // Add button
        const addBtn = row.createEl("button", {
          cls: "myday-picker-add-btn",
          title: "Set due date to today",
        });
        const btnIcon = addBtn.createSpan();
        setIcon(btnIcon, "plus");
        addBtn.createSpan({ text: "Add" });
        addBtn.onclick = async () => {
          await this.taskStore.updateTask(task.id, { dueDate: getTodayDate() });
        };
      }
    }

    if (totalShown === 0) {
      const empty = list.createDiv("myday-picker-empty");
      if (query) {
        empty.textContent = "No tasks matching your search.";
      } else {
        empty.textContent = "All tasks are either completed or already due today.";
      }
    }
  }

  // ===========================================================================
  // Shared helpers
  // ===========================================================================

  private restoreScroll(el: HTMLElement, thisRender: number) {
    if (this.savedScrollTop !== null || this.savedScrollLeft !== null) {
      const top = this.savedScrollTop;
      const left = this.savedScrollLeft;
      requestAnimationFrame(() => {
        if (this.renderVersion !== thisRender) return;
        if (top !== null) el.scrollTop = top;
        if (left !== null) el.scrollLeft = left;
        this.savedScrollTop = null;
        this.savedScrollLeft = null;
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Today-mode table
  // ---------------------------------------------------------------------------

  private renderTable(content: HTMLElement, items: MyDayTask[]) {
    const table = content.createEl("table", { cls: "myday-table" });

    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    ["", "Task", "Project", "Status", "Priority", "Due"].forEach((label) => {
      headerRow.createEl("th", { text: label });
    });

    const tbody = table.createEl("tbody");
    const sorted = sortTasks(items);
    for (const item of sorted) {
      this.renderRow(tbody, item);
    }
  }

  private renderRow(tbody: HTMLElement, item: MyDayTask) {
    const { task, projectName } = item;
    const row = tbody.createEl("tr", { cls: "myday-row" });
    if (task.completed) row.classList.add("myday-row-completed");

    // Checkbox
    const checkCell = row.createEl("td", { cls: "myday-check-cell" });
    const checkbox = checkCell.createEl("input", { attr: { type: "checkbox" } });
    checkbox.checked = !!task.completed;
    checkbox.onchange = async () => {
      const isDone = checkbox.checked;
      await this.taskStore.updateTask(task.id, {
        completed: isDone,
        status: isDone ? "Completed" : "Not Started",
      });
    };

    // Title
    const titleCell = row.createEl("td", { cls: "myday-title-cell" });
    const titleSpan = titleCell.createSpan({ text: task.title, cls: "myday-task-title" });
    if (task.completed) titleSpan.classList.add("myday-task-completed");
    titleSpan.onclick = () => this.plugin.openTaskDetail(task);

    // Project
    row.createEl("td", { text: projectName, cls: "myday-project-cell" });

    // Status pill
    const statusCell = row.createEl("td");
    this.createStatusPill(statusCell, task.status);

    // Priority pill
    const priorityCell = row.createEl("td");
    this.createPriorityPill(priorityCell, task.priority || "Medium");

    // Due date
    row.createEl("td", { text: this.formatDate(task.dueDate), cls: "myday-date-cell" });

    // Right-click context menu
    row.oncontextmenu = (evt) => {
      evt.preventDefault();
      this.showRowMenu(item, evt);
    };
  }

  // ---------------------------------------------------------------------------
  // Pills
  // ---------------------------------------------------------------------------

  private createStatusPill(container: HTMLElement, status: string) {
    const settings = this.plugin.settings;
    const statusDef = settings.availableStatuses?.find((s) => s.name === status);
    const color = statusDef?.color || "var(--text-muted)";
    const pill = container.createSpan({ text: status, cls: "planner-status-pill" });
    pill.style.setProperty("--status-color", color);
  }

  private createPriorityPill(container: HTMLElement, priority: string) {
    const settings = this.plugin.settings;
    const priorityDef = settings.availablePriorities?.find((p) => p.name === priority);
    const color = priorityDef?.color || "var(--text-muted)";
    const pill = container.createSpan({ text: priority, cls: "planner-priority-pill" });
    pill.style.setProperty("--priority-color", color);
  }

  // ---------------------------------------------------------------------------
  // Context menu
  // ---------------------------------------------------------------------------

  private showRowMenu(item: MyDayTask, evt: MouseEvent) {
    const menu = new Menu();
    const { task, projectId, projectName } = item;

    menu.addItem((i) =>
      i
        .setTitle("Open details")
        .setIcon("pencil")
        .onClick(() => this.plugin.openTaskDetail(task))
    );

    menu.addItem((i) =>
      i
        .setTitle(task.completed ? "Mark incomplete" : "Mark complete")
        .setIcon(task.completed ? "circle" : "check-circle")
        .onClick(async () => {
          const isDone = !task.completed;
          await this.taskStore.updateTask(task.id, {
            completed: isDone,
            status: isDone ? "Completed" : "Not Started",
          });
        })
    );

    menu.addItem((i) =>
      i
        .setTitle("Remove from My Day")
        .setIcon("calendar-minus")
        .onClick(async () => {
          await this.taskStore.updateTask(task.id, { dueDate: "" });
        })
    );

    menu.addSeparator();

    menu.addItem((i) =>
      i
        .setTitle(`Project: ${projectName}`)
        .setIcon("folder")
        .setDisabled(true)
    );

    menu.showAtMouseEvent(evt);
  }
}
