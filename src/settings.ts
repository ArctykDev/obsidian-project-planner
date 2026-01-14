import { App, PluginSettingTab, Setting } from "obsidian";
import type ProjectPlannerPlugin from "./main";
import type { PlannerTag, PlannerStatus, PlannerPriority } from "./types";

export interface BoardBucket {
  id: string;
  name: string;
  color?: string; // Column header color (Microsoft Planner style)
}

export interface PlannerProject {
  id: string;
  name: string;
  createdDate?: string;
  lastUpdatedDate?: string;
  buckets?: BoardBucket[]; // Board view buckets (independent of statuses)
  unassignedBucketName?: string; // Custom name for unassigned bucket
  completedSectionsCollapsed?: { [bucketId: string]: boolean }; // Track collapsed state per bucket
}

export interface ProjectPlannerSettings {
  projects: PlannerProject[];
  activeProjectId: string;
  defaultView: "grid" | "board" | "gantt";
  showCompleted: boolean;
  openLinksInNewTab: boolean;
  openViewsInNewTab: boolean;
  availableTags: PlannerTag[];
  availableStatuses: PlannerStatus[];
  availablePriorities: PlannerPriority[];

  // Bidirectional sync settings
  enableMarkdownSync: boolean; // Enable sync between JSON and markdown notes
  autoCreateTaskNotes: boolean; // Auto-create/update markdown notes when tasks change
  syncOnStartup: boolean; // Perform initial sync when plugin loads

  // Daily note task tagging settings
  enableDailyNoteSync: boolean; // Enable scanning daily notes for tagged tasks
  dailyNoteTagPattern: string; // Tag pattern for identifying tasks (e.g., "#planner" or "#task/project")
  dailyNoteScanFolders: string[]; // Folders to scan for tagged tasks (empty = all notes)
  dailyNoteDefaultProject: string; // Default project ID for tasks without specific project tag
}

export const DEFAULT_SETTINGS: ProjectPlannerSettings = {
  projects: [],
  activeProjectId: "",
  defaultView: "grid",
  showCompleted: true,
  openLinksInNewTab: false,
  openViewsInNewTab: false,
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
  ],
  enableMarkdownSync: true,
  autoCreateTaskNotes: true,
  syncOnStartup: true,
  enableDailyNoteSync: false,
  dailyNoteTagPattern: "#planner",
  dailyNoteScanFolders: [],
  dailyNoteDefaultProject: "",
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

    // Plugin header with version
    const headerEl = containerEl.createDiv({ cls: "planner-settings-header" });
    headerEl.createEl("h2", { text: "Project Planner Settings" });

    const versionEl = headerEl.createDiv({ cls: "planner-settings-version" });
    versionEl.createEl("span", {
      text: `v${this.plugin.manifest.version}`,
      cls: "planner-version-badge"
    });

    // Optional: Add link to releases/changelog
    const changelogLink = versionEl.createEl("a", {
      text: "Changelog",
      cls: "planner-changelog-link",
      href: "https://github.com/ArctykDev/obsidian-project-planner/releases"
    });
    changelogLink.setAttribute("target", "_blank");
    changelogLink.setAttribute("rel", "noopener noreferrer");

    new Setting(containerEl)
      .setName("Projects")
      .setDesc("Manage planner projects")
      .addButton((btn) => {
        btn.setButtonText("Add project").onClick(async () => {
          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          this.plugin.settings.projects.push({
            id,
            name: "New Project",
            createdDate: now,
            lastUpdatedDate: now,
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

    new Setting(containerEl)
      .setName("Open Views in New Tab")
      .setDesc("When switching between views (Grid, Board, Timeline, Dashboard, Graph), open them in a new tab instead of replacing the current view.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.openViewsInNewTab)
          .onChange(async (value) => {
            this.plugin.settings.openViewsInNewTab = value;
            await this.plugin.saveSettings();
          })
      );

    // -----------------------------------------------------------------------
    // Markdown Sync Section
    // -----------------------------------------------------------------------
    containerEl.createEl("h2", { text: "Markdown Sync" });

    new Setting(containerEl)
      .setName("Enable Markdown Sync")
      .setDesc("Sync tasks between plugin data and markdown notes with YAML frontmatter")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableMarkdownSync)
          .onChange(async (value) => {
            this.plugin.settings.enableMarkdownSync = value;
            await this.plugin.saveSettings();
            // Initialize or stop watchers
            if (value) {
              this.plugin.initializeTaskSync();
            }
          })
      );

    new Setting(containerEl)
      .setName("Auto-Create Task Notes")
      .setDesc("Automatically create/update markdown notes when tasks are added or modified")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoCreateTaskNotes)
          .onChange(async (value) => {
            this.plugin.settings.autoCreateTaskNotes = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync on Startup")
      .setDesc("Scan project folders and sync markdown notes when plugin loads")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.syncOnStartup = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync All Tasks Now")
      .setDesc("Manually sync all tasks in the current project to markdown notes")
      .addButton((btn) => {
        btn
          .setButtonText("Sync Now")
          .setCta()
          .onClick(async () => {
            await this.plugin.syncAllTasksToMarkdown();
            // Show notice
            (this.plugin as any).app.workspace.trigger('notice', 'Tasks synced to markdown!');
          });
      });

    // -----------------------------------------------------------------------
    // Daily Note Task Tagging Section
    // -----------------------------------------------------------------------
    containerEl.createEl("h2", { text: "Daily Note Task Tagging" });

    new Setting(containerEl)
      .setName("Enable Daily Note Sync")
      .setDesc("Automatically detect and import tasks tagged in daily notes and other markdown files")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableDailyNoteSync)
          .onChange(async (value) => {
            this.plugin.settings.enableDailyNoteSync = value;
            await this.plugin.saveSettings();
            // Initialize or stop daily note scanner
            if (value) {
              this.plugin.initializeDailyNoteScanner();
            }
          })
      );

    new Setting(containerEl)
      .setName("Tag Pattern")
      .setDesc("Tag pattern to identify tasks (e.g., #planner or #task). Tasks with #planner/ProjectName will be added to the specific project.")
      .addText((text) =>
        text
          .setPlaceholder("#planner")
          .setValue(this.plugin.settings.dailyNoteTagPattern)
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteTagPattern = value.trim() || "#planner";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Scan Folders")
      .setDesc("Comma-separated list of folders to scan (leave empty to scan all notes). Example: Daily Notes, Journal")
      .addText((text) =>
        text
          .setPlaceholder("Daily Notes, Journal")
          .setValue(this.plugin.settings.dailyNoteScanFolders.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteScanFolders = value
              .split(",")
              .map(f => f.trim())
              .filter(f => f.length > 0);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default Project")
      .setDesc("Project to add tasks to when no specific project tag is found (e.g., #planner without /ProjectName)")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Select a project...");
        this.plugin.settings.projects.forEach((project) => {
          dropdown.addOption(project.id, project.name);
        });
        dropdown
          .setValue(this.plugin.settings.dailyNoteDefaultProject)
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteDefaultProject = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Scan Now")
      .setDesc("Manually scan all notes for tagged tasks and import them")
      .addButton((btn) => {
        btn
          .setButtonText("Scan Notes")
          .setCta()
          .onClick(async () => {
            if (this.plugin.dailyNoteScanner) {
              await this.plugin.dailyNoteScanner.scanAllNotes();
              (this.plugin as any).app.workspace.trigger('notice', 'Daily notes scanned for tasks!');
            }
          });
      });

    // -----------------------------------------------------------------------
    // Actions Section
    // -----------------------------------------------------------------------
    containerEl.createEl("h2", { text: "Actions" });

    new Setting(containerEl)
      .setName("Open Dependency Graph")
      .setDesc("Visualize task dependencies in an interactive graph view")
      .addButton((btn) => {
        btn
          .setButtonText("Open Graph")
          .setCta()
          .onClick(async () => {
            await this.plugin.openDependencyGraph();
          });
      });

    new Setting(containerEl)
      .setName("Create Task Notes")
      .setDesc("Generate individual markdown notes for all tasks in the current project")
      .addButton((btn) => {
        btn
          .setButtonText("Create Notes")
          .setCta()
          .onClick(async () => {
            await this.plugin.createTaskNotes();
          });
      });

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
