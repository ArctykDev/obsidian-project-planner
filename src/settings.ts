import { App, PluginSettingTab, Setting } from "obsidian";
import type ProjectPlannerPlugin from "./main";

export interface PlannerProject {
  id: string;
  name: string;
}

export interface ProjectPlannerSettings {
  projects: PlannerProject[];
  activeProjectId: string;
  defaultView: "grid" | "board" | "gantt";
  showCompleted: boolean;
}

export const DEFAULT_SETTINGS: ProjectPlannerSettings = {
  projects: [],
  activeProjectId: "",
  defaultView: "grid",
  showCompleted: true
};

export class ProjectPlannerSettingTab extends PluginSettingTab {
  plugin: ProjectPlannerPlugin;

  constructor(app: App, plugin: ProjectPlannerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Project Planner Settings" });

    new Setting(containerEl)
      .setName("Default View")
      .setDesc("Choose which view opens first.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("grid", "Grid View")
          .addOption("board", "Board View")
          .addOption("gantt", "Timeline (Gantt) View")
          .setValue(this.plugin.settings.defaultView)
          .onChange(async (value) => {
            this.plugin.settings.defaultView = value as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show Completed Tasks")
      .setDesc("Display tasks marked as completed.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showCompleted)
          .onChange(async (value) => {
            this.plugin.settings.showCompleted = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
