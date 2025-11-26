import { Plugin, WorkspaceLeaf } from "obsidian";

import {
  ProjectPlannerSettingTab,
  DEFAULT_SETTINGS,
  ProjectPlannerSettings,
} from "./settings";

import { GridView } from "./ui/GridView";
import { TaskDetailView, VIEW_TYPE_TASK_DETAIL } from "./ui/TaskDetailView";

import type { PlannerTask } from "./types";

// Internal plugin view type
const VIEW_TYPE_PLANNER = "project-planner-view";

export default class ProjectPlannerPlugin extends Plugin {
  settings!: ProjectPlannerSettings;

  async onload() {
    console.log("Loading Project Planner plugin");

    await this.loadSettings();

    // Ribbon icon
    this.addRibbonIcon("calendar-check", "Open Project Planner", async () => {
      await this.activateView();
    });

    // Register main GridView
    this.registerView(
      VIEW_TYPE_PLANNER,
      (leaf: WorkspaceLeaf) => new GridView(leaf, this)
    );

    // Register right-side Task Detail Panel
    this.registerView(
      VIEW_TYPE_TASK_DETAIL,
      (leaf: WorkspaceLeaf) => new TaskDetailView(leaf, this)
    );

    // Command palette entry
    this.addCommand({
      id: "open-project-planner",
      name: "Open Project Planner",
      callback: async () => await this.activateView(),
    });

    // Settings tab
    this.addSettingTab(new ProjectPlannerSettingTab(this.app, this));
  }

  // ---------------------------------------------------------------------------
  // Open MAIN planner view (center workspace)
  // ---------------------------------------------------------------------------
  async activateView(): Promise<WorkspaceLeaf> {
    const leaf = this.app.workspace.getLeaf(true);

    await leaf.setViewState({
      type: VIEW_TYPE_PLANNER,
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
      const activeLeaf = workspace.activeLeaf ?? workspace.getLeaf(true);
      workspace.revealLeaf(activeLeaf);

      // Vertical split = LEFT | RIGHT
      detailLeaf = workspace.getLeaf("split", "vertical");
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
  // Shared Task Update API — used by GridView + TaskDetailView
  // ---------------------------------------------------------------------------
  public async updateTask(id: string, fields: Partial<PlannerTask>) {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PLANNER)[0];
    if (!leaf) return;

    const grid = leaf.view as any;

    if (grid && typeof grid.updateTask === "function") {
      await grid.updateTask(id, fields);
    }
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Ensure we have at least one project
    if (!this.settings.projects || this.settings.projects.length === 0) {
      const defaultProjectId = crypto.randomUUID();
      this.settings.projects = [
        { id: defaultProjectId, name: "My Project" },
      ];
      this.settings.activeProjectId = defaultProjectId;
    }

    // If activeProjectId is missing or invalid, pick the first project
    if (
      !this.settings.activeProjectId ||
      !this.settings.projects.some((p) => p.id === this.settings.activeProjectId)
    ) {
      this.settings.activeProjectId = this.settings.projects[0].id;
    }

    await this.saveSettings();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  setActiveProject(projectId: string) {
    const found = this.settings.projects.find((p) => p.id === projectId);
    if (!found) return;
    this.settings.activeProjectId = projectId;
    void this.saveSettings();
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------
  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_PLANNER);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TASK_DETAIL);
  }
}
