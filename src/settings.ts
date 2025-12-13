import { App, PluginSettingTab, Setting } from "obsidian";
import type ProjectPlannerPlugin from "./main";
import type { PlannerTag, PlannerStatus, PlannerPriority } from "./types";

export interface PlannerProject {
  id: string;
  name: string;
}

export interface ProjectPlannerSettings {
  projects: PlannerProject[];
  activeProjectId: string;
  defaultView: "grid" | "board" | "gantt";
  showCompleted: boolean;
  availableTags: PlannerTag[];
  availableStatuses: PlannerStatus[];
  availablePriorities: PlannerPriority[];
}

export const DEFAULT_SETTINGS: ProjectPlannerSettings = {
  projects: [],
  activeProjectId: "",
  defaultView: "grid",
  showCompleted: true,
  availableTags: [],
  availableStatuses: [
    { id: "not-started", name: "Not Started", color: "#6c757d" },
    { id: "in-progress", name: "In Progress", color: "#0a84ff" },
    { id: "blocked", name: "Blocked", color: "#d70022" },
    { id: "completed", name: "Completed", color: "#2f9e44" }
  ],
  availablePriorities: [
    { id: "low", name: "Low", color: "#6c757d" },
    { id: "medium", name: "Medium", color: "#0a84ff" },
    { id: "high", name: "High", color: "#ff8c00" },
    { id: "critical", name: "Critical", color: "#d70022" }
  ]
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
      .setName("Projects")
      .setDesc("Manage planner projects")
      .addButton((btn) => {
        btn.setButtonText("Add project").onClick(async () => {
          const id = crypto.randomUUID();
          this.plugin.settings.projects.push({
            id,
            name: "New Project",
          });
          this.plugin.settings.activeProjectId = id;
          await this.plugin.saveSettings();
          this.display(); // rebuild settings UI
        });
      });

    // For each project
    this.plugin.settings.projects.forEach((project) => {
      const s = new Setting(containerEl)
        .setName(project.name)
        .addText((text) => {
          text
            .setValue(project.name)
            .onChange(async (value) => {
              project.name = value.trim() || "Untitled Project";
              await this.plugin.saveSettings();
            });
        })
        .addExtraButton((btn) => {
          btn
            .setIcon("trash")
            .setTooltip("Delete project")
            .onClick(async () => {
              if (this.plugin.settings.projects.length <= 1) {
                // avoid deleting last project
                return;
              }
              this.plugin.settings.projects =
                this.plugin.settings.projects.filter((p) => p.id !== project.id);

              if (this.plugin.settings.activeProjectId === project.id) {
                this.plugin.settings.activeProjectId =
                  this.plugin.settings.projects[0].id;
              }

              await this.plugin.saveSettings();
              this.display();
            });
        });
    });

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

    // -----------------------------------------------------------------------
    // Tags / Labels Section
    // -----------------------------------------------------------------------
    containerEl.createEl("h2", { text: "Tags" });

    new Setting(containerEl)
      .setName("Manage Tags")
      .setDesc("Create custom tags with colors for organizing tasks")
      .addButton((btn) => {
        btn.setButtonText("Add tag").onClick(async () => {
          const id = crypto.randomUUID();
          this.plugin.settings.availableTags.push({
            id,
            name: "New Tag",
            color: "#3b82f6" // default blue
          });
          await this.plugin.saveSettings();
          this.display();
        });
      });

    // Display each tag
    this.plugin.settings.availableTags.forEach((tag) => {
      const s = new Setting(containerEl)
        .addText((text) => {
          text
            .setValue(tag.name)
            .setPlaceholder("Tag name")
            .onChange(async (value) => {
              tag.name = value.trim() || "Untitled Tag";
              await this.plugin.saveSettings();
            });
        })
        .addColorPicker((color) => {
          color
            .setValue(tag.color)
            .onChange(async (value) => {
              tag.color = value;
              await this.plugin.saveSettings();
              // Update the preview badge
              const previewBadge = s.settingEl.querySelector(".planner-tag-preview");
              if (previewBadge instanceof HTMLElement) {
                previewBadge.style.backgroundColor = value;
              }
            });
        })
        .addExtraButton((btn) => {
          btn
            .setIcon("trash")
            .setTooltip("Delete tag")
            .onClick(async () => {
              this.plugin.settings.availableTags =
                this.plugin.settings.availableTags.filter((t) => t.id !== tag.id);
              await this.plugin.saveSettings();
              this.display();
            });
        });

      // Add a preview badge
      const previewBadge = s.controlEl.createDiv({
        cls: "planner-tag-preview",
        text: tag.name
      });
      previewBadge.style.backgroundColor = tag.color;
    });

    // -----------------------------------------------------------------------
    // Statuses Section
    // -----------------------------------------------------------------------
    containerEl.createEl("h2", { text: "Statuses" });

    new Setting(containerEl)
      .setName("Manage Statuses")
      .setDesc("Create custom statuses with colors for task workflow")
      .addButton((btn) => {
        btn.setButtonText("Add status").onClick(async () => {
          const id = crypto.randomUUID();
          this.plugin.settings.availableStatuses.push({
            id,
            name: "New Status",
            color: "#0a84ff" // default blue
          });
          await this.plugin.saveSettings();
          this.display();
        });
      });

    // Display each status
    this.plugin.settings.availableStatuses.forEach((status) => {
      const s = new Setting(containerEl)
        .addText((text) => {
          text
            .setValue(status.name)
            .setPlaceholder("Status name")
            .onChange(async (value) => {
              status.name = value.trim() || "Untitled Status";
              await this.plugin.saveSettings();
            });
        })
        .addColorPicker((color) => {
          color
            .setValue(status.color)
            .onChange(async (value) => {
              status.color = value;
              await this.plugin.saveSettings();
              // Update the preview badge
              const previewBadge = s.settingEl.querySelector(".planner-status-preview");
              if (previewBadge instanceof HTMLElement) {
                previewBadge.style.backgroundColor = value;
              }
            });
        })
        .addExtraButton((btn) => {
          btn
            .setIcon("trash")
            .setTooltip("Delete status")
            .onClick(async () => {
              if (this.plugin.settings.availableStatuses.length <= 1) {
                // Prevent deleting last status
                return;
              }
              this.plugin.settings.availableStatuses =
                this.plugin.settings.availableStatuses.filter((st) => st.id !== status.id);
              await this.plugin.saveSettings();
              this.display();
            });
        });

      // Add a preview badge
      const previewBadge = s.controlEl.createDiv({
        cls: "planner-status-preview",
        text: status.name
      });
      previewBadge.style.backgroundColor = status.color;
    });

    // -----------------------------------------------------------------------
    // Priorities Section
    // -----------------------------------------------------------------------
    containerEl.createEl("h2", { text: "Priorities" });

    new Setting(containerEl)
      .setName("Manage Priorities")
      .setDesc("Create custom priorities with colors for task importance")
      .addButton((btn) => {
        btn.setButtonText("Add priority").onClick(async () => {
          const id = crypto.randomUUID();
          this.plugin.settings.availablePriorities.push({
            id,
            name: "New Priority",
            color: "#0a84ff" // default blue
          });
          await this.plugin.saveSettings();
          this.display();
        });
      });

    // Display each priority
    this.plugin.settings.availablePriorities.forEach((priority) => {
      const s = new Setting(containerEl)
        .addText((text) => {
          text
            .setValue(priority.name)
            .setPlaceholder("Priority name")
            .onChange(async (value) => {
              priority.name = value.trim() || "Untitled Priority";
              await this.plugin.saveSettings();
            });
        })
        .addColorPicker((color) => {
          color
            .setValue(priority.color)
            .onChange(async (value) => {
              priority.color = value;
              await this.plugin.saveSettings();
              // Update the preview badge
              const previewBadge = s.settingEl.querySelector(".planner-priority-preview");
              if (previewBadge instanceof HTMLElement) {
                previewBadge.style.backgroundColor = value;
              }
            });
        })
        .addExtraButton((btn) => {
          btn
            .setIcon("trash")
            .setTooltip("Delete priority")
            .onClick(async () => {
              if (this.plugin.settings.availablePriorities.length <= 1) {
                // Prevent deleting last priority
                return;
              }
              this.plugin.settings.availablePriorities =
                this.plugin.settings.availablePriorities.filter((p) => p.id !== priority.id);
              await this.plugin.saveSettings();
              this.display();
            });
        });

      // Add a preview badge
      const previewBadge = s.controlEl.createDiv({
        cls: "planner-priority-preview",
        text: priority.name
      });
      previewBadge.style.backgroundColor = priority.color;
    });
  }
}
