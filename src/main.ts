import { Plugin, WorkspaceLeaf } from "obsidian";

import {
  ProjectPlannerSettingTab,
  DEFAULT_SETTINGS,
  ProjectPlannerSettings,
} from "./settings";

import { GridView } from "./ui/GridView";
import { BoardView, VIEW_TYPE_BOARD } from "./ui/BoardView";
import { TaskDetailView, VIEW_TYPE_TASK_DETAIL } from "./ui/TaskDetailView";
import { DependencyGraphView, VIEW_TYPE_DEPENDENCY_GRAPH } from "./ui/DependencyGraphView";
import { VIEW_TYPE_GANTT, GanttView } from "./ui/GanttView";
import { DashboardView, VIEW_TYPE_DASHBOARD } from "./ui/DashboardView";

import { ProjectHubManager } from "./utils/ProjectHubManager";
import { TaskStore } from "./stores/taskStore";

import type { PlannerTask } from "./types";

// Internal plugin view type
const VIEW_TYPE_PLANNER = "project-planner-view";

// Shape of the persisted data file
interface ProjectPlannerData {
  settings?: ProjectPlannerSettings;
  tasks?: PlannerTask[]; // legacy single-project
  tasksByProject?: Record<string, PlannerTask[]>;
  [key: string]: unknown; // allow future expansion
}

export default class ProjectPlannerPlugin extends Plugin {
  settings!: ProjectPlannerSettings;
  hubManager!: ProjectHubManager;
  taskStore!: TaskStore;
  private inlineStyleEl: HTMLStyleElement | null = null;

  async onload() {
    console.log("Loading Project Planner plugin");

    await this.loadSettings();

    // Ensure stylesheet is present (self-heal if Obsidian didn't attach it)
    await this.ensureStylesheetLoaded();

    // Initialize hub manager
    this.hubManager = new ProjectHubManager(this);

    // Initialize central task store
    this.taskStore = new TaskStore(this);
    await this.taskStore.load();

    // Ribbon icons
    this.addRibbonIcon("calendar-check", "Open Project Planner", async () => {
      await this.activateView();
    });

    this.addRibbonIcon("layout-dashboard", "Open Dashboard", async () => {
      await this.activateDashboardView();
    });

    this.addRibbonIcon("layout-grid", "Open Board View", async () => {
      await this.activateBoardView();
    });

    this.addRibbonIcon("git-fork", "Open Dependency Graph", async () => {
      await this.openDependencyGraph();
    });

    // Register main GridView
    this.registerView(
      VIEW_TYPE_PLANNER,
      (leaf: WorkspaceLeaf) => new GridView(leaf, this)
    );

    // Register Board View
    this.registerView(
      VIEW_TYPE_BOARD,
      (leaf: WorkspaceLeaf) => new BoardView(leaf, this)
    );

    // Register right-side Task Detail Panel
    this.registerView(
      VIEW_TYPE_TASK_DETAIL,
      (leaf: WorkspaceLeaf) => new TaskDetailView(leaf, this)
    );

    // Register Dependency Graph View
    this.registerView(
      VIEW_TYPE_DEPENDENCY_GRAPH,
      (leaf: WorkspaceLeaf) => new DependencyGraphView(leaf, this)
    );

    // Register Gantt View (Timeline)
    this.registerView(
      VIEW_TYPE_GANTT,
      (leaf: WorkspaceLeaf) => new GanttView(leaf, this)
    );

    // Register Dashboard View
    this.registerView(
      VIEW_TYPE_DASHBOARD,
      (leaf: WorkspaceLeaf) => new DashboardView(leaf, this)
    );

    // Command palette entry
    this.addCommand({
      id: "open-project-planner",
      name: "Open Project Planner",
      callback: async () => await this.activateView(),
    });

    // Command: Open Board View
    this.addCommand({
      id: "open-board-view",
      name: "Open Board View",
      callback: async () => await this.activateBoardView(),
    });

    // Command: Open Dependency Graph
    this.addCommand({
      id: "open-dependency-graph",
      name: "Open Dependency Graph",
      callback: async () => await this.openDependencyGraph(),
    });

    // Command: Open Timeline (Gantt)
    this.addCommand({
      id: "open-gantt-view",
      name: "Open Timeline (Gantt) View",
      callback: async () => await this.activateGanttView(),
    });

    // Command: Open Dashboard
    this.addCommand({
      id: "open-dashboard-view",
      name: "Open Dashboard",
      callback: async () => await this.activateDashboardView(),
    });

    // Command: Create/Update Project Hub
    this.addCommand({
      id: "create-project-hub",
      name: "Create/Update Project Hub",
      callback: async () => await this.createProjectHub(),
    });

    // Command: Create Task Notes
    this.addCommand({
      id: "create-task-notes",
      name: "Create Notes for All Tasks",
      callback: async () => await this.createTaskNotes(),
    });

    // Register URI protocol handler for opening tasks directly
    this.registerObsidianProtocolHandler("open-planner-task", async (params) => {
      const taskId = params.id;
      const projectId = params.project;
      if (taskId) {
        await this.openTaskById(taskId, projectId);
      }
    });

    // Settings tab
    this.addSettingTab(new ProjectPlannerSettingTab(this.app, this));

    // Open default view if configured - wait for workspace to be ready
    this.app.workspace.onLayoutReady(() => {
      void this.openDefaultView();
    });
  }

  private async ensureStylesheetLoaded() {
    const head = document.head;
    const hasLink = Array.from(head.querySelectorAll('link[rel="stylesheet"]'))
      .some((l) => (l as HTMLLinkElement).href.includes(this.manifest.id) && (l as HTMLLinkElement).href.endsWith("styles.css"));

    if (hasLink) return;

    try {
      // Attempt to read stylesheet directly from vault (plugin is inside .obsidian/plugins)
      const cssPath = `.obsidian/plugins/${this.manifest.id}/styles.css`;
      const css = await (this.app.vault.adapter as any).read(cssPath);
      if (css && typeof css === 'string') {
        const styleEl = document.createElement('style');
        styleEl.id = `${this.manifest.id}-inline-style`;
        styleEl.textContent = css;
        head.appendChild(styleEl);
        this.inlineStyleEl = styleEl;
        console.info("Project Planner: injected stylesheet inline as fallback.");
      }
    } catch (e) {
      console.warn("Project Planner: could not auto-inject stylesheet", e);
    }
  }

  // ---------------------------------------------------------------------------
  // Open MAIN planner view (center workspace)
  // ---------------------------------------------------------------------------
  async activateView(forceNewTab = false): Promise<WorkspaceLeaf> {
    const openInNewTab = forceNewTab || this.settings?.openViewsInNewTab === true;
    const leaf = openInNewTab
      ? this.app.workspace.getLeaf('tab')
      : this.app.workspace.activeLeaf ?? this.app.workspace.getLeaf(true);

    await leaf.setViewState({
      type: VIEW_TYPE_PLANNER,
      active: true,
    });

    this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  // ---------------------------------------------------------------------------
  // Open BOARD view (center workspace)
  // ---------------------------------------------------------------------------
  async activateBoardView(forceNewTab = false): Promise<WorkspaceLeaf> {
    const openInNewTab = forceNewTab || this.settings?.openViewsInNewTab === true;
    const leaf = openInNewTab
      ? this.app.workspace.getLeaf('tab')
      : this.app.workspace.activeLeaf ?? this.app.workspace.getLeaf(true);

    await leaf.setViewState({
      type: VIEW_TYPE_BOARD,
      active: true,
    });

    this.app.workspace.revealLeaf(leaf);
    return leaf;
  }
  // ---------------------------------------------------------------------------
  // Open DASHBOARD view (center workspace)
  // ---------------------------------------------------------------------------
  async activateDashboardView(forceNewTab = false): Promise<WorkspaceLeaf> {
    const openInNewTab = forceNewTab || this.settings?.openViewsInNewTab === true;
    const leaf = openInNewTab
      ? this.app.workspace.getLeaf('tab')
      : this.app.workspace.activeLeaf ?? this.app.workspace.getLeaf(true);

    await leaf.setViewState({
      type: VIEW_TYPE_DASHBOARD,
      active: true,
    });

    this.app.workspace.revealLeaf(leaf);
    return leaf;
  }
  // ---------------------------------------------------------------------------
  // Open GANTT view (center workspace)
  // ---------------------------------------------------------------------------
  async activateGanttView(forceNewTab = false): Promise<WorkspaceLeaf> {
    const openInNewTab = forceNewTab || this.settings?.openViewsInNewTab === true;
    const leaf = openInNewTab
      ? this.app.workspace.getLeaf('tab')
      : this.app.workspace.activeLeaf ?? this.app.workspace.getLeaf(true);

    await leaf.setViewState({
      type: VIEW_TYPE_GANTT,
      active: true,
    });

    this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  // ---------------------------------------------------------------------------
  // Open Task Detail Panel (RIGHT-SIDE split)
  // ---------------------------------------------------------------------------
  async openTaskDetail(task: PlannerTask) {
    const { workspace } = this.app;

    // Reuse existing detail view if possible
    let detailLeaf = workspace.getLeavesOfType(VIEW_TYPE_TASK_DETAIL)[0];

    // Otherwise create a right-hand split
    if (!detailLeaf) {
      const rightLeaf = (workspace as any).getRightLeaf
        ? (workspace as any).getRightLeaf(false)
        : null;
      detailLeaf = rightLeaf ?? workspace.getLeaf(true);
    }

    await detailLeaf.setViewState({
      type: VIEW_TYPE_TASK_DETAIL,
      active: true,
    });

    const view = detailLeaf.view as TaskDetailView;
    view.setTask(task);

    workspace.revealLeaf(detailLeaf);
  }

  // ---------------------------------------------------------------------------
  // Shared Task Update API — used by GridView, BoardView + TaskDetailView
  // ---------------------------------------------------------------------------
  public async updateTask(id: string, fields: Partial<PlannerTask>) {
    await this.taskStore.updateTask(id, fields);
  }

  // ---------------------------------------------------------------------------
  // Settings (non-destructive merge, supports migration)
  // ---------------------------------------------------------------------------
  async loadSettings() {
    const raw = ((await this.loadData()) || {}) as ProjectPlannerData;

    // Load settings if nested, otherwise fall back to legacy root
    const storedSettings =
      raw.settings ??
      ((raw as unknown) as ProjectPlannerSettings); // legacy root-level settings

    this.settings = Object.assign({}, DEFAULT_SETTINGS, storedSettings);
    console.log("[Project Planner] Settings loaded - openViewsInNewTab:", this.settings.openViewsInNewTab);
    // Ensure we have at least one project
    if (!this.settings.projects || this.settings.projects.length === 0) {
      const defaultProjectId = crypto.randomUUID();
      this.settings.projects = [{ id: defaultProjectId, name: "My Project" }];
      this.settings.activeProjectId = defaultProjectId;
    }

    // Ensure activeProjectId is valid
    if (
      !this.settings.activeProjectId ||
      !this.settings.projects.some(
        (p) => p.id === this.settings!.activeProjectId
      )
    ) {
      this.settings.activeProjectId = this.settings.projects[0].id;
    }

    // Ensure default statuses exist
    if (!this.settings.availableStatuses || this.settings.availableStatuses.length === 0) {
      this.settings.availableStatuses = DEFAULT_SETTINGS.availableStatuses;
    }

    // Ensure default priorities exist
    if (!this.settings.availablePriorities || this.settings.availablePriorities.length === 0) {
      this.settings.availablePriorities = DEFAULT_SETTINGS.availablePriorities;
    }

    // Save settings nested properly
    await this.saveSettings();
  }

  async saveSettings() {
    const raw = ((await this.loadData()) || {}) as ProjectPlannerData;

    // Save ONLY under .settings — Preserve ALL other keys (tasksByProject, etc.)
    raw.settings = this.settings;

    await this.saveData(raw);
  }

  setActiveProject(projectId: string) {
    const found = this.settings.projects.find((p) => p.id === projectId);
    if (!found) return;

    this.settings.activeProjectId = projectId;
    void this.saveSettings();
  }

  // ---------------------------------------------------------------------------
  // Open Dependency Graph View
  // ---------------------------------------------------------------------------
  async openDependencyGraph() {
    const openInNewTab = this.settings?.openViewsInNewTab === true;
    const leaf = openInNewTab
      ? this.app.workspace.getLeaf('tab')
      : this.app.workspace.activeLeaf ?? this.app.workspace.getLeaf(true);

    await leaf.setViewState({
      type: VIEW_TYPE_DEPENDENCY_GRAPH,
      active: true,
    });

    this.app.workspace.revealLeaf(leaf);
  }

  private async openDefaultView() {
    const choice = this.settings.defaultView;
    // Always force new tab during plugin initialization
    switch (choice) {
      case "board":
        await this.activateBoardView(true);
        break;
      case "gantt":
        await this.activateGanttView(true);
        break;
      case "grid":
      default:
        await this.activateView(true);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Open Task by ID (from URI link)
  // ---------------------------------------------------------------------------
  async openTaskById(taskId: string, projectId?: string) {
    // Switch to the project if specified
    if (projectId && projectId !== this.settings.activeProjectId) {
      const projectExists = this.settings.projects.some(p => p.id === projectId);
      if (projectExists) {
        this.setActiveProject(projectId);
        await this.taskStore.load();
      }
    }

    // Ensure store is ready and find task directly
    await this.taskStore.ensureLoaded();
    const task = this.taskStore.getAll().find((t: PlannerTask) => t.id === taskId);
    if (task) {
      await this.openTaskDetail(task);
    } else {
      console.warn(`Task with ID ${taskId} not found`);
    }
  }

  // ---------------------------------------------------------------------------
  // Project Hub Management
  // ---------------------------------------------------------------------------
  async createProjectHub() {
    await this.taskStore.ensureLoaded();
    const tasks = this.taskStore.getAll();
    const activeProject = this.settings.projects.find(
      p => p.id === this.settings.activeProjectId
    );

    if (activeProject) {
      await this.hubManager.createOrUpdateProjectHub(activeProject.name, tasks);
    }
  }

  async createTaskNotes() {
    await this.taskStore.ensureLoaded();
    const tasks = this.taskStore.getAll();
    const activeProject = this.settings.projects.find(
      p => p.id === this.settings.activeProjectId
    );

    if (!activeProject) return;

    for (const task of tasks) {
      await this.hubManager.createTaskNote(task, activeProject.name);

      // Add backlinks for task links
      if (task.links) {
        for (const link of task.links) {
          if (link.type === "obsidian") {
            await this.hubManager.addBacklinkToNote(
              link.url + ".md",
              task.title,
              activeProject.name
            );
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------
  onunload() {
    if (this.inlineStyleEl && this.inlineStyleEl.parentElement) {
      this.inlineStyleEl.parentElement.removeChild(this.inlineStyleEl);
      this.inlineStyleEl = null;
    }
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_PLANNER);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_BOARD);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TASK_DETAIL);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_DEPENDENCY_GRAPH);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_GANTT);
  }
}
