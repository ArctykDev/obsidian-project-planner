import { Plugin, WorkspaceLeaf, Notice } from "obsidian";

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

import { TaskStore } from "./stores/taskStore";
import { TaskSync } from "./utils/TaskSync";
import { DailyNoteTaskScanner } from "./utils/DailyNoteTaskScanner";

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
  taskStore!: TaskStore;
  taskSync!: TaskSync;
  dailyNoteScanner!: DailyNoteTaskScanner;
  private inlineStyleEl: HTMLStyleElement | null = null;

  async onload() {
    await this.loadSettings();

    // Migrate existing projects to add timestamps if missing
    this.migrateProjectTimestamps();

    // Ensure stylesheet is present (self-heal if Obsidian didn't attach it)
    await this.ensureStylesheetLoaded();

    // Initialize central task store
    this.taskStore = new TaskStore(this);
    await this.taskStore.load();

    // Initialize task sync system
    this.taskSync = new TaskSync(this.app, this);

    // Initialize daily note task scanner
    this.dailyNoteScanner = new DailyNoteTaskScanner(this.app, this);

    // Start sync if enabled
    if (this.settings.enableMarkdownSync) {
      await this.initializeTaskSync();
    }

    // Start daily note scanning if enabled
    if (this.settings.enableDailyNoteSync) {
      await this.initializeDailyNoteScanner();
    }

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

    // Add ribbon icon for daily note scanning (if enabled)
    if (this.settings.enableDailyNoteSync) {
      this.addRibbonIcon("scan", "Scan Daily Notes for Tasks", async () => {
        await this.dailyNoteScanner.quickScan();
      });
    }

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

    // Command: Scan Daily Notes
    this.addCommand({
      id: "scan-daily-notes",
      name: "Scan Daily Notes for Tagged Tasks",
      callback: async () => {
        if (this.settings.enableDailyNoteSync) {
          await this.dailyNoteScanner.quickScan();
        } else {
          new Notice('Daily note scanning is disabled. Enable it in settings.');
        }
      },
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
  }

  private migrateProjectTimestamps() {
    let updated = false;
    const now = new Date().toISOString();

    for (const project of this.settings.projects) {
      if (!project.createdDate) {
        project.createdDate = now;
        updated = true;
      }
      if (!project.lastUpdatedDate) {
        project.lastUpdatedDate = now;
        updated = true;
      }
    }

    if (updated) {
      void this.saveSettings();
    }
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
    let leaf: WorkspaceLeaf;
    
    if (openInNewTab) {
      leaf = this.app.workspace.getLeaf('tab');
    } else {
      leaf = this.app.workspace.getMostRecentLeaf() ?? this.app.workspace.getLeaf(true);
    }

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
    let leaf: WorkspaceLeaf;
    
    if (openInNewTab) {
      leaf = this.app.workspace.getLeaf('tab');
    } else {
      leaf = this.app.workspace.getMostRecentLeaf() ?? this.app.workspace.getLeaf(true);
    }

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
    let leaf: WorkspaceLeaf;
    
    if (openInNewTab) {
      leaf = this.app.workspace.getLeaf('tab');
    } else {
      leaf = this.app.workspace.getMostRecentLeaf() ?? this.app.workspace.getLeaf(true);
    }

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
    let leaf: WorkspaceLeaf;
    
    if (openInNewTab) {
      leaf = this.app.workspace.getLeaf('tab');
    } else {
      leaf = this.app.workspace.getMostRecentLeaf() ?? this.app.workspace.getLeaf(true);
    }

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

    // Sync to markdown if enabled
    if (this.settings.enableMarkdownSync && this.settings.autoCreateTaskNotes) {
      const task = this.taskStore.getTaskById(id);
      if (task) {
        await this.taskSync.syncTaskToMarkdown(task, this.settings.activeProjectId);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Task Sync Methods
  // ---------------------------------------------------------------------------
  async initializeTaskSync() {
    const activeProject = this.settings.projects.find(
      p => p.id === this.settings.activeProjectId
    );
    if (!activeProject) return;

    // Start watching for file changes
    this.taskSync.watchProjectFolder(activeProject.id, activeProject.name);

    // Perform initial sync if enabled
    if (this.settings.syncOnStartup) {
      await this.taskSync.initialSync(activeProject.id, activeProject.name);
    }
  }

  async initializeDailyNoteScanner() {
    if (!this.dailyNoteScanner) {
      console.error('[DailyNoteScanner] Scanner not initialized');
      return;
    }

    // Set up file watchers
    this.dailyNoteScanner.setupWatchers();

    // Perform initial scan
    await this.dailyNoteScanner.scanAllNotes();
  }

  async syncAllTasksToMarkdown() {
    const activeProject = this.settings.projects.find(
      p => p.id === this.settings.activeProjectId
    );
    if (!activeProject) return;

    const tasks = this.taskStore.getTasks();

    for (const task of tasks) {
      await this.taskSync.syncTaskToMarkdown(task, activeProject.id);
    }
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
    let leaf: WorkspaceLeaf;
    
    if (openInNewTab) {
      leaf = this.app.workspace.getLeaf('tab');
    } else {
      leaf = this.app.workspace.getMostRecentLeaf() ?? this.app.workspace.getLeaf(true);
    }

    await leaf.setViewState({
      type: VIEW_TYPE_DEPENDENCY_GRAPH,
      active: true,
    });

    this.app.workspace.revealLeaf(leaf);
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
  // Create Task Notes
  // ---------------------------------------------------------------------------
  async createTaskNotes() {
    await this.taskStore.ensureLoaded();
    const tasks = this.taskStore.getAll();
    const activeProject = this.settings.projects.find(
      p => p.id === this.settings.activeProjectId
    );

    if (!activeProject) return;

    const folderPath = `${activeProject.name}/Tasks`;

    // Ensure folder exists
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    }

    for (const task of tasks) {
      const fileName = `${folderPath}/${task.title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
      const existingFile = this.app.vault.getAbstractFileByPath(fileName);

      let content = `# ${task.title}\n\n`;
      content += `**Status**: ${task.status}\n`;
      if (task.priority) content += `**Priority**: ${task.priority}\n`;
      if (task.startDate) content += `**Start Date**: ${task.startDate}\n`;
      if (task.dueDate) content += `**Due Date**: ${task.dueDate}\n`;
      content += `\n---\n\n`;
      if (task.description) content += `${task.description}\n\n`;

      if (task.dependencies && task.dependencies.length > 0) {
        content += `## Dependencies\n\n`;
        task.dependencies.forEach(dep => {
          const depTask = tasks.find(t => t.id === dep.predecessorId);
          if (depTask) {
            content += `- ${dep.type}: [[${depTask.title}]]\n`;
          }
        });
        content += `\n`;
      }

      if (task.links && task.links.length > 0) {
        content += `## Links\n\n`;
        task.links.forEach(link => {
          if (link.type === "obsidian") {
            content += `- [[${link.url}]]\n`;
          } else {
            content += `- [${link.url}](${link.url})\n`;
          }
        });
        content += `\n`;
      }

      content += `\n---\n*Task from Project: ${activeProject.name}*\n`;

      if (existingFile) {
        await this.app.vault.modify(existingFile as any, content);
      } else {
        await this.app.vault.create(fileName, content);
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
  }
}
