import { App, PluginSettingTab, Setting } from "obsidian";
import type ProjectPlannerPlugin from "./main";
import type { PlannerTag, PlannerStatus, PlannerPriority } from "./types";

/**
 * Date formatting utilities
 */
export function formatDateForDisplay(dateStr: string | undefined, format: "iso" | "us" | "uk"): string {
  if (!dateStr) return "Set date";
  
  // Handle both YYYY-MM-DD and ISO datetime format
  const normalized = dateStr.includes('T') ? dateStr.slice(0, 10) : dateStr;
  const parts = normalized.split("-");
  if (parts.length !== 3) return "Set date";
  
  const [y, m, d] = parts;
  
  switch (format) {
    case "iso":
      return `${y}-${m}-${d}`;
    case "us":
      return `${m}/${d}/${y}`;
    case "uk":
      return `${d}/${m}/${y}`;
    default:
      return `${y}-${m}-${d}`;
  }
}

export function parseDateInput(input: string, format: "iso" | "us" | "uk"): string {
  if (!input || input.trim() === "") return "";
  
  // If it's already in ISO format (YYYY-MM-DD), return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }
  
  // Parse based on format
  const parts = input.split(/[\/\-]/);
  if (parts.length !== 3) return "";
  
  let year: string, month: string, day: string;
  
  switch (format) {
    case "iso":
      [year, month, day] = parts;
      break;
    case "us":
      [month, day, year] = parts;
      break;
    case "uk":
      [day, month, year] = parts;
      break;
    default:
      [year, month, day] = parts;
  }
  
  // Pad month and day with zeros if needed
  month = month.padStart(2, '0');
  day = day.padStart(2, '0');
  
  // Handle 2-digit years (assume 20xx)
  if (year.length === 2) {
    year = '20' + year;
  }
  
  return `${year}-${month}-${day}`;
}

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
  lastSyncTimestamp?: number; // Unix timestamp of last successful sync
  buckets?: BoardBucket[]; // Board view buckets (independent of statuses)
  unassignedBucketName?: string; // Custom name for unassigned bucket
  completedSectionsCollapsed?: { [bucketId: string]: boolean }; // Track collapsed state per bucket
}

export interface ProjectPlannerSettings {
  projects: PlannerProject[];
  activeProjectId: string;
  defaultView: "grid" | "board" | "gantt" | "dashboard";
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
  projectsBasePath: string; // Base folder path for project folders (e.g., "Project Planner")

  // Daily note task tagging settings
  enableDailyNoteSync: boolean; // Enable scanning daily notes for tagged tasks
  dailyNoteTagPattern: string; // Tag pattern for identifying tasks (e.g., "#planner" or "#task/project")
  dailyNoteScanFolders: string[]; // Folders to scan for tagged tasks (empty = all notes)
  dailyNoteDefaultProject: string; // Default project ID for tasks without specific project tag

  // Date format settings
  dateFormat: "iso" | "us" | "uk"; // ISO (YYYY-MM-DD), US (MM/DD/YYYY), UK (DD/MM/YYYY)

  // View-specific settings
  ganttLeftColumnWidth: number; // Width of left column in Gantt view (pixels)

  // Ribbon icon visibility settings
  showRibbonIconGrid: boolean; // Show ribbon icon for Grid view
  showRibbonIconDashboard: boolean; // Show ribbon icon for Dashboard view
  showRibbonIconBoard: boolean; // Show ribbon icon for Board view
  showRibbonIconGraph: boolean; // Show ribbon icon for Dependency Graph view
  showRibbonIconDailyNoteScan: boolean; // Show ribbon icon for Daily Note scanning
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
  syncOnStartup: false,
  projectsBasePath: "Project Planner",
  enableDailyNoteSync: false,
  dailyNoteTagPattern: "#planner",
  dailyNoteScanFolders: [],
  dailyNoteDefaultProject: "",
  dateFormat: "iso",
  ganttLeftColumnWidth: 300,
  showRibbonIconGrid: true,
  showRibbonIconDashboard: false,
  showRibbonIconBoard: false,
  showRibbonIconGraph: false,
  showRibbonIconDailyNoteScan: false,
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

    // Add link to releases/changelog
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
      .setName("Default view")
      .setDesc("Choose which view opens first.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("grid", "Grid view")
          .addOption("board", "Board view")
          .addOption("gantt", "Timeline (Gantt) view")
          .addOption("dashboard", "Dashboard view")
          .setValue(this.plugin.settings.defaultView)
          .onChange(async (value) => {
            this.plugin.settings.defaultView = value as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show completed tasks in Grid View")
      .setDesc("When disabled, completed tasks will be hidden in Grid View only. Other views (Board, Timeline, Dashboard) will continue to show completed tasks.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showCompleted)
          .onChange(async (value) => {
            this.plugin.settings.showCompleted = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Open views in new tab")
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
    // Date Format Section
    // -----------------------------------------------------------------------
    new Setting(containerEl).setName("Date format").setHeading();

    new Setting(containerEl)
      .setName("Date display format")
      .setDesc("Choose how dates are displayed throughout the app. Dates are always stored internally as YYYY-MM-DD.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("iso", "ISO (YYYY-MM-DD)")
          .addOption("us", "US (MM/DD/YYYY)")
          .addOption("uk", "UK (DD/MM/YYYY)")
          .setValue(this.plugin.settings.dateFormat)
          .onChange(async (value) => {
            this.plugin.settings.dateFormat = value as "iso" | "us" | "uk";
            await this.plugin.saveSettings();
            // Trigger re-render of all views
            this.plugin.taskStore.refresh();
          })
      );

    // -----------------------------------------------------------------------
    // Ribbon Icons Section
    // -----------------------------------------------------------------------
    new Setting(containerEl).setName("Ribbon icons").setHeading();

    new Setting(containerEl)
      .setName("Ribbon icons visibility")
      .setDesc("Choose which ribbon icons to display in the left sidebar. Changes require reloading Obsidian to take effect.");

    new Setting(containerEl)
      .setName("Grid view icon")
      .setDesc("Show ribbon icon for opening Grid view")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRibbonIconGrid)
          .onChange(async (value) => {
            this.plugin.settings.showRibbonIconGrid = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Dashboard view icon")
      .setDesc("Show ribbon icon for opening Dashboard view")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRibbonIconDashboard)
          .onChange(async (value) => {
            this.plugin.settings.showRibbonIconDashboard = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Board view icon")
      .setDesc("Show ribbon icon for opening Board view")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRibbonIconBoard)
          .onChange(async (value) => {
            this.plugin.settings.showRibbonIconBoard = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Dependency Graph icon")
      .setDesc("Show ribbon icon for opening Dependency Graph view")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRibbonIconGraph)
          .onChange(async (value) => {
            this.plugin.settings.showRibbonIconGraph = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Daily Note scan icon")
      .setDesc("Show ribbon icon for scanning daily notes (only visible when daily note sync is enabled)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRibbonIconDailyNoteScan)
          .onChange(async (value) => {
            this.plugin.settings.showRibbonIconDailyNoteScan = value;
            await this.plugin.saveSettings();
          })
      );

    // -----------------------------------------------------------------------
    // Markdown Sync Section
    // -----------------------------------------------------------------------
    // Markdown Sync Section
    // -----------------------------------------------------------------------
    new Setting(containerEl).setName("Markdown sync").setHeading();

    new Setting(containerEl)
      .setName("Enable markdown sync")
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
      .setName("Projects base folder")
      .setDesc("Base folder path where project folders will be created (e.g., 'Projects', 'Work/Planning'). Folder will be created if it doesn't exist.")
      .addText((text) =>
        text
          .setPlaceholder("Project Planner")
          .setValue(this.plugin.settings.projectsBasePath)
          .onChange(async (value) => {
            this.plugin.settings.projectsBasePath = value.trim() || "Project Planner";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-create task notes")
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
      .setName("Sync on startup")
      .setDesc("Scan project folders and sync markdown notes when plugin loads. ⚠️ WARNING: If using Obsidian Sync, disable this to prevent duplicate tasks across devices. The plugin will still watch for file changes.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.syncOnStartup = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync all tasks now")
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
    new Setting(containerEl).setName("Daily note task tagging").setHeading();

    new Setting(containerEl)
      .setName("Enable daily note sync")
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
      .setName("Tag pattern")
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
      .setName("Scan folders")
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
      .setName("Default project")
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
      .setName("Scan now")
      .setDesc("Manually scan all notes for tagged tasks and import them")
      .addButton((btn) => {
        btn
          .setButtonText("Scan notes")
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
    new Setting(containerEl).setName("Actions").setHeading();

    new Setting(containerEl)
      .setName("Open dependency graph")
      .setDesc("Visualize task dependencies in an interactive graph view")
      .addButton((btn) => {
        btn
          .setButtonText("Open graph")
          .setCta()
          .onClick(async () => {
            await this.plugin.openDependencyGraph();
          });
      });

    new Setting(containerEl)
      .setName("Create task notes")
      .setDesc("Generate individual markdown notes for all tasks in the current project")
      .addButton((btn) => {
        btn
          .setButtonText("Create notes")
          .setCta()
          .onClick(async () => {
            await this.plugin.createTaskNotes();
          });
      });

    // -----------------------------------------------------------------------
    // Tags / Labels Section
    // -----------------------------------------------------------------------
    new Setting(containerEl).setName("Tags").setHeading();

    new Setting(containerEl)
      .setName("Manage tags")
      .setDesc("Create custom tags with colors for organizing tasks")
      .addButton((btn) => {
        btn.setButtonText("Add tag").onClick(async () => {
          const id = crypto.randomUUID();
          this.plugin.settings.availableTags.push({
            id,
            name: "New tag",
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
              tag.name = value.trim() || "Untitled tag";
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
    new Setting(containerEl).setName("Statuses").setHeading();

    new Setting(containerEl)
      .setName("Manage statuses")
      .setDesc("Create custom statuses with colors for task workflow")
      .addButton((btn) => {
        btn.setButtonText("Add status").onClick(async () => {
          const id = crypto.randomUUID();
          this.plugin.settings.availableStatuses.push({
            id,
            name: "New status",
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
              status.name = value.trim() || "Untitled status";
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
    new Setting(containerEl).setName("Priorities").setHeading();

    new Setting(containerEl)
      .setName("Manage priorities")
      .setDesc("Create custom priorities with colors for task importance")
      .addButton((btn) => {
        btn.setButtonText("Add priority").onClick(async () => {
          const id = crypto.randomUUID();
          this.plugin.settings.availablePriorities.push({
            id,
            name: "New priority",
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
              priority.name = value.trim() || "Untitled priority";
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

    // -----------------------------------------------------------------------
    // Support Section
    // -----------------------------------------------------------------------
    containerEl.createEl("hr", { attr: { style: "margin: 32px 0 24px 0;" } });
    
    new Setting(containerEl).setName("Support development").setHeading();
    
    new Setting(containerEl)
      .setName("Documentation & Updates")
      .setDesc("Visit the official website for documentation, guides, and updates")
      .addButton((btn) => {
        btn
          .setButtonText("Visit projectplanner.md")
          .onClick(() => {
            window.open("https://projectplanner.md", "_blank");
          });
      });
    
    const coffeeSetting = new Setting(containerEl)
      .setName("Buy me a coffee")
      .setDesc("If you find this plugin useful, consider supporting development!");
    
    // Add Buy Me a Coffee button in the same row
    const coffeeLink = coffeeSetting.controlEl.createEl("a", {
      href: "https://www.buymeacoffee.com/arctykdev"
    });
    coffeeLink.setAttribute("target", "_blank");
    coffeeLink.setAttribute("rel", "noopener noreferrer");
    
    const coffeeImg = coffeeLink.createEl("img", {
      attr: {
        src: "https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png",
        alt: "Buy Me A Coffee"
      }
    });
    coffeeImg.style.height = "40px";
    coffeeImg.style.width = "145px";
    coffeeImg.style.verticalAlign = "middle";
  }
}
