'use strict';

var obsidian = require('obsidian');

const DEFAULT_SETTINGS = {
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
    enableDependencyScheduling: true,
    enableParentRollUp: true,
    dateFormat: "iso",
    ganttLeftColumnWidth: 300,
    showRibbonIconGrid: true,
    showRibbonIconDashboard: false,
    showRibbonIconBoard: false,
    showRibbonIconGraph: false,
    showRibbonIconDailyNoteScan: false,
};
class ProjectPlannerSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
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
        new obsidian.Setting(containerEl)
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
            new obsidian.Setting(containerEl)
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
        // -----------------------------------------------------------------
        // Cost Tracking — per-project budget, rate, and currency settings
        // -----------------------------------------------------------------
        const activeProject = this.plugin.settings.projects.find(p => p.id === this.plugin.settings.activeProjectId);
        if (activeProject) {
            containerEl.createEl("h3", { text: `Cost Tracking — ${activeProject.name}` });
            new obsidian.Setting(containerEl)
                .setName("Total Budget")
                .setDesc("Total budget for this project. Shown on the Dashboard cost card.")
                .addText((text) => {
                text
                    .setPlaceholder("0")
                    .setValue(activeProject.budgetTotal != null ? String(activeProject.budgetTotal) : "")
                    .onChange(async (value) => {
                    activeProject.budgetTotal = parseFloat(value) || undefined;
                    await this.plugin.saveSettings();
                });
            });
            new obsidian.Setting(containerEl)
                .setName("Default Hourly Rate")
                .setDesc("Applied to tasks with cost type 'Hourly' when no per-task rate is set.")
                .addText((text) => {
                text
                    .setPlaceholder("0")
                    .setValue(activeProject.defaultHourlyRate != null ? String(activeProject.defaultHourlyRate) : "")
                    .onChange(async (value) => {
                    activeProject.defaultHourlyRate = parseFloat(value) || undefined;
                    await this.plugin.saveSettings();
                });
            });
            new obsidian.Setting(containerEl)
                .setName("Currency Symbol")
                .setDesc("Display symbol for currency (e.g. $, €, £).")
                .addText((text) => {
                text
                    .setPlaceholder("$")
                    .setValue(activeProject.currencySymbol || "")
                    .onChange(async (value) => {
                    activeProject.currencySymbol = value.trim() || undefined;
                    await this.plugin.saveSettings();
                });
            });
        }
        new obsidian.Setting(containerEl)
            .setName("Default view")
            .setDesc("Choose which view opens first.")
            .addDropdown((dropdown) => dropdown
            .addOption("grid", "Grid view")
            .addOption("board", "Board view")
            .addOption("gantt", "Timeline (Gantt) view")
            .addOption("dashboard", "Dashboard view")
            .setValue(this.plugin.settings.defaultView)
            .onChange(async (value) => {
            this.plugin.settings.defaultView = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName("Show completed tasks in Grid View")
            .setDesc("When disabled, completed tasks will be hidden in Grid View only. Other views (Board, Timeline, Dashboard) will continue to show completed tasks.")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.showCompleted)
            .onChange(async (value) => {
            this.plugin.settings.showCompleted = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName("Open views in new tab")
            .setDesc("When switching between views (Grid, Board, Timeline, Dashboard, Graph), open them in a new tab instead of replacing the current view.")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.openViewsInNewTab)
            .onChange(async (value) => {
            this.plugin.settings.openViewsInNewTab = value;
            await this.plugin.saveSettings();
        }));
        // -----------------------------------------------------------------------
        // Date Format Section
        // -----------------------------------------------------------------------
        new obsidian.Setting(containerEl).setName("Date format").setHeading();
        new obsidian.Setting(containerEl)
            .setName("Date display format")
            .setDesc("Choose how dates are displayed throughout the app. Dates are always stored internally as YYYY-MM-DD.")
            .addDropdown((dropdown) => dropdown
            .addOption("iso", "ISO (YYYY-MM-DD)")
            .addOption("us", "US (MM/DD/YYYY)")
            .addOption("uk", "UK (DD/MM/YYYY)")
            .setValue(this.plugin.settings.dateFormat)
            .onChange(async (value) => {
            this.plugin.settings.dateFormat = value;
            await this.plugin.saveSettings();
            // Trigger re-render of all views
            this.plugin.taskStore.refresh();
        }));
        // -----------------------------------------------------------------------
        // Ribbon Icons Section
        // -----------------------------------------------------------------------
        new obsidian.Setting(containerEl).setName("Ribbon icons").setHeading();
        new obsidian.Setting(containerEl)
            .setName("Ribbon icons visibility")
            .setDesc("Choose which ribbon icons to display in the left sidebar. Changes require reloading Obsidian to take effect.");
        new obsidian.Setting(containerEl)
            .setName("Grid view icon")
            .setDesc("Show ribbon icon for opening Grid view")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.showRibbonIconGrid)
            .onChange(async (value) => {
            this.plugin.settings.showRibbonIconGrid = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName("Dashboard view icon")
            .setDesc("Show ribbon icon for opening Dashboard view")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.showRibbonIconDashboard)
            .onChange(async (value) => {
            this.plugin.settings.showRibbonIconDashboard = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName("Board view icon")
            .setDesc("Show ribbon icon for opening Board view")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.showRibbonIconBoard)
            .onChange(async (value) => {
            this.plugin.settings.showRibbonIconBoard = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName("Dependency Graph icon")
            .setDesc("Show ribbon icon for opening Dependency Graph view")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.showRibbonIconGraph)
            .onChange(async (value) => {
            this.plugin.settings.showRibbonIconGraph = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName("Daily Note scan icon")
            .setDesc("Show ribbon icon for scanning daily notes (only visible when daily note sync is enabled)")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.showRibbonIconDailyNoteScan)
            .onChange(async (value) => {
            this.plugin.settings.showRibbonIconDailyNoteScan = value;
            await this.plugin.saveSettings();
        }));
        // -----------------------------------------------------------------------
        // Markdown Sync Section
        // -----------------------------------------------------------------------
        // Markdown Sync Section
        // -----------------------------------------------------------------------
        new obsidian.Setting(containerEl).setName("Markdown sync").setHeading();
        new obsidian.Setting(containerEl)
            .setName("Enable markdown sync")
            .setDesc("Sync tasks between plugin data and markdown notes with YAML frontmatter")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.enableMarkdownSync)
            .onChange(async (value) => {
            this.plugin.settings.enableMarkdownSync = value;
            await this.plugin.saveSettings();
            // Initialize or stop watchers
            if (value) {
                this.plugin.initializeTaskSync();
            }
        }));
        new obsidian.Setting(containerEl)
            .setName("Projects base folder")
            .setDesc("Base folder path where project folders will be created (e.g., 'Projects', 'Work/Planning'). Folder will be created if it doesn't exist.")
            .addText((text) => text
            .setPlaceholder("Project Planner")
            .setValue(this.plugin.settings.projectsBasePath)
            .onChange(async (value) => {
            this.plugin.settings.projectsBasePath = value.trim() || "Project Planner";
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName("Auto-create task notes")
            .setDesc("Automatically create/update markdown notes when tasks are added or modified")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.autoCreateTaskNotes)
            .onChange(async (value) => {
            this.plugin.settings.autoCreateTaskNotes = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName("Sync on startup")
            .setDesc("Scan project folders and sync markdown notes when plugin loads. ⚠️ WARNING: If using Obsidian Sync, disable this to prevent duplicate tasks across devices. The plugin will still watch for file changes.")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.syncOnStartup)
            .onChange(async (value) => {
            this.plugin.settings.syncOnStartup = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName("Sync all tasks now")
            .setDesc("Manually sync all tasks in the current project to markdown notes")
            .addButton((btn) => {
            btn
                .setButtonText("Sync Now")
                .setCta()
                .onClick(async () => {
                await this.plugin.syncAllTasksToMarkdown();
                new obsidian.Notice('Tasks synced to markdown!');
            });
        });
        // -----------------------------------------------------------------------
        // Dependency Scheduling Section
        // -----------------------------------------------------------------------
        new obsidian.Setting(containerEl).setName("Dependency scheduling").setHeading();
        new obsidian.Setting(containerEl)
            .setName("Auto-schedule dependent tasks")
            .setDesc("When a predecessor task's dates change, automatically shift dependent tasks accordingly (like MS Project / GanttProject). " +
            "Supports all dependency types: Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish.")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.enableDependencyScheduling)
            .onChange(async (value) => {
            this.plugin.settings.enableDependencyScheduling = value;
            await this.plugin.saveSettings();
        }));
        // -----------------------------------------------------------------------
        // Parent Task Roll-Up Section
        // -----------------------------------------------------------------------
        new obsidian.Setting(containerEl).setName("Parent task roll-up").setHeading();
        new obsidian.Setting(containerEl)
            .setName("Auto-calculate parent task fields from subtasks")
            .setDesc("Parent tasks automatically derive dates (earliest start, latest due), effort (sum of children), " +
            "and % complete (duration-weighted average) from their subtasks — like MS Project.")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.enableParentRollUp)
            .onChange(async (value) => {
            this.plugin.settings.enableParentRollUp = value;
            await this.plugin.saveSettings();
        }));
        // -----------------------------------------------------------------------
        // Daily Note Task Tagging Section
        // -----------------------------------------------------------------------
        new obsidian.Setting(containerEl).setName("Daily note task tagging").setHeading();
        new obsidian.Setting(containerEl)
            .setName("Enable daily note sync")
            .setDesc("Automatically detect and import tasks tagged in daily notes and other markdown files")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.enableDailyNoteSync)
            .onChange(async (value) => {
            this.plugin.settings.enableDailyNoteSync = value;
            await this.plugin.saveSettings();
            // Initialize or stop daily note scanner
            if (value) {
                this.plugin.initializeDailyNoteScanner();
            }
        }));
        new obsidian.Setting(containerEl)
            .setName("Tag pattern")
            .setDesc("Tag pattern to identify tasks (e.g., #planner or #task). Tasks with #planner/ProjectName will be added to the specific project.")
            .addText((text) => text
            .setPlaceholder("#planner")
            .setValue(this.plugin.settings.dailyNoteTagPattern)
            .onChange(async (value) => {
            this.plugin.settings.dailyNoteTagPattern = value.trim() || "#planner";
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName("Scan folders")
            .setDesc("Comma-separated list of folders to scan (leave empty to scan all notes). Example: Daily Notes, Journal")
            .addText((text) => text
            .setPlaceholder("Daily Notes, Journal")
            .setValue(this.plugin.settings.dailyNoteScanFolders.join(", "))
            .onChange(async (value) => {
            this.plugin.settings.dailyNoteScanFolders = value
                .split(",")
                .map(f => f.trim())
                .filter(f => f.length > 0);
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
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
        new obsidian.Setting(containerEl)
            .setName("Scan now")
            .setDesc("Manually scan all notes for tagged tasks and import them")
            .addButton((btn) => {
            btn
                .setButtonText("Scan notes")
                .setCta()
                .onClick(async () => {
                if (this.plugin.dailyNoteScanner) {
                    await this.plugin.dailyNoteScanner.scanAllNotes();
                    new obsidian.Notice('Daily notes scanned for tasks!');
                }
            });
        });
        // -----------------------------------------------------------------------
        // Actions Section
        // -----------------------------------------------------------------------
        new obsidian.Setting(containerEl).setName("Actions").setHeading();
        new obsidian.Setting(containerEl)
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
        new obsidian.Setting(containerEl)
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
        new obsidian.Setting(containerEl).setName("Tags").setHeading();
        new obsidian.Setting(containerEl)
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
            const s = new obsidian.Setting(containerEl)
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
        new obsidian.Setting(containerEl).setName("Statuses").setHeading();
        new obsidian.Setting(containerEl)
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
            const s = new obsidian.Setting(containerEl)
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
        new obsidian.Setting(containerEl).setName("Priorities").setHeading();
        new obsidian.Setting(containerEl)
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
            const s = new obsidian.Setting(containerEl)
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
        new obsidian.Setting(containerEl).setName("Support development").setHeading();
        new obsidian.Setting(containerEl)
            .setName("Documentation & Updates")
            .setDesc("Visit the official website for documentation, guides, and updates")
            .addButton((btn) => {
            btn
                .setButtonText("Visit projectplanner.md")
                .onClick(() => {
                window.open("https://projectplanner.md", "_blank");
            });
        });
        const coffeeSetting = new obsidian.Setting(containerEl)
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

function renderPlannerHeader(parent, plugin, options) {
    const header = parent.createDiv("planner-grid-header");
    // Project switcher
    const projectContainer = header.createDiv("planner-project-switcher");
    const projectSelect = projectContainer.createEl("select", {
        cls: "planner-project-select",
    });
    const settings = plugin.settings;
    const projects = settings.projects || [];
    let activeProjectId = settings.activeProjectId;
    if (!activeProjectId && projects.length > 0) {
        activeProjectId = projects[0].id;
        settings.activeProjectId = activeProjectId;
        void plugin.saveSettings();
    }
    if (projects.length === 0) {
        projectSelect.createEl("option", { text: "No projects" });
        projectSelect.disabled = true;
    }
    else {
        for (const p of projects) {
            const opt = projectSelect.createEl("option", { text: p.name, value: p.id });
            if (p.id === activeProjectId)
                opt.selected = true;
        }
        projectSelect.onchange = async () => {
            const newId = projectSelect.value;
            settings.activeProjectId = newId;
            await plugin.saveSettings();
            await plugin.taskStore.load();
            if (typeof options.onProjectChange === "function") {
                await options.onProjectChange();
            }
        };
    }
    // View switcher
    const viewSwitcher = header.createDiv("planner-view-switcher");
    const dashboardViewBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "dashboard" ? " planner-view-btn-active" : ""}`,
        title: "Dashboard",
    });
    obsidian.setIcon(dashboardViewBtn, "layout-dashboard");
    dashboardViewBtn.onclick = async () => await plugin.activateDashboardView();
    const gridViewBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "grid" ? " planner-view-btn-active" : ""}`,
        title: "Grid",
    });
    obsidian.setIcon(gridViewBtn, "table");
    gridViewBtn.onclick = async () => await plugin.activateView();
    const boardViewBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "board" ? " planner-view-btn-active" : ""}`,
        title: "Board",
    });
    obsidian.setIcon(boardViewBtn, "layout-list");
    boardViewBtn.onclick = async () => await plugin.activateBoardView();
    const ganttViewBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "gantt" ? " planner-view-btn-active" : ""}`,
        title: "Timeline",
    });
    obsidian.setIcon(ganttViewBtn, "calendar-range");
    ganttViewBtn.onclick = async () => await plugin.activateGanttView();
    const graphViewBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "graph" ? " planner-view-btn-active" : ""}`,
        title: "Graph",
    });
    obsidian.setIcon(graphViewBtn, "git-fork");
    graphViewBtn.onclick = async () => await plugin.openDependencyGraph();
    const myDayBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "myday" ? " planner-view-btn-active" : ""}`,
        title: "My Tasks",
    });
    obsidian.setIcon(myDayBtn, "sun");
    myDayBtn.onclick = async () => await plugin.activateMyDayView();
    // Header actions (Add task, extra, Project Hub, Settings)
    const headerActions = header.createDiv("planner-header-actions");
    const addBtn = headerActions.createEl("button", {
        cls: "planner-add-btn",
        text: "Add Task",
    });
    addBtn.onclick = async () => {
        await plugin.taskStore.addTask("New Task");
    };
    if (options.buildExtraActions) {
        options.buildExtraActions(headerActions);
    }
    const settingsBtn = headerActions.createEl("button", {
        cls: "planner-settings-btn",
        title: "Open plugin settings",
    });
    // Add cog icon for settings
    try {
        obsidian.setIcon(settingsBtn, "settings");
    }
    catch (_) {
        // Fallback: simple unicode cog
        settingsBtn.textContent = "⚙";
    }
    settingsBtn.onclick = () => {
        // Obsidian's settings modal API is not part of the public typings
        const app = plugin.app;
        app.setting?.open();
        app.setting?.openTabById(plugin.manifest.id);
    };
    return { headerEl: header, actionsEl: headerActions };
}

/**
 * Cost Tracking Utility Functions
 *
 * Provides derived cost calculations for tasks and projects.
 * Supports two cost modes:
 * - "fixed": user enters costEstimate / costActual directly
 * - "hourly": cost is derived from effort hours × hourly rate
 */
// ---------------------------------------------------------------------------
// Per-task calculations
// ---------------------------------------------------------------------------
/** Resolve the effective hourly rate for a task, falling back to project default. */
function getEffectiveRate(task, project) {
    return task.hourlyRate ?? project?.defaultHourlyRate ?? 0;
}
/** Get the estimated cost for a single task (not rolled up). */
function getTaskEstimatedCost(task, project) {
    if (task.costType === "hourly") {
        const rate = getEffectiveRate(task, project);
        const totalEffort = (task.effortCompleted ?? 0) + (task.effortRemaining ?? 0);
        return totalEffort * rate;
    }
    return task.costEstimate ?? 0;
}
/** Get the actual cost incurred for a single task (not rolled up). */
function getTaskActualCost(task, project) {
    if (task.costType === "hourly") {
        const rate = getEffectiveRate(task, project);
        return (task.effortCompleted ?? 0) * rate;
    }
    return task.costActual ?? 0;
}
/**
 * Compute a full cost summary for a project.
 * Only sums leaf tasks (tasks that are not parents) to avoid double-counting.
 */
function getProjectCostSummary(tasks, project) {
    const budgetTotal = project?.budgetTotal ?? 0;
    // Identify parent IDs to exclude them from summation (avoid double-counting)
    const parentIds = new Set(tasks.filter(t => t.parentId).map(t => t.parentId));
    const leafTasks = tasks.filter(t => !parentIds.has(t.id));
    let totalEstimated = 0;
    let totalActual = 0;
    const overBudgetTasks = [];
    for (const task of leafTasks) {
        const est = getTaskEstimatedCost(task, project);
        const act = getTaskActualCost(task, project);
        totalEstimated += est;
        totalActual += act;
        if (est > 0 && act > est) {
            overBudgetTasks.push(task);
        }
    }
    const budgetRemaining = budgetTotal - totalActual;
    const budgetUsedPercent = budgetTotal > 0
        ? Math.round((totalActual / budgetTotal) * 100)
        : 0;
    return {
        budgetTotal,
        totalEstimated,
        totalActual,
        budgetRemaining,
        budgetUsedPercent,
        overBudgetTasks,
    };
}
// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
/** Format a number as currency with the project's symbol. */
function formatCurrency(amount, currencySymbol) {
    const symbol = currencySymbol || "$";
    if (amount < 0) {
        return `-${symbol}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
/** Format variance with +/- prefix. */
function formatVariance(variance, currencySymbol) {
    const symbol = currencySymbol;
    const abs = Math.abs(variance);
    const formatted = abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    if (variance > 0)
        return `+${symbol}${formatted}`;
    if (variance < 0)
        return `-${symbol}${formatted}`;
    return `${symbol}0`;
}
/** Group tasks by a key function and compute cost breakdown per group. */
function getCostBreakdown(tasks, groupFn, project) {
    // Only leaf tasks
    const parentIds = new Set(tasks.filter(t => t.parentId).map(t => t.parentId));
    const leafTasks = tasks.filter(t => !parentIds.has(t.id));
    const groups = new Map();
    for (const task of leafTasks) {
        const key = groupFn(task);
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(task);
    }
    const rows = [];
    for (const [label, groupTasks] of groups) {
        const estimated = groupTasks.reduce((s, t) => s + getTaskEstimatedCost(t, project), 0);
        const actual = groupTasks.reduce((s, t) => s + getTaskActualCost(t, project), 0);
        rows.push({
            label,
            estimated,
            actual,
            variance: estimated - actual,
            taskCount: groupTasks.length,
        });
    }
    // Sort by actual cost descending
    rows.sort((a, b) => b.actual - a.actual);
    return rows;
}

const GRID_VIEW_ICON = "layout-grid";
const NON_HIDEABLE_COLUMNS = new Set(["drag", "number", "check"]);
class GridView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.unsubscribe = null;
        this.currentFilters = {
            status: "All",
            priority: "All",
            search: "",
            sortKey: "Manual", // locked to Manual - drag/drop order only
            sortDirection: "asc",
        };
        this.visibleRows = [];
        this.currentDragId = null;
        this.numberingMap = new Map();
        this.tableElement = null;
        // manual-dnd state
        this.dragTargetTaskId = null;
        this.dragInsertAfter = false;
        this.dragDropOnto = false; // true when dropping onto task to make it a child
        this.lastTargetRow = null; // Track for cleanup
        this.isEditingInline = false; // Track active inline editing to prevent re-renders
        // Column sizing + advanced sorting
        this.columnWidths = {};
        this.secondarySortKeys = [];
        // Clipboard for Cut/Copy/Paste
        this.clipboardTask = null;
        this.columnVisibility = {};
        // Column reordering (drag and drop)
        this.columnOrder = [];
        this.draggedColumnKey = null;
        this.dropTargetColumnKey = null;
        // Scroll position preservation (vertical + horizontal)
        this.savedScrollTop = null;
        this.savedScrollLeft = null;
        this.renderVersion = 0; // Monotonic counter — only the latest render restores scroll
        // Incremental rendering state
        this.renderedRowCount = 0;
        this.scrollRenderPending = false;
        // Cleanup callbacks for mid-operation view close
        this.activeDragCleanup = null;
        this.activeResizeCleanup = null;
        this.plugin = plugin;
        this.taskStore = plugin.taskStore;
    }
    // Allow plugin / detail view to update tasks
    async updateTask(id, fields) {
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
        // Clean up any in-progress drag listeners / DOM elements
        if (this.activeDragCleanup) {
            this.activeDragCleanup();
            this.activeDragCleanup = null;
        }
        // Clean up any in-progress column resize listeners
        if (this.activeResizeCleanup) {
            this.activeResizeCleanup();
            this.activeResizeCleanup = null;
        }
    }
    getViewType() {
        return "project-planner-view";
    }
    getDisplayText() {
        return "Project Planner";
    }
    getIcon() {
        return GRID_VIEW_ICON;
    }
    // ---------------------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------------------
    render() {
        const container = this.containerEl;
        const thisRender = ++this.renderVersion;
        // Save scroll position before clearing (if content exists)
        const existingContent = container.querySelector('.planner-grid-content');
        if (existingContent && this.savedScrollTop === null) {
            // Only save if we haven't explicitly saved already (for operations that need it)
            this.savedScrollTop = existingContent.scrollTop;
            this.savedScrollLeft = existingContent.scrollLeft;
        }
        container.empty();
        const wrapper = container.createDiv("planner-grid-wrapper");
        // -----------------------------------------------------------------------
        // Header
        // -----------------------------------------------------------------------
        const settings = this.plugin.settings;
        settings.projects || [];
        settings.activeProjectId;
        renderPlannerHeader(wrapper, this.plugin, {
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
                    const menu = new obsidian.Menu();
                    this.getColumnDefinitions()
                        .filter((c) => c.hideable)
                        .forEach((col) => {
                        const visible = this.isColumnVisible(col.key);
                        menu.addItem((item) => {
                            item.setTitle(col.label);
                            item.setChecked(visible);
                            item.onClick(() => this.toggleColumnVisibility(col.key));
                        });
                    });
                    menu.showAtMouseEvent(evt);
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
        const statusNames = statusOptions.map((s) => s.name);
        ["All", ...statusNames].forEach((s) => statusFilter.createEl("option", { text: s }));
        statusFilter.value = this.currentFilters.status;
        // Priority filter
        const priorityFilterGroup = filterBar.createDiv("planner-filter-group");
        priorityFilterGroup.createSpan({ cls: "planner-filter-label", text: "Priority:" });
        const priorityFilter = priorityFilterGroup.createEl("select", {
            cls: "planner-filter",
        });
        const priorityOptions = settings.availablePriorities || [];
        const priorityNames = priorityOptions.map((p) => p.name);
        ["All", ...priorityNames].forEach((p) => priorityFilter.createEl("option", { text: p }));
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
            const hasFilters = this.currentFilters.status !== "All" ||
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
            }
            else {
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
        const showCompleted = this.plugin.settings?.showCompleted ?? true;
        if (!showCompleted) {
            all = all.filter((t) => !t.completed);
        }
        const matchesFilter = new Map();
        const f = this.currentFilters;
        for (const t of all) {
            let match = true;
            if (f.status !== "All" && t.status !== f.status)
                match = false;
            const defaultPriority = settings.availablePriorities?.[0]?.name || "Medium";
            if (f.priority !== "All" && (t.priority || defaultPriority) !== f.priority)
                match = false;
            if (f.search.trim() !== "" && !t.title.toLowerCase().includes(f.search))
                match = false;
            matchesFilter.set(t.id, match);
        }
        // Roots: keep manual order only (no sorting)
        const roots = all.filter((t) => !t.parentId);
        const visibleRows = [];
        // Recursive function to build hierarchy
        const addTaskAndChildren = (task, depth) => {
            const children = all.filter((t) => t.parentId === task.id);
            const taskMatches = matchesFilter.get(task.id) ?? true;
            const matchingChildren = children.filter((c) => matchesFilter.get(c.id) ?? true);
            const hasChildren = children.length > 0;
            if (!taskMatches && matchingChildren.length === 0)
                return;
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
        // Restore scroll position (vertical + horizontal) after content is created.
        // Only the LATEST render's callback fires — earlier (stale) renders are skipped
        // via the version check, preventing them from clearing savedScrollTop to null.
        if (this.savedScrollTop !== null || this.savedScrollLeft !== null) {
            const restoreTop = this.savedScrollTop;
            const restoreLeft = this.savedScrollLeft;
            requestAnimationFrame(() => {
                if (this.renderVersion !== thisRender)
                    return; // stale render — skip
                if (restoreTop !== null)
                    content.scrollTop = restoreTop;
                if (restoreLeft !== null)
                    content.scrollLeft = restoreLeft;
                this.savedScrollTop = null;
                this.savedScrollLeft = null;
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
            if (col.reorderable) {
                th.draggable = true;
                th.classList.add("planner-column-draggable");
                this.setupColumnDrag(th, col.key, headerRow);
            }
            // Label
            th.createSpan({ text: col.label });
            // Column resizing + double-click auto-fit
            this.attachColumnResizer(th, col.key, table, visibleIndex);
            visibleIndex++;
        });
        // Create tbody for table rows
        const tbody = table.createEl("tbody");
        // -------------------------------------------------------
        // Generate Planner-style numbering (1, 2, 3, ...)
        // -------------------------------------------------------
        const numberingMap = new Map();
        let counter = 1;
        for (const row of visibleRows) {
            numberingMap.set(row.task.id, counter++);
        }
        this.numberingMap = numberingMap;
        // Incremental rendering: render first batch immediately, rest on scroll
        this.renderedRowCount = 0;
        this.renderRowBatch(tbody, visibleRows);
        if (visibleRows.length > GridView.ROW_BATCH_SIZE) {
            const onScroll = () => {
                if (this.scrollRenderPending)
                    return;
                if (this.renderedRowCount >= this.visibleRows.length)
                    return;
                const el = content;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
                    this.scrollRenderPending = true;
                    requestAnimationFrame(() => {
                        this.renderRowBatch(tbody, this.visibleRows);
                        this.scrollRenderPending = false;
                    });
                }
            };
            content.addEventListener("scroll", onScroll, { passive: true });
        }
    }
    /** Render the next batch of rows into the tbody. */
    renderRowBatch(tbody, rows) {
        const start = this.renderedRowCount;
        const end = Math.min(start + GridView.ROW_BATCH_SIZE, rows.length);
        for (let i = start; i < end; i++) {
            const r = rows[i];
            this.renderTaskRow(tbody, r.task, r.isChild, r.hasChildren, i, r.depth);
        }
        this.renderedRowCount = end;
    }
    // ---------------------------------------------------------------------------
    // Re-render only table body (for search filtering)
    // ---------------------------------------------------------------------------
    renderTableBody() {
        if (!this.tableElement) {
            // Fallback to full render if table doesn't exist
            this.render();
            return;
        }
        const settings = this.plugin.settings;
        // -----------------------------------------------------------------------
        // Build visible hierarchy (with filters)
        // -----------------------------------------------------------------------
        let all = this.taskStore.getAll();
        // Filter out completed tasks if setting is disabled
        const showCompleted = settings?.showCompleted ?? true;
        if (!showCompleted) {
            all = all.filter((t) => !t.completed);
        }
        const matchesFilter = new Map();
        const f = this.currentFilters;
        for (const t of all) {
            let match = true;
            if (f.status !== "All" && t.status !== f.status)
                match = false;
            const defaultPriority = settings.availablePriorities?.[0]?.name || "Medium";
            if (f.priority !== "All" && (t.priority || defaultPriority) !== f.priority)
                match = false;
            if (f.search.trim() !== "" && !t.title.toLowerCase().includes(f.search))
                match = false;
            matchesFilter.set(t.id, match);
        }
        // Roots: keep manual order only
        const roots = all.filter((t) => !t.parentId);
        const visibleRows = [];
        // Recursive function to build hierarchy
        const addTaskAndChildren = (task, depth) => {
            const children = all.filter((t) => t.parentId === task.id);
            const taskMatches = matchesFilter.get(task.id) ?? true;
            const matchingChildren = children.filter((c) => matchesFilter.get(c.id) ?? true);
            const hasChildren = children.length > 0;
            if (!taskMatches && matchingChildren.length === 0)
                return;
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
        const numberingMap = new Map();
        let counter = 1;
        for (const row of visibleRows) {
            numberingMap.set(row.task.id, counter++);
        }
        this.numberingMap = numberingMap;
        // Get or create tbody
        let tbody = this.tableElement.querySelector('tbody');
        if (!tbody) {
            tbody = this.tableElement.createEl('tbody');
        }
        else {
            // Clear existing rows in tbody
            tbody.empty();
        }
        // Add new rows
        visibleRows.forEach((r, i) => this.renderTaskRow(tbody, r.task, r.isChild, r.hasChildren, i, r.depth));
    }
    // ---------------------------------------------------------------------------
    // Render individual row
    // ---------------------------------------------------------------------------
    renderTaskRow(parent, task, isChild, hasChildren, index, depth) {
        const row = parent.createEl("tr", {
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
        // Build a map of column key → cell render function
        // Then iterate in getColumnDefinitions() order so reordering works
        const cellRenderers = {
            drag: () => {
                const dragCell = row.createEl("td", { cls: "planner-drag-cell" });
                const dragHandle = dragCell.createSpan({
                    cls: "planner-drag-handle",
                    text: "⋮⋮",
                });
                dragHandle.onpointerdown = (evt) => {
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
                }
                else {
                    titleCell.createSpan({ cls: "planner-expand-spacer", text: "" });
                }
                const titleInner = titleCell.createDiv({ cls: "planner-title-inner" });
                const titleSpan = this.createEditableTextSpan(titleInner, task.title, async (value) => {
                    this.saveScrollPosition();
                    await this.taskStore.updateTask(task.id, { title: value });
                });
                if (hasChildren)
                    titleSpan.classList.add("planner-parent-bold");
                if (task.completed)
                    titleSpan.classList.add("planner-task-completed");
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
                const settings = this.plugin.settings;
                const availableStatuses = settings.availableStatuses || [];
                const statusNames = availableStatuses.map((s) => s.name);
                this.createEditableSelectCell(statusCell, task.status, statusNames, async (value) => {
                    this.saveScrollPosition();
                    await this.taskStore.updateTask(task.id, { status: value });
                }, (val, target) => this.createStatusPill(val, target));
            },
            priority: () => {
                const priorityCell = row.createEl("td");
                const settings = this.plugin.settings;
                const availablePriorities = settings.availablePriorities || [];
                const priorityNames = availablePriorities.map((p) => p.name);
                const defaultPriority = availablePriorities[0]?.name || "Medium";
                this.createEditableSelectCell(priorityCell, task.priority || defaultPriority, priorityNames, async (value) => {
                    await this.taskStore.updateTask(task.id, { priority: value });
                }, (val, target) => this.createPriorityPill(val, target));
            },
            bucket: () => {
                const bucketCell = row.createEl("td");
                if (hasChildren) {
                    bucketCell.createSpan({ cls: "planner-disabled-cell", text: "—" });
                }
                else {
                    const settings = this.plugin.settings;
                    const activeProject = settings.projects?.find((p) => p.id === settings.activeProjectId);
                    const buckets = activeProject?.buckets || [];
                    const bucketNames = ["Unassigned", ...buckets.map((b) => b.name)];
                    const currentBucketId = task.bucketId;
                    const currentBucketName = currentBucketId
                        ? buckets.find((b) => b.id === currentBucketId)?.name || "Unassigned"
                        : "Unassigned";
                    this.createEditableSelectCell(bucketCell, currentBucketName, bucketNames, async (value) => {
                        this.saveScrollPosition();
                        if (value === "Unassigned") {
                            await this.taskStore.updateTask(task.id, { bucketId: undefined });
                        }
                        else {
                            const selectedBucket = buckets.find((b) => b.name === value);
                            if (selectedBucket) {
                                await this.taskStore.updateTask(task.id, { bucketId: selectedBucket.id });
                            }
                        }
                    });
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
                    const autoScheduleEnabled = this.plugin.settings?.enableDependencyScheduling;
                    let titleText;
                    if (hasViolations) {
                        titleText = `${violations.length} violation(s):\n${violations.join("\n")}`;
                    }
                    else {
                        titleText = `${dependencies.length} dependency/ies`;
                        if (autoScheduleEnabled)
                            titleText += " (auto-scheduled)";
                    }
                    const indicator = depsCell.createEl("span", {
                        cls: hasViolations
                            ? "planner-dependency-indicator planner-dependency-warning"
                            : autoScheduleEnabled
                                ? "planner-dependency-indicator planner-dependency-auto"
                                : "planner-dependency-indicator",
                        text: hasViolations ? "⚠️" : autoScheduleEnabled ? "📐" : "🔗",
                        attr: { title: titleText }
                    });
                    indicator.onclick = () => { this.plugin.openTaskDetail(task); };
                }
            },
            start: () => {
                const isRolledUp = hasChildren && this.plugin.settings.enableParentRollUp;
                if (isRolledUp) {
                    const cell = row.createEl("td", {
                        cls: "planner-date-cell-readonly planner-rolled-up",
                        text: task.startDate || "-"
                    });
                    cell.setAttribute("title", "Rolled up from subtasks");
                    return;
                }
                const startCell = row.createEl("td");
                this.createEditableDateOnlyCell(startCell, task.startDate || "", async (value) => {
                    await this.taskStore.updateTask(task.id, { startDate: value });
                });
            },
            due: () => {
                const isRolledUp = hasChildren && this.plugin.settings.enableParentRollUp;
                if (isRolledUp) {
                    const cell = row.createEl("td", {
                        cls: "planner-date-cell-readonly planner-rolled-up",
                        text: task.dueDate || "-"
                    });
                    cell.setAttribute("title", "Rolled up from subtasks");
                    return;
                }
                const dueCell = row.createEl("td");
                this.createEditableDateOnlyCell(dueCell, task.dueDate || "", async (value) => {
                    await this.taskStore.updateTask(task.id, { dueDate: value });
                }, true);
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
                const isRolledUp = hasChildren && this.plugin.settings.enableParentRollUp;
                const cell = row.createEl("td", {
                    cls: `planner-effort-cell planner-percent-cell${isRolledUp ? " planner-rolled-up" : ""}`,
                    text: `${pct}%`
                });
                if (isRolledUp)
                    cell.setAttribute("title", "Rolled up from subtasks");
            },
            effortCompleted: () => {
                const isRolledUp = hasChildren && this.plugin.settings.enableParentRollUp;
                if (isRolledUp) {
                    const val = task.effortCompleted ?? 0;
                    const cell = row.createEl("td", {
                        cls: "planner-effort-cell planner-rolled-up",
                        text: val > 0 ? `${val}h` : "-"
                    });
                    cell.setAttribute("title", "Rolled up from subtasks");
                    return;
                }
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
                ecInput.onkeydown = (e) => { if (e.key === "Enter") {
                    ecInput.blur();
                } };
            },
            effortRemaining: () => {
                const isRolledUp = hasChildren && this.plugin.settings.enableParentRollUp;
                if (isRolledUp) {
                    const val = task.effortRemaining ?? 0;
                    const cell = row.createEl("td", {
                        cls: "planner-effort-cell planner-rolled-up",
                        text: val > 0 ? `${val}h` : "-"
                    });
                    cell.setAttribute("title", "Rolled up from subtasks");
                    return;
                }
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
                erInput.onkeydown = (e) => { if (e.key === "Enter") {
                    erInput.blur();
                } };
            },
            effortTotal: () => {
                const total = (task.effortCompleted ?? 0) + (task.effortRemaining ?? 0);
                const isRolledUp = hasChildren && this.plugin.settings.enableParentRollUp;
                const cell = row.createEl("td", {
                    cls: `planner-effort-cell planner-effort-total-cell${isRolledUp ? " planner-rolled-up" : ""}`,
                    text: total > 0 ? `${total}h` : "-"
                });
                if (isRolledUp)
                    cell.setAttribute("title", "Rolled up from subtasks");
            },
            duration: () => {
                let durationText = "-";
                if (task.startDate && task.dueDate) {
                    // Parse dates without timezone issues (YYYY-MM-DD format)
                    const sp = task.startDate.split("-").map(Number);
                    const ep = task.dueDate.split("-").map(Number);
                    const start = new Date(sp[0], sp[1] - 1, sp[2]);
                    const end = new Date(ep[0], ep[1] - 1, ep[2]);
                    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays >= 0) {
                        const inclusive = Math.max(1, diffDays);
                        durationText = inclusive === 1 ? "1 day" : `${inclusive} days`;
                    }
                    else {
                        durationText = "Invalid";
                    }
                }
                const isRolledUp = hasChildren && this.plugin.settings.enableParentRollUp;
                const cell = row.createEl("td", {
                    cls: `planner-effort-cell planner-duration-cell${isRolledUp ? " planner-rolled-up" : ""}`,
                    text: durationText
                });
                if (isRolledUp)
                    cell.setAttribute("title", "Rolled up from subtasks");
            },
            costEstimate: () => {
                const settings = this.plugin.settings;
                const project = settings.projects?.find(p => p.id === settings.activeProjectId);
                const currency = project?.currencySymbol || "$";
                const isRolledUp = hasChildren && this.plugin.settings.enableParentRollUp;
                const est = getTaskEstimatedCost(task, project);
                if (!task.costType && !isRolledUp) {
                    row.createEl("td", { cls: "planner-effort-cell", text: "-" });
                    return;
                }
                const cell = row.createEl("td", {
                    cls: `planner-effort-cell planner-cost-cell${isRolledUp ? " planner-rolled-up" : ""}`,
                    text: est > 0 ? formatCurrency(est, currency) : "-"
                });
                if (isRolledUp)
                    cell.setAttribute("title", "Rolled up from subtasks");
            },
            costActual: () => {
                const settings = this.plugin.settings;
                const project = settings.projects?.find(p => p.id === settings.activeProjectId);
                const currency = project?.currencySymbol || "$";
                const isRolledUp = hasChildren && this.plugin.settings.enableParentRollUp;
                const act = getTaskActualCost(task, project);
                if (!task.costType && !isRolledUp) {
                    row.createEl("td", { cls: "planner-effort-cell", text: "-" });
                    return;
                }
                const cell = row.createEl("td", {
                    cls: `planner-effort-cell planner-cost-cell${isRolledUp ? " planner-rolled-up" : ""}`,
                    text: act > 0 ? formatCurrency(act, currency) : "-"
                });
                if (isRolledUp)
                    cell.setAttribute("title", "Rolled up from subtasks");
            },
        };
        // Render cells in the dynamic column order (respects drag-and-drop reordering)
        const columns = this.getColumnDefinitions();
        for (const col of columns) {
            if (!this.isColumnVisible(col.key))
                continue;
            const renderer = cellRenderers[col.key];
            if (renderer)
                renderer();
        }
    }
    // ---------------------------------------------------------------------------
    // 3-dots inline menu used by title cell
    // ---------------------------------------------------------------------------
    buildInlineMenu(task, evt) {
        const rowIndex = this.visibleRows.findIndex((r) => r.task.id === task.id);
        this.showTaskMenu(task, rowIndex, evt);
    }
    // ---------------------------------------------------------------------------
    // Context menu (right-click) mirrors 3-dots menu
    // ---------------------------------------------------------------------------
    showTaskMenu(task, rowIndex, evt) {
        const menu = new obsidian.Menu();
        menu.addItem((item) => item
            .setTitle("Open details")
            .setIcon("pencil")
            .onClick(() => this.plugin.openTaskDetail(task)));
        menu.addSeparator();
        // Cut
        menu.addItem((item) => item
            .setTitle("Cut")
            .setIcon("scissors")
            .onClick(() => {
            this.clipboardTask = { task: { ...task }, isCut: true };
        }));
        // Copy
        menu.addItem((item) => item
            .setTitle("Copy")
            .setIcon("copy")
            .onClick(() => {
            this.clipboardTask = { task: { ...task }, isCut: false };
        }));
        // Paste
        menu.addItem((item) => item
            .setTitle("Paste")
            .setIcon("clipboard")
            .setDisabled(!this.clipboardTask)
            .onClick(async () => {
            if (!this.clipboardTask)
                return;
            const { task: clipTask, isCut } = this.clipboardTask;
            if (isCut) {
                // Move the task by updating its parentId
                await this.taskStore.updateTask(clipTask.id, {
                    parentId: task.parentId,
                });
                this.clipboardTask = null;
            }
            else {
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
        }));
        menu.addSeparator();
        // Copy link to task
        menu.addItem((item) => item
            .setTitle("Copy link to task")
            .setIcon("link")
            .onClick(async () => {
            const projectId = this.plugin.settings.activeProjectId;
            const uri = `obsidian://open-planner-task?id=${encodeURIComponent(task.id)}&project=${encodeURIComponent(projectId)}`;
            try {
                await navigator.clipboard.writeText(uri);
                new obsidian.Notice("Task link copied to clipboard");
            }
            catch (err) {
                console.error("Failed to copy link:", err);
                new obsidian.Notice("Failed to copy link");
            }
        }));
        // Open Markdown task note
        menu.addItem((item) => item
            .setTitle("Open Markdown task note")
            .setIcon("file-text")
            .setDisabled(!this.plugin.settings.enableMarkdownSync)
            .onClick(async () => {
            if (!this.plugin.settings.enableMarkdownSync)
                return;
            const projectId = this.plugin.settings.activeProjectId;
            const project = this.plugin.settings.projects.find((p) => p.id === projectId);
            if (!project)
                return;
            // Use the same path as TaskSync
            const filePath = this.plugin.taskSync.getTaskFilePath(task, project.name);
            try {
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (file && file instanceof obsidian.TFile) {
                    await this.app.workspace.openLinkText(filePath, "", true);
                }
                else {
                    // Note doesn't exist - create it
                    new obsidian.Notice("Creating task note...");
                    await this.plugin.taskSync.syncTaskToMarkdown(task, projectId);
                    // Wait a moment for the file to be created, then open it
                    setTimeout(async () => {
                        await this.app.workspace.openLinkText(filePath, "", true);
                    }, 100);
                }
            }
            catch (err) {
                console.error("Failed to open task note:", err);
                new obsidian.Notice("Failed to open task note");
            }
        }));
        menu.addSeparator();
        menu.addItem((item) => item
            .setTitle("Add new task above")
            .setIcon("plus")
            .onClick(async () => {
            await this.addTaskAbove(task, rowIndex);
        }));
        const canMakeSubtask = rowIndex > 0;
        const canPromote = !!task.parentId;
        menu.addItem((item) => item
            .setTitle("Make subtask")
            .setIcon("indent")
            .setDisabled(!canMakeSubtask)
            .onClick(async () => {
            if (!canMakeSubtask)
                return;
            await this.handleMakeSubtask(task, rowIndex);
            // Don't call render() - TaskStore subscription handles it
        }));
        menu.addItem((item) => item
            .setTitle("Promote subtask")
            .setIcon("unindent")
            .setDisabled(!canPromote)
            .onClick(async () => {
            if (!canPromote)
                return;
            await this.taskStore.promoteSubtask(task.id);
            // Don't call render() - TaskStore subscription handles it
        }));
        menu.addSeparator();
        menu.addItem((item) => item
            .setTitle("Delete task")
            .setIcon("trash")
            .onClick(async () => {
            await this.taskStore.deleteTask(task.id);
            // Don't call render() - TaskStore subscription handles it
        }));
        menu.showAtMouseEvent(evt);
    }
    // ---------------------------------------------------------------------------
    // Make subtask (indent)
    // ---------------------------------------------------------------------------
    async handleMakeSubtask(task, rowIndex) {
        if (rowIndex <= 0)
            return;
        const aboveRow = this.visibleRows[rowIndex - 1];
        if (!aboveRow)
            return;
        const all = this.taskStore.getAll();
        let parent;
        if (aboveRow.task.parentId) {
            parent =
                all.find((t) => t.id === aboveRow.task.parentId) ?? aboveRow.task;
        }
        else {
            parent = aboveRow.task;
        }
        if (!parent || parent.id === task.id)
            return;
        await this.taskStore.makeSubtask(task.id, parent.id);
    }
    // ---------------------------------------------------------------------------
    // Add new task above
    // ---------------------------------------------------------------------------
    async addTaskAbove(task, _rowIndex) {
        const all = this.taskStore.getAll();
        const allIds = all.map((t) => t.id);
        // Determine insertion index in global order
        const targetIndex = allIds.indexOf(task.id);
        const insertIndex = targetIndex >= 0 ? targetIndex : 0;
        // Single atomic insert at the correct position with the right parentId.
        // This emits exactly once — no intermediate renders that flash the task
        // at the wrong position or cause it to disappear.
        const newTask = await this.taskStore.addTaskAtIndex("New Task", insertIndex, task.parentId ? { parentId: task.parentId } : undefined);
        // Focus title editor
        this.focusNewTaskTitleImmediate(newTask.id);
    }
    // Helper: Focus the title input of the newly created task
    focusNewTaskTitleImmediate(taskId) {
        // Wait for the render triggered by setOrder/emit to complete and DOM to update
        requestAnimationFrame(() => {
            const titleEl = this.containerEl.querySelector(`tr[data-task-id="${taskId}"] .planner-title-inner .planner-editable`);
            if (titleEl) {
                titleEl.click();
                // Ensure input field is selected after editor opens
                requestAnimationFrame(() => {
                    const inputEl = this.containerEl.querySelector(`tr[data-task-id="${taskId}"] .planner-input`);
                    if (inputEl) {
                        inputEl.select();
                    }
                });
            }
        });
    }
    // Helper: Save current scroll position for restoration after re-render.
    // Idempotent — if a position is already saved (e.g., from an earlier call in
    // the same operation), we keep it. A second call during a stale re-render
    // would read scrollTop=0 from a freshly rebuilt DOM and clobber the real value.
    saveScrollPosition() {
        if (this.savedScrollTop !== null)
            return;
        const content = this.containerEl.querySelector('.planner-grid-content');
        if (content) {
            this.savedScrollTop = content.scrollTop;
            this.savedScrollLeft = content.scrollLeft;
        }
    }
    // ---------------------------------------------------------------------------
    // Drag-and-drop reordering (Planner-style blocks, manual DnD)
    // ---------------------------------------------------------------------------
    handleRowDragStart(evt, row, task) {
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
        const inner = row.cloneNode(true);
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
        document.body.style.webkitUserSelect = "none";
        document.body.style.cursor = "grabbing";
        const offsetY = evt.clientY - rowRect.top;
        // Throttle drop zone calculations for better performance
        let lastTargetCheck = 0;
        const TARGET_CHECK_INTERVAL = 16; // ~60fps
        // Auto-scroll when dragging near viewport edges
        let autoScrollInterval = null;
        const AUTO_SCROLL_THRESHOLD = 80; // pixels from edge
        const AUTO_SCROLL_SPEED = 10; // pixels per frame
        const updateAutoScroll = (clientY) => {
            const viewportHeight = window.innerHeight;
            const scrollContainer = this.containerEl.querySelector('.planner-grid-content');
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
            }
            else if (clientY > viewportHeight - AUTO_SCROLL_THRESHOLD) {
                if (autoScrollInterval === null) {
                    const scroll = () => {
                        scrollContainer.scrollTop += AUTO_SCROLL_SPEED;
                        autoScrollInterval = requestAnimationFrame(scroll);
                    };
                    autoScrollInterval = requestAnimationFrame(scroll);
                }
            }
            else {
                if (autoScrollInterval !== null) {
                    cancelAnimationFrame(autoScrollInterval);
                    autoScrollInterval = null;
                }
            }
        };
        const onMove = (moveEvt) => {
            moveEvt.preventDefault();
            const y = moveEvt.clientY - offsetY;
            ghost.style.top = `${y}px`;
            updateAutoScroll(moveEvt.clientY);
            const now = Date.now();
            if (now - lastTargetCheck < TARGET_CHECK_INTERVAL)
                return;
            lastTargetCheck = now;
            const targetEl = document.elementFromPoint(moveEvt.clientX, moveEvt.clientY);
            const targetRow = targetEl?.closest("tr.planner-row");
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
            }
            else if (relativeY > bottomZone) {
                before = false;
            }
            else {
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
                if (dropOnto)
                    targetRow.classList.add("planner-row-drop-onto");
            }
            else {
                targetRow.classList.remove("planner-row-drop-target", "planner-row-drop-onto");
                targetRow.classList.add("planner-row-drop-target");
                if (dropOnto)
                    targetRow.classList.add("planner-row-drop-onto");
            }
            if (dropOnto) {
                indicator.style.opacity = "0";
                requestAnimationFrame(() => { indicator.style.display = "none"; });
            }
            else {
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
        const onUp = async (upEvt) => {
            upEvt.preventDefault();
            window.removeEventListener("pointermove", onMove, true);
            window.removeEventListener("pointerup", onUp, true);
            this.activeDragCleanup = null;
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
            document.body.style.webkitUserSelect = "";
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
        // Store cleanup in case view is closed mid-drag
        this.activeDragCleanup = () => {
            window.removeEventListener("pointermove", onMove, true);
            window.removeEventListener("pointerup", onUp, true);
            if (autoScrollInterval !== null) {
                cancelAnimationFrame(autoScrollInterval);
            }
            ghost.remove();
            indicator.remove();
            row.classList.remove("planner-row-dragging");
            document.body.style.userSelect = "";
            document.body.style.webkitUserSelect = "";
            document.body.style.cursor = "";
            if (this.lastTargetRow) {
                this.lastTargetRow.classList.remove("planner-row-drop-target", "planner-row-drop-onto");
                this.lastTargetRow = null;
            }
        };
    }
    async handleDrop(dragId, targetId, insertAfter, dropOnto = false) {
        // Save scroll position before drag-drop operations that will trigger re-render
        this.saveScrollPosition();
        const tasks = this.taskStore.getAll();
        const dragTask = tasks.find((t) => t.id === dragId);
        const targetTask = tasks.find((t) => t.id === targetId);
        if (!dragTask || !targetTask)
            return;
        if (dragTask.id === targetTask.id)
            return;
        // Prevent dropping onto own child (circular reference)
        if (dropOnto && dragTask.id === targetTask.parentId)
            return;
        // Prevent dropping parent onto its own descendant
        if (dropOnto && !dragTask.parentId) {
            const isDescendant = (taskId) => {
                const children = tasks.filter(t => t.parentId === taskId);
                if (children.some(c => c.id === targetTask.id))
                    return true;
                return children.some(c => isDescendant(c.id));
            };
            if (isDescendant(dragTask.id))
                return;
        }
        const ids = tasks.map((t) => t.id);
        // Recursive helper: collect all descendants (children, grandchildren, etc.)
        const getAllDescendants = (taskId) => {
            const descendants = [];
            const children = tasks.filter((t) => t.parentId === taskId);
            for (const child of children) {
                descendants.push(child.id);
                descendants.push(...getAllDescendants(child.id));
            }
            return descendants;
        };
        // Handle dropping onto a task (make it a child)
        if (dropOnto) {
            // If dragging a parent task, move it with all its descendants
            if (!dragTask.parentId) {
                const blockIds = [dragTask.id, ...getAllDescendants(dragTask.id)];
                // Remove block from current position
                const firstIdx = ids.indexOf(blockIds[0]);
                if (firstIdx === -1)
                    return;
                ids.splice(firstIdx, blockIds.length);
                // Find position: right after target task (as first child)
                const targetIndex = ids.indexOf(targetId);
                if (targetIndex === -1)
                    return;
                ids.splice(targetIndex + 1, 0, ...blockIds);
                // Update parent relationship for the dragged task only
                await this.taskStore.updateTask(dragId, { parentId: targetId });
                await this.taskStore.setOrder(ids);
                // Don't call render() - TaskStore subscription handles it
                return;
            }
            else {
                // Dragging a child task - move just this task
                const fromIndex = ids.indexOf(dragId);
                if (fromIndex === -1)
                    return;
                ids.splice(fromIndex, 1);
                // Find position: right after target task (as first child)
                const targetIndex = ids.indexOf(targetId);
                if (targetIndex === -1)
                    return;
                ids.splice(targetIndex + 1, 0, dragId);
                // Update parent relationship
                await this.taskStore.updateTask(dragId, { parentId: targetId });
                await this.taskStore.setOrder(ids);
                // Don't call render() - TaskStore subscription handles it
                return;
            }
        }
        // Parent drag: move parent + all descendants as a contiguous block
        if (!dragTask.parentId) {
            const blockIds = [dragTask.id, ...getAllDescendants(dragTask.id)];
            // If target is inside the same block, ignore
            if (blockIds.includes(targetTask.id))
                return;
            const targetRootId = targetTask.parentId || targetTask.id;
            // If dropping onto one of own children, ignore
            if (blockIds.includes(targetRootId))
                return;
            // Remove block from ids
            const firstIdx = ids.indexOf(blockIds[0]);
            if (firstIdx === -1)
                return;
            ids.splice(firstIdx, blockIds.length);
            // Find target root index in the remaining list
            let targetRootIndex = ids.indexOf(targetRootId);
            if (targetRootIndex === -1) {
                targetRootIndex = ids.length;
            }
            // If inserting after, move index to after the entire target block (including all descendants)
            if (insertAfter && targetRootIndex < ids.length) {
                const targetDescendants = new Set(getAllDescendants(targetRootId));
                let endIndex = targetRootIndex;
                for (let i = targetRootIndex + 1; i < ids.length; i++) {
                    if (targetDescendants.has(ids[i])) {
                        endIndex = i;
                    }
                    else {
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
        if (fromIndex === -1)
            return;
        ids.splice(fromIndex, 1);
        let insertIndex = ids.indexOf(targetId);
        if (insertIndex === -1) {
            insertIndex = ids.length;
        }
        else if (insertAfter) {
            insertIndex += 1;
        }
        ids.splice(insertIndex, 0, dragId);
        // Determine new parent based on drop location
        let newParentId = null;
        // If dropping on/near the target task
        if (targetTask.parentId) {
            // Target is a child - use target's parent
            newParentId = targetTask.parentId;
        }
        else {
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
            }
            else {
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
    createPill(type, value, container) {
        const pill = container.createEl("span");
        const v = value.toLowerCase().replace(/\s+/g, "-");
        pill.className =
            type === "priority"
                ? `priority-pill priority-${v}`
                : `status-pill status-${v}`;
        pill.textContent = value;
        return pill;
    }
    createStatusPill(value, container) {
        const pill = container.createEl("span", {
            cls: "status-pill",
            text: value
        });
        // Find the status color
        const settings = this.plugin.settings;
        const availableStatuses = settings.availableStatuses || [];
        const status = availableStatuses.find((s) => s.name === value);
        if (status) {
            pill.style.backgroundColor = status.color;
        }
        return pill;
    }
    createPriorityPill(value, container) {
        const pill = container.createEl("span", {
            cls: "priority-pill",
            text: value
        });
        // Find the priority color
        const settings = this.plugin.settings;
        const availablePriorities = settings.availablePriorities || [];
        const priority = availablePriorities.find((p) => p.name === value);
        if (priority) {
            pill.style.backgroundColor = priority.color;
        }
        return pill;
    }
    // ---------------------------------------------------------------------------
    // Dependency validation helpers
    // ---------------------------------------------------------------------------
    checkDependencyViolations(task) {
        const violations = [];
        if (!task.dependencies || task.dependencies.length === 0)
            return violations;
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
    createEditableTextSpan(container, value, onSave) {
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
    createEditableSelectCell(container, value, options, onSave, renderDisplay) {
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
                if (opt === current)
                    optionEl.selected = true;
            });
            select.focus();
            // Guard: onchange fires first, then container.empty() during render
            // detaches the select causing a second onblur. Without the guard we
            // get a redundant updateTask + a stale-DOM scroll position read.
            let saved = false;
            const save = async () => {
                if (saved)
                    return;
                saved = true;
                const newValue = select.value;
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
    createEditableDateOnlyCell(container, value, onSave, applyConditionalFormatting = false) {
        // Normalize to YYYY-MM-DD if we were given an ISO datetime
        let rawValue = value || "";
        if (rawValue.includes("T")) {
            rawValue = rawValue.slice(0, 10);
        }
        const isEmpty = !rawValue;
        const formatPlanner = (dateStr) => {
            if (!dateStr)
                return "Set date";
            const parts = dateStr.split("-");
            if (parts.length !== 3)
                return "Set date";
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
        const getCompareDate = (dateStr) => {
            if (!dateStr)
                return null;
            const parts = dateStr.split("-");
            if (parts.length !== 3)
                return null;
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
                }
                else if (cmp === 0) {
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
            // Guard: container.empty() during render detaches the date input,
            // firing a second onblur after the first save already ran.
            let saved = false;
            const save = async () => {
                if (saved)
                    return;
                saved = true;
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
                }
                else {
                    const d = getCompareDate(rawValue);
                    if (applyConditionalFormatting && d) {
                        if (d.getTime() < today.getTime()) {
                            span.classList.add("planner-date-pill-overdue");
                        }
                        else if (d.getTime() === today.getTime()) {
                            span.classList.add("planner-date-pill-today");
                        }
                        else {
                            span.classList.add("planner-date-pill-neutral");
                        }
                    }
                    else {
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
    getColumnDefinitions() {
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
            { key: "costEstimate", label: "Est. Cost", hideable: true, reorderable: true },
            { key: "costActual", label: "Actual Cost", hideable: true, reorderable: true },
        ];
        // Apply custom column order if available
        if (this.columnOrder.length > 0) {
            // Separate non-reorderable columns (drag, number, check)
            const nonReorderable = allColumns.filter(c => !c.reorderable);
            const reorderable = allColumns.filter(c => c.reorderable);
            // Sort reorderable columns by custom order
            const orderedReorderable = this.columnOrder
                .map(key => reorderable.find(c => c.key === key))
                .filter(c => c !== undefined);
            // Add any new columns that aren't in the saved order
            const missingColumns = reorderable.filter(c => !this.columnOrder.includes(c.key));
            return [...nonReorderable, ...orderedReorderable, ...missingColumns];
        }
        return allColumns;
    }
    isColumnVisible(key) {
        if (NON_HIDEABLE_COLUMNS.has(key))
            return true;
        const stored = this.columnVisibility[key];
        return stored !== false;
    }
    toggleColumnVisibility(key) {
        if (NON_HIDEABLE_COLUMNS.has(key))
            return;
        const current = this.columnVisibility[key];
        this.columnVisibility[key] = current === false ? true : false;
        this.saveGridViewSettings();
        this.render();
    }
    // ---------------------------------------------------------------------------
    // Column resizing + auto-fit
    // ---------------------------------------------------------------------------
    attachColumnResizer(th, columnKey, table, columnIndex) {
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
        const onMouseMove = (e) => {
            const delta = e.clientX - startX;
            const newWidth = Math.max(60, startWidth + delta);
            th.style.width = `${newWidth}px`;
        };
        const onMouseUp = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            this.activeResizeCleanup = null;
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
            // Store cleanup in case view is closed mid-resize
            this.activeResizeCleanup = () => {
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
                document.body.style.cursor = "";
            };
        });
        // Double-click on the handle: auto-fit
        handle.addEventListener("dblclick", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.autoFitColumn(th, columnKey, table, columnIndex);
        });
    }
    autoFitColumn(th, columnKey, table, columnIndex) {
        let maxWidth = th.offsetWidth;
        const rows = Array.from(table.querySelectorAll("tr"));
        for (const row of rows) {
            const cell = row.children[columnIndex];
            if (!cell)
                continue;
            const cellWidth = cell.getBoundingClientRect().width;
            if (cellWidth > maxWidth)
                maxWidth = cellWidth;
        }
        th.style.width = `${maxWidth}px`;
        this.columnWidths[columnKey] = maxWidth;
        this.saveGridViewSettings();
    }
    // ---------------------------------------------------------------------------
    // Column drag and drop for reordering
    // ---------------------------------------------------------------------------
    setupColumnDrag(th, columnKey, headerRow) {
        // Drag start
        th.ondragstart = (e) => {
            this.draggedColumnKey = columnKey;
            th.classList.add("planner-column-dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", columnKey);
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
            if (!this.draggedColumnKey)
                return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            if (this.draggedColumnKey !== columnKey) {
                th.classList.add("planner-column-dragover");
            }
        };
        // Drag leave
        th.ondragleave = (e) => {
            if (!this.draggedColumnKey)
                return;
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
            if (!this.draggedColumnKey)
                return;
            e.preventDefault();
            e.stopPropagation();
            th.classList.remove("planner-column-dragover");
            const draggedKey = this.draggedColumnKey;
            const targetKey = columnKey;
            if (draggedKey === targetKey)
                return;
            // Get all reorderable columns
            const allColumns = this.getColumnDefinitions();
            const reorderableColumns = allColumns.filter((c) => c.reorderable);
            // Initialize columnOrder if empty, or sync missing columns
            if (this.columnOrder.length === 0) {
                this.columnOrder = reorderableColumns.map(c => c.key);
            }
            else {
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
            if (draggedIndex === -1 || targetIndex === -1)
                return;
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
    // Persist / load grid-view-specific settings (sort + column widths)
    // ---------------------------------------------------------------------------
    loadGridViewSettings() {
        const settings = this.plugin.settings;
        if (!settings)
            return;
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
            const reorderableKeys = allDefs.filter(c => c.reorderable).map(c => c.key);
            const missing = reorderableKeys.filter(k => !this.columnOrder.includes(k));
            if (missing.length > 0) {
                this.columnOrder.push(...missing);
            }
        }
        // Ensure non-hideable columns stay visible and defaults exist for new columns
        allDefs.forEach((col) => {
            if (!col.hideable || NON_HIDEABLE_COLUMNS.has(col.key)) {
                this.columnVisibility[col.key] = true;
            }
            else if (this.columnVisibility[col.key] === undefined) {
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
    saveGridViewSettings() {
        const settings = this.plugin.settings;
        settings.gridViewColumnWidths = { ...this.columnWidths };
        settings.gridViewSortKey = this.currentFilters.sortKey;
        settings.gridViewSortDirection = this.currentFilters.sortDirection;
        settings.gridViewVisibleColumns = { ...this.columnVisibility };
        settings.gridViewColumnOrder = [...this.columnOrder];
        void this.plugin.saveSettings();
    }
    // ---------------------------------------------------------------------------
    // Tags rendering
    // ---------------------------------------------------------------------------
    renderTaskTags(cell, task) {
        const settings = this.plugin.settings;
        const availableTags = settings.availableTags || [];
        const taskTags = task.tags || [];
        // Make cell clickable to open tag selector
        cell.classList.add("planner-tags-cell-interactive");
        cell.style.cursor = "pointer";
        const tagsContainer = cell.createDiv("planner-tags-badges");
        // Display existing tags with remove buttons
        if (taskTags.length > 0) {
            taskTags.forEach((tagId) => {
                const tag = availableTags.find((t) => t.id === tagId);
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
        }
        else {
            tagsContainer.createEl("span", {
                text: "—",
                cls: "planner-empty-cell"
            });
        }
        // Click on cell to add tags
        cell.onclick = (e) => {
            e.stopPropagation();
            // Find unassigned tags
            const unassignedTags = availableTags.filter((t) => !taskTags.includes(t.id));
            if (unassignedTags.length === 0) {
                return; // All tags already assigned
            }
            // Create menu
            const menu = new obsidian.Menu();
            unassignedTags.forEach((tag) => {
                menu.addItem((item) => {
                    item.setTitle(tag.name);
                    // Add color indicator via menu item DOM
                    const dom = item.dom;
                    const iconEl = dom?.querySelector(".menu-item-icon");
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
            menu.showAtMouseEvent(e);
        };
    }
}
GridView.ROW_BATCH_SIZE = 100;

const VIEW_TYPE_BOARD = "project-planner-board-view";
class BoardView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.unsubscribe = null;
        this.draggedTaskId = null;
        this.draggedBucketId = null;
        this.dropTargetCardId = null;
        this.dropPosition = null;
        this.buckets = [];
        this.completedSectionsCollapsed = {};
        // Filters
        this.currentFilters = {
            priority: "All",
            search: ""
        };
        // Scroll preservation
        this.savedBoardScrollLeft = null;
        this.savedColumnScrollTops = new Map();
        // Render guard: prevents overlapping async renders that corrupt scroll state
        this.isRendering = false;
        this.renderPending = false;
        this.renderVersion = 0; // Monotonic counter — only the latest render restores scroll
        this.plugin = plugin;
        this.taskStore = plugin.taskStore;
    }
    getViewType() {
        return VIEW_TYPE_BOARD;
    }
    getDisplayText() {
        return "Board View";
    }
    getIcon() {
        return "layout-grid";
    }
    async onOpen() {
        await this.taskStore.ensureLoaded();
        this.unsubscribe = this.taskStore.subscribe(() => this.render());
        await this.initializeBuckets();
        this.render();
    }
    async onClose() {
        this.containerEl.empty();
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }
    isParentTask(taskId, allTasks) {
        // A task is a parent if any other task has this task's ID as their parentId
        return allTasks.some(t => t.parentId === taskId);
    }
    filterLeafTasks(tasks) {
        // Only return tasks that are not parents (leaf tasks only)
        const allTasks = this.taskStore.getAll();
        return tasks.filter(t => !this.isParentTask(t.id, allTasks));
    }
    matchesFilters(task) {
        if (this.currentFilters.priority !== "All" && task.priority !== this.currentFilters.priority) {
            return false;
        }
        if (this.currentFilters.search) {
            const search = this.currentFilters.search.toLowerCase();
            if (!task.title.toLowerCase().includes(search)) {
                return false;
            }
        }
        return true;
    }
    async initializeBuckets() {
        const settings = this.plugin.settings;
        const activeProjectId = settings.activeProjectId;
        const projects = settings.projects || [];
        const activeProject = projects.find(p => p.id === activeProjectId);
        // Load buckets from project settings (each project has its own bucket layout)
        if (activeProject && activeProject.buckets && activeProject.buckets.length > 0) {
            this.buckets = [...activeProject.buckets];
        }
        else {
            // Create default buckets if none exist
            this.buckets = [
                { id: crypto.randomUUID(), name: "To Do" },
                { id: crypto.randomUUID(), name: "In Progress" },
                { id: crypto.randomUUID(), name: "Done" }
            ];
            // Save default buckets to project
            if (activeProject) {
                activeProject.buckets = [...this.buckets];
                await this.plugin.saveSettings();
            }
        }
        // Load collapsed state (per-project)
        if (activeProject && activeProject.completedSectionsCollapsed) {
            this.completedSectionsCollapsed = { ...activeProject.completedSectionsCollapsed };
        }
        else {
            // Reset collapsed state for new project
            this.completedSectionsCollapsed = {};
        }
    }
    async render() {
        // Guard: if a render is already in progress, queue one re-render
        // and return. This prevents overlapping async renders from
        // corrupting scroll state and orphaning DOM elements.
        if (this.isRendering) {
            this.renderPending = true;
            return;
        }
        this.isRendering = true;
        this.renderPending = false;
        try {
            await this.renderImpl();
        }
        finally {
            this.isRendering = false;
            // If another render was requested while we were busy, run it now
            if (this.renderPending) {
                this.renderPending = false;
                // Use queueMicrotask so the current stack fully unwinds first
                queueMicrotask(() => this.render());
            }
        }
    }
    async renderImpl() {
        const container = this.containerEl;
        const thisRender = ++this.renderVersion;
        // Save scroll positions before clearing — only if we haven't already
        // captured them (a rapid re-render would read 0 from a freshly-built DOM).
        const existingBoard = container.querySelector('.planner-board-container');
        if (existingBoard && this.savedBoardScrollLeft === null) {
            this.savedBoardScrollLeft = existingBoard.scrollLeft;
            this.savedColumnScrollTops.clear();
            existingBoard.querySelectorAll('.planner-board-column-content').forEach((col) => {
                const bucketId = col.dataset.bucketId;
                if (bucketId) {
                    this.savedColumnScrollTops.set(bucketId, col.scrollTop);
                }
            });
        }
        container.empty();
        const wrapper = container.createDiv("planner-board-wrapper");
        // Shared header
        renderPlannerHeader(wrapper, this.plugin, {
            active: "board",
            onProjectChange: async () => {
                await this.taskStore.load();
                await this.initializeBuckets();
                this.render();
            }
        });
        // Filter toolbar
        const toolbar = wrapper.createDiv("planner-board-toolbar");
        const filters = toolbar.createDiv("planner-board-filters");
        // Priority filter
        const priorityFilterGroup = filters.createDiv("planner-filter-group");
        priorityFilterGroup.createSpan({ cls: "planner-filter-label", text: "Priority:" });
        const priorityFilter = priorityFilterGroup.createEl("select", { cls: "planner-filter-select" });
        ["All", "Low", "Medium", "High", "Critical"].forEach(priority => {
            const option = priorityFilter.createEl("option", { text: priority, value: priority });
            if (priority === this.currentFilters.priority)
                option.selected = true;
        });
        priorityFilter.onchange = () => {
            this.currentFilters.priority = priorityFilter.value;
            this.render();
        };
        // Search filter
        const searchInput = filters.createEl("input", {
            type: "text",
            placeholder: "Search tasks...",
            cls: "planner-filter-search"
        });
        searchInput.value = this.currentFilters.search;
        searchInput.oninput = () => {
            this.currentFilters.search = searchInput.value;
            // Don't call render() here - it would recreate the input and lose focus
            // Instead, we'll debounce or handle this differently
            // For now, just update the filter value
        };
        // Add search on Enter or blur
        searchInput.onkeydown = (e) => {
            if (e.key === "Enter") {
                this.render();
            }
        };
        searchInput.onblur = () => {
            this.render();
        };
        // Clear filter button (X)
        const clearFilterBtn = toolbar.createEl("button", {
            text: "✕",
            cls: "planner-clear-filter"
        });
        clearFilterBtn.style.display = "none"; // Hidden by default
        const updateClearButtonVisibility = () => {
            const hasActiveFilters = this.currentFilters.priority !== "All" ||
                this.currentFilters.search.trim() !== "";
            clearFilterBtn.style.display = hasActiveFilters ? "inline-block" : "none";
        };
        clearFilterBtn.onclick = () => {
            this.currentFilters.priority = "All";
            this.currentFilters.search = "";
            this.render();
        };
        updateClearButtonVisibility();
        // Render board columns
        await this.renderBoard(wrapper);
        // Restore scroll positions after board is rendered.
        // Use double-rAF so the browser has completed layout before we set scroll.
        // Only the LATEST render's callback fires — stale renders are skipped.
        if (this.savedBoardScrollLeft !== null || this.savedColumnScrollTops.size > 0) {
            const scrollLeft = this.savedBoardScrollLeft;
            const columnScrolls = new Map(this.savedColumnScrollTops);
            // Clear saved values so a queued re-render doesn't read stale 0s
            this.savedBoardScrollLeft = null;
            this.savedColumnScrollTops.clear();
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (this.renderVersion !== thisRender)
                        return; // stale render — skip
                    const boardEl = container.querySelector('.planner-board-container');
                    if (boardEl && scrollLeft !== null) {
                        boardEl.scrollLeft = scrollLeft;
                    }
                    if (columnScrolls.size > 0) {
                        boardEl?.querySelectorAll('.planner-board-column-content').forEach((col) => {
                            const bucketId = col.dataset.bucketId;
                            if (bucketId && columnScrolls.has(bucketId)) {
                                col.scrollTop = columnScrolls.get(bucketId);
                            }
                        });
                    }
                });
            });
        }
    }
    // Header is now shared; previous method removed
    async renderBoard(wrapper) {
        const boardContainer = wrapper.createDiv("planner-board-container");
        const allTasks = this.taskStore.getAll();
        // Filter out parent tasks - only show leaf tasks in board view
        let tasks = this.filterLeafTasks(allTasks);
        // Apply user filters
        tasks = tasks.filter(t => this.matchesFilters(t));
        // Render "Unassigned" bucket first for tasks without bucketId
        await this.renderUnassignedBucket(boardContainer, tasks);
        // Render each bucket/column
        for (const bucket of this.buckets) {
            const column = boardContainer.createDiv("planner-board-column");
            column.setAttribute("data-bucket-id", bucket.id);
            // Column header
            const columnHeader = column.createDiv("planner-board-column-header");
            columnHeader.draggable = true;
            columnHeader.setAttribute("data-bucket-id", bucket.id);
            // Track if background is light or dark for button styling
            let isDarkBackground = false;
            // Apply bucket color if set
            if (bucket.color) {
                columnHeader.style.backgroundColor = bucket.color;
                const contrastColor = this.getContrastColor(bucket.color);
                columnHeader.style.color = contrastColor;
                isDarkBackground = contrastColor === "#ffffff";
            }
            // Setup bucket drag events
            this.setupBucketDrag(columnHeader, column, bucket);
            const headerTitle = columnHeader.createDiv("planner-board-column-title");
            // Create editable bucket name (same pattern as grid view task titles)
            this.createEditableBucketName(headerTitle, bucket);
            // 3-dots menu button (hover-visible)
            const bucketMenuBtn = columnHeader.createEl("button", {
                cls: "planner-bucket-menu",
                text: "⋯",
            });
            // Set hover color on the button based on bucket background
            if (bucket.color) {
                bucketMenuBtn.style.setProperty('--hover-color', isDarkBackground ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)');
            }
            bucketMenuBtn.onclick = (evt) => {
                evt.stopPropagation();
                this.showBucketContextMenu(evt, bucket, columnHeader);
            };
            // Context menu for bucket actions (right-click)
            columnHeader.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showBucketContextMenu(e, bucket, columnHeader);
            };
            // Task count - only leaf tasks
            const bucketTasks = tasks.filter((t) => t.bucketId === bucket.id);
            const taskCount = columnHeader.createDiv("planner-board-column-count");
            taskCount.textContent = `${bucketTasks.length}`;
            // Column content (cards container)
            const columnContent = column.createDiv("planner-board-column-content");
            columnContent.setAttribute("data-bucket-id", bucket.id);
            // Enable drop zone
            this.setupDropZone(columnContent, bucket);
            // Add task button at the top (MS Planner style)
            const addTaskBtn = columnContent.createDiv("planner-board-add-card");
            addTaskBtn.textContent = "+ Add task";
            addTaskBtn.onclick = async () => {
                const newTask = await this.taskStore.addTask("New Task");
                await this.taskStore.updateTask(newTask.id, { bucketId: bucket.id });
                // No explicit render() — TaskStore.save() → emit() already re-renders via subscription
            };
            // Separate incomplete and completed tasks
            const incompleteTasks = bucketTasks.filter(t => !t.completed);
            const completedTasks = bucketTasks.filter(t => t.completed);
            // Render incomplete task cards
            for (const task of incompleteTasks) {
                await this.renderCard(columnContent, task);
            }
            // Render completed section if there are completed tasks
            if (completedTasks.length > 0) {
                await this.renderCompletedSection(columnContent, completedTasks, bucket.id);
            }
        }
        // Add "New Bucket" column at the end
        this.renderAddBucketColumn(boardContainer);
    }
    renderAddBucketColumn(boardContainer) {
        const addColumn = boardContainer.createDiv("planner-board-column planner-board-add-bucket");
        const addButton = addColumn.createDiv("planner-board-add-bucket-btn");
        const icon = addButton.createSpan("planner-board-add-bucket-icon");
        icon.textContent = "+";
        const label = addButton.createSpan("planner-board-add-bucket-label");
        label.textContent = "Add new bucket";
        addButton.onclick = async () => {
            const newBucket = {
                id: crypto.randomUUID(),
                name: "New Bucket"
            };
            this.buckets.push(newBucket);
            await this.saveBuckets();
            this.render();
        };
    }
    async renderCard(container, task) {
        const card = container.createDiv("planner-board-card");
        card.setAttribute("data-task-id", task.id);
        card.draggable = true;
        // Drag events
        card.ondragstart = (e) => {
            this.draggedTaskId = task.id;
            card.classList.add("planner-board-card-dragging");
            e.dataTransfer.effectAllowed = "move";
        };
        card.ondragend = () => {
            this.draggedTaskId = null;
            card.classList.remove("planner-board-card-dragging");
            // Clear drop indicators
            document.querySelectorAll(".planner-board-card-drop-before, .planner-board-card-drop-after").forEach(el => {
                el.classList.remove("planner-board-card-drop-before", "planner-board-card-drop-after");
            });
        };
        // Drag over card - determine drop position (before/after)
        card.ondragover = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!this.draggedTaskId || this.draggedTaskId === task.id)
                return;
            const rect = card.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const dropBefore = e.clientY < midpoint;
            // Clear previous indicators
            document.querySelectorAll(".planner-board-card-drop-before, .planner-board-card-drop-after").forEach(el => {
                el.classList.remove("planner-board-card-drop-before", "planner-board-card-drop-after");
            });
            // Add indicator
            if (dropBefore) {
                card.classList.add("planner-board-card-drop-before");
                this.dropPosition = "before";
            }
            else {
                card.classList.add("planner-board-card-drop-after");
                this.dropPosition = "after";
            }
            this.dropTargetCardId = task.id;
        };
        // Drop on card - reorder within bucket or move between buckets
        card.ondrop = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Clear indicators
            document.querySelectorAll(".planner-board-card-drop-before, .planner-board-card-drop-after").forEach(el => {
                el.classList.remove("planner-board-card-drop-before", "planner-board-card-drop-after");
            });
            if (!this.draggedTaskId || !this.dropTargetCardId || this.draggedTaskId === this.dropTargetCardId)
                return;
            const draggedTask = this.taskStore.getAll().find(t => t.id === this.draggedTaskId);
            const targetTask = this.taskStore.getAll().find(t => t.id === this.dropTargetCardId);
            if (!draggedTask || !targetTask)
                return;
            // Update bucket if moving between buckets
            const targetBucketId = targetTask.bucketId || undefined;
            if (draggedTask.bucketId !== targetBucketId) {
                await this.taskStore.updateTask(this.draggedTaskId, { bucketId: targetBucketId });
            }
            // Reorder tasks
            const allTasks = this.taskStore.getAll();
            const taskIds = allTasks.map(t => t.id);
            // Remove dragged task from its current position
            const draggedIndex = taskIds.indexOf(this.draggedTaskId);
            if (draggedIndex !== -1) {
                taskIds.splice(draggedIndex, 1);
            }
            // Find target position and insert
            const targetIndex = taskIds.indexOf(this.dropTargetCardId);
            if (targetIndex !== -1) {
                const insertIndex = this.dropPosition === "before" ? targetIndex : targetIndex + 1;
                taskIds.splice(insertIndex, 0, this.draggedTaskId);
            }
            // Update order
            await this.taskStore.setOrder(taskIds);
            this.dropTargetCardId = null;
            this.dropPosition = null;
        };
        // Click card body to open details
        card.onclick = async (e) => {
            // Only open if not clicking checkbox or menu
            if (e.target.closest('.planner-board-card-checkbox, .planner-board-card-menu')) {
                return;
            }
            await this.plugin.openTaskDetail(task);
        };
        // Priority indicator (icon on the side for High/Critical)
        if (task.priority && (task.priority === "High" || task.priority === "Critical")) {
            const priorityBadge = card.createDiv("planner-board-card-priority");
            if (task.priority === "Critical") {
                priorityBadge.textContent = "🔥";
            }
            else {
                priorityBadge.textContent = "⚡";
            }
        }
        // TAGS AT THE TOP (MS Planner style)
        if (task.tags && task.tags.length > 0) {
            const tagsRow = card.createDiv("planner-board-card-tags-top");
            const settings = this.plugin.settings;
            const availableTags = settings.availableTags || [];
            task.tags.forEach((tagId) => {
                const tag = availableTags.find(t => t.id === tagId);
                if (tag) {
                    const tagBadge = tagsRow.createDiv("planner-board-card-tag");
                    tagBadge.textContent = tag.name;
                    tagBadge.style.backgroundColor = tag.color;
                }
            });
        }
        // Card header with checkbox, title, and menu (aligned on same row)
        const cardHeader = card.createDiv("planner-board-card-header");
        // Checkbox for complete/incomplete toggle
        const checkbox = cardHeader.createEl("input", {
            type: "checkbox",
            cls: "planner-board-card-checkbox",
        });
        checkbox.checked = task.completed;
        checkbox.onclick = async (e) => {
            e.stopPropagation(); // Prevent opening details
            const isDone = !task.completed;
            await this.taskStore.updateTask(task.id, {
                completed: isDone,
                status: isDone ? "Completed" : "Not Started",
            });
            // No explicit render() — TaskStore.save() → emit() already re-renders via subscription
        };
        // Title (inline with checkbox)
        const title = cardHeader.createDiv("planner-board-card-title");
        title.textContent = task.title;
        if (task.completed) {
            title.classList.add("planner-task-completed");
        }
        // Three-dot menu button
        const menuBtn = cardHeader.createEl("button", {
            cls: "planner-board-card-menu",
            text: "⋯",
        });
        menuBtn.onclick = (e) => {
            e.stopPropagation(); // Prevent opening details
            this.showCardMenu(task, e);
        };
        // Card preview content (checklist or description)
        const cardPreview = task.cardPreview || "none";
        if (cardPreview === "checklist" && task.subtasks && task.subtasks.length > 0) {
            const checklistContainer = card.createDiv("planner-board-card-checklist");
            task.subtasks.forEach((subtask) => {
                const itemDiv = checklistContainer.createDiv("planner-board-checklist-item");
                const checkbox = itemDiv.createEl("input", {
                    type: "checkbox",
                    cls: "planner-board-checklist-checkbox"
                });
                checkbox.checked = subtask.completed;
                checkbox.onclick = async (e) => {
                    e.stopPropagation();
                    const updatedSubtasks = task.subtasks.map(s => s.id === subtask.id ? { ...s, completed: !s.completed } : s);
                    await this.taskStore.updateTask(task.id, { subtasks: updatedSubtasks });
                    // No explicit render() — TaskStore.save() → emit() already re-renders via subscription
                };
                const label = itemDiv.createSpan("planner-board-checklist-label");
                label.textContent = subtask.title;
                if (subtask.completed) {
                    label.classList.add("planner-board-checklist-completed");
                }
            });
        }
        else if (cardPreview === "description" && task.description) {
            const descContainer = card.createDiv("planner-board-card-description");
            // Render markdown in description
            await obsidian.MarkdownRenderer.render(this.app, task.description, descContainer, "", this.plugin);
        }
        // Footer with metadata
        const footer = card.createDiv("planner-board-card-footer");
        // Due date
        if (task.dueDate) {
            const dueDate = footer.createDiv("planner-board-card-date");
            // Parse date correctly to avoid timezone issues
            // Date is stored as "YYYY-MM-DD" string
            const parts = task.dueDate.split("-");
            const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            date.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isOverdue = date < today && task.status !== "Completed";
            const isToday = date.toDateString() === today.toDateString();
            if (isOverdue) {
                dueDate.classList.add("planner-board-card-date-overdue");
            }
            else if (isToday) {
                dueDate.classList.add("planner-board-card-date-today");
            }
            // Format date based on user preference
            const dateFormat = this.plugin.settings.dateFormat || "iso";
            let formatted;
            switch (dateFormat) {
                case "iso":
                    formatted = task.dueDate; // YYYY-MM-DD
                    break;
                case "us":
                    formatted = `${parts[1]}/${parts[2]}/${parts[0]}`; // MM/DD/YYYY
                    break;
                case "uk":
                    formatted = `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
                    break;
                default:
                    // Fallback to locale-based short format
                    formatted = date.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                    });
            }
            dueDate.textContent = `📅 ${formatted}`;
        }
        // Subtasks progress
        if (task.subtasks && task.subtasks.length > 0) {
            const subtasksInfo = footer.createDiv("planner-board-card-subtasks");
            const completed = task.subtasks.filter((s) => s.completed).length;
            const total = task.subtasks.length;
            const allDone = completed === total;
            subtasksInfo.textContent = `✓ ${completed}/${total}`;
            if (allDone) {
                subtasksInfo.classList.add("planner-board-card-subtasks-complete");
            }
        }
        // Dependencies indicator
        if (task.dependencies && task.dependencies.length > 0) {
            const depsIcon = footer.createDiv("planner-board-card-icon");
            depsIcon.textContent = "🔗";
            depsIcon.title = `${task.dependencies.length} dependencies`;
        }
        // Links/attachments indicator
        if (task.links && task.links.length > 0) {
            const linksIcon = footer.createDiv("planner-board-card-icon");
            linksIcon.textContent = "📎";
            linksIcon.title = `${task.links.length} links`;
        }
    }
    showCardMenu(task, evt) {
        const menu = new obsidian.Menu();
        menu.addItem((item) => item
            .setTitle("Open details")
            .setIcon("pencil")
            .onClick(() => this.plugin.openTaskDetail(task)));
        menu.addSeparator();
        menu.addItem((item) => item
            .setTitle("Delete task")
            .setIcon("trash")
            .onClick(async () => {
            await this.taskStore.deleteTask(task.id);
            // No explicit render() — TaskStore.save() → emit() already re-renders via subscription
        }));
        menu.showAtMouseEvent(evt);
    }
    async renderCompletedSection(columnContent, completedTasks, bucketId) {
        const isCollapsed = this.completedSectionsCollapsed[bucketId] ?? false;
        // Completed section header
        const completedHeader = columnContent.createDiv("planner-board-completed-header");
        const toggleIcon = completedHeader.createSpan("planner-board-completed-toggle");
        toggleIcon.textContent = isCollapsed ? "▶" : "▼";
        const completedLabel = completedHeader.createSpan("planner-board-completed-label");
        completedLabel.textContent = `Completed (${completedTasks.length})`;
        // Click to toggle
        completedHeader.onclick = async () => {
            this.completedSectionsCollapsed[bucketId] = !isCollapsed;
            await this.saveCompletedSectionsState();
            this.render();
        };
        // Completed tasks container
        if (!isCollapsed) {
            const completedContainer = columnContent.createDiv("planner-board-completed-tasks");
            for (const task of completedTasks) {
                await this.renderCard(completedContainer, task);
            }
        }
    }
    async saveCompletedSectionsState() {
        const settings = this.plugin.settings;
        const activeProjectId = settings.activeProjectId;
        const projects = settings.projects || [];
        const activeProject = projects.find((p) => p.id === activeProjectId);
        if (activeProject) {
            activeProject.completedSectionsCollapsed = { ...this.completedSectionsCollapsed };
            await this.plugin.saveSettings();
        }
    }
    setupDropZone(columnContent, bucket) {
        columnContent.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            columnContent.classList.add("planner-board-column-dragover");
        };
        columnContent.ondragleave = () => {
            columnContent.classList.remove("planner-board-column-dragover");
        };
        columnContent.ondrop = async (e) => {
            e.preventDefault();
            columnContent.classList.remove("planner-board-column-dragover");
            if (!this.draggedTaskId)
                return;
            // Update task bucket
            if (bucket.id === "unassigned") {
                // Remove bucketId to move to unassigned
                await this.taskStore.updateTask(this.draggedTaskId, {
                    bucketId: undefined,
                });
            }
            else {
                await this.taskStore.updateTask(this.draggedTaskId, {
                    bucketId: bucket.id,
                });
            }
            // No explicit render() — TaskStore.save() → emit() already re-renders via subscription
        };
    }
    async renderUnassignedBucket(boardContainer, tasks) {
        // Filter tasks without bucketId (tasks are already filtered to exclude parents)
        const unassignedTasks = tasks.filter((t) => !t.bucketId);
        // Get custom name from settings
        const settings = this.plugin.settings;
        const activeProjectId = settings.activeProjectId;
        const projects = settings.projects || [];
        const activeProject = projects.find((p) => p.id === activeProjectId);
        activeProject?.unassignedBucketName || "📋 Unassigned";
        const column = boardContainer.createDiv("planner-board-column planner-board-column-unassigned");
        column.setAttribute("data-bucket-id", "unassigned");
        // Column header
        const columnHeader = column.createDiv("planner-board-column-header");
        const headerTitle = columnHeader.createDiv("planner-board-column-title");
        // Create editable bucket name (same pattern as grid view task titles)
        this.createEditableUnassignedBucketName(headerTitle);
        // Context menu for rename
        columnHeader.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const menu = new obsidian.Menu();
            menu.addItem((item) => item
                .setTitle("Rename bucket")
                .setIcon("pencil")
                .onClick(() => {
                this.startRenameUnassignedBucket(headerTitle);
            }));
            menu.showAtMouseEvent(e);
        };
        // Task count
        const taskCount = columnHeader.createDiv("planner-board-column-count");
        taskCount.textContent = `${unassignedTasks.length}`;
        // Column content (cards container)
        const columnContent = column.createDiv("planner-board-column-content");
        columnContent.setAttribute("data-bucket-id", "unassigned");
        // Enable drop zone for unassigned bucket (allows moving tasks back)
        const unassignedBucket = { id: "unassigned", name: "Unassigned" };
        this.setupDropZone(columnContent, unassignedBucket);
        // Add task button at the top (MS Planner style)
        const addTaskBtn = columnContent.createDiv("planner-board-add-card");
        addTaskBtn.textContent = "+ Add task";
        addTaskBtn.onclick = async () => {
            await this.taskStore.addTask("New Task");
            // Don't assign bucketId - leave it unassigned
            // No explicit render() — TaskStore.save() → emit() already re-renders via subscription
        };
        // Separate incomplete and completed tasks
        const incompleteTasks = unassignedTasks.filter(t => !t.completed);
        const completedTasks = unassignedTasks.filter(t => t.completed);
        // Render incomplete task cards
        for (const task of incompleteTasks) {
            await this.renderCard(columnContent, task);
        }
        // Render completed section if there are completed tasks
        if (completedTasks.length > 0) {
            await this.renderCompletedSection(columnContent, completedTasks, "unassigned");
        }
    }
    startRenameUnassignedBucket(titleElement) {
        const settings = this.plugin.settings;
        const activeProjectId = settings.activeProjectId;
        const projects = settings.projects || [];
        const activeProject = projects.find((p) => p.id === activeProjectId);
        const originalName = activeProject?.unassignedBucketName || "📋 Unassigned";
        titleElement.contentEditable = "true";
        titleElement.focus();
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(titleElement);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        const finishRename = async () => {
            titleElement.contentEditable = "false";
            const newName = titleElement.textContent?.trim() || originalName;
            if (newName !== originalName && activeProject) {
                activeProject.unassignedBucketName = newName;
                await this.plugin.saveSettings();
            }
            else {
                titleElement.textContent = originalName;
            }
        };
        titleElement.onblur = finishRename;
        titleElement.onkeydown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                titleElement.blur();
            }
            else if (e.key === "Escape") {
                e.preventDefault();
                titleElement.textContent = originalName;
                titleElement.blur();
            }
        };
    }
    startRenameBucket(titleElement, bucket) {
        const originalName = bucket.name;
        titleElement.contentEditable = "true";
        titleElement.focus();
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(titleElement);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        const finishRename = async () => {
            titleElement.contentEditable = "false";
            const newName = titleElement.textContent?.trim() || originalName;
            if (newName && newName !== originalName) {
                bucket.name = newName;
                await this.saveBuckets();
            }
            else {
                titleElement.textContent = originalName;
            }
        };
        titleElement.onblur = finishRename;
        titleElement.onkeydown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                titleElement.blur();
            }
            else if (e.key === "Escape") {
                e.preventDefault();
                titleElement.textContent = originalName;
                titleElement.blur();
            }
        };
    }
    createEditableBucketName(container, bucket) {
        container.empty();
        const span = container.createEl("span", { text: bucket.name });
        span.classList.add("planner-editable");
        const openEditor = (e) => {
            e.stopPropagation();
            span.contentEditable = "true";
            span.classList.add("planner-editing");
            setTimeout(() => {
                span.focus();
                // Place cursor at end of text
                const range = document.createRange();
                range.selectNodeContents(span);
                range.collapse(false); // false = collapse to end
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }, 0);
            const save = async () => {
                const newValue = span.textContent?.trim() || bucket.name;
                span.contentEditable = "false";
                span.classList.remove("planner-editing");
                if (newValue !== bucket.name) {
                    bucket.name = newValue;
                    span.textContent = newValue;
                    await this.saveBuckets();
                }
                else {
                    span.textContent = bucket.name;
                }
            };
            const cancel = () => {
                span.contentEditable = "false";
                span.classList.remove("planner-editing");
                span.textContent = bucket.name;
            };
            span.onblur = () => void save();
            span.onkeydown = (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    span.blur();
                }
                if (e.key === "Escape") {
                    e.preventDefault();
                    cancel();
                }
            };
        };
        span.onclick = openEditor;
    }
    createEditableUnassignedBucketName(container) {
        const settings = this.plugin.settings;
        const activeProjectId = settings.activeProjectId;
        const projects = settings.projects || [];
        const activeProject = projects.find((p) => p.id === activeProjectId);
        let currentName = activeProject?.unassignedBucketName || "📋 Unassigned";
        container.empty();
        const span = container.createEl("span", { text: currentName });
        span.classList.add("planner-editable");
        const openEditor = (e) => {
            e.stopPropagation();
            span.contentEditable = "true";
            span.classList.add("planner-editing");
            setTimeout(() => {
                span.focus();
                // Place cursor at end of text
                const range = document.createRange();
                range.selectNodeContents(span);
                range.collapse(false); // false = collapse to end
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }, 0);
            const save = async () => {
                const newValue = span.textContent?.trim() || currentName;
                span.contentEditable = "false";
                span.classList.remove("planner-editing");
                if (newValue !== currentName && activeProject) {
                    activeProject.unassignedBucketName = newValue;
                    await this.plugin.saveSettings();
                    currentName = newValue;
                    span.textContent = newValue;
                }
                else {
                    span.textContent = currentName;
                }
            };
            const cancel = () => {
                span.contentEditable = "false";
                span.classList.remove("planner-editing");
                span.textContent = currentName;
            };
            span.onblur = () => void save();
            span.onkeydown = (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    span.blur();
                }
                if (e.key === "Escape") {
                    e.preventDefault();
                    cancel();
                }
            };
        };
        span.onclick = openEditor;
    }
    showBucketContextMenu(e, bucket, header) {
        const menu = new obsidian.Menu();
        menu.addItem((item) => item
            .setTitle("Rename bucket")
            .setIcon("pencil")
            .onClick(() => {
            const titleEl = header.querySelector(".planner-board-column-title");
            if (titleEl) {
                this.startRenameBucket(titleEl, bucket);
            }
        }));
        menu.addItem((item) => item
            .setTitle("Change color")
            .setIcon("palette")
            .onClick(() => {
            this.showColorPicker(bucket, header);
        }));
        menu.addItem((item) => item
            .setTitle("Add bucket to right")
            .setIcon("plus")
            .onClick(async () => {
            const newBucket = {
                id: crypto.randomUUID(),
                name: "New Bucket"
            };
            const bucketIndex = this.buckets.indexOf(bucket);
            this.buckets.splice(bucketIndex + 1, 0, newBucket);
            await this.saveBuckets();
            this.render();
        }));
        menu.addSeparator();
        menu.addItem((item) => item
            .setTitle("Delete bucket")
            .setIcon("trash")
            .setWarning(true)
            .onClick(async () => {
            if (this.buckets.length <= 1) {
                return; // Don't delete the last bucket
            }
            // Move tasks to first remaining bucket
            const tasks = this.taskStore.getAll();
            const tasksInBucket = tasks.filter(t => t.bucketId === bucket.id);
            const targetBucket = this.buckets.find(b => b.id !== bucket.id);
            if (targetBucket && tasksInBucket.length > 0) {
                for (const task of tasksInBucket) {
                    await this.taskStore.updateTask(task.id, { bucketId: targetBucket.id });
                }
            }
            this.buckets = this.buckets.filter(b => b.id !== bucket.id);
            await this.saveBuckets();
            this.render();
        }));
        menu.showAtMouseEvent(e);
    }
    showColorPicker(bucket, header) {
        const menu = new obsidian.Menu();
        const colors = [
            { name: "Default", value: "" },
            { name: "Blue", value: "#0078d4" },
            { name: "Teal", value: "#00b7c3" },
            { name: "Green", value: "#107c10" },
            { name: "Yellow", value: "#ffb900" },
            { name: "Orange", value: "#d83b01" },
            { name: "Red", value: "#e81123" },
            { name: "Purple", value: "#5c2d91" },
            { name: "Pink", value: "#e3008c" },
            { name: "Gray", value: "#69797e" }
        ];
        colors.forEach((colorOption) => {
            menu.addItem((item) => {
                const itemEl = item.setTitle(colorOption.name);
                if (colorOption.value) {
                    // Add color preview dot
                    itemEl.setIcon("circle");
                    // Style the icon with the color
                    setTimeout(() => {
                        const dom = item.dom;
                        const iconEl = dom?.querySelector(".menu-item-icon");
                        if (iconEl) {
                            iconEl.style.color = colorOption.value;
                        }
                    }, 0);
                }
                itemEl.onClick(async () => {
                    bucket.color = colorOption.value || undefined;
                    await this.saveBuckets();
                    // Update header immediately
                    if (bucket.color) {
                        header.style.backgroundColor = bucket.color;
                        header.style.color = this.getContrastColor(bucket.color);
                    }
                    else {
                        header.style.backgroundColor = "";
                        header.style.color = "";
                    }
                });
            });
        });
        menu.showAtMouseEvent(new MouseEvent("click", {
            clientX: header.getBoundingClientRect().left,
            clientY: header.getBoundingClientRect().bottom
        }));
    }
    getContrastColor(hexColor) {
        // Remove # if present
        const hex = hexColor.replace("#", "");
        // Convert to RGB
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        // Calculate relative luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        // Return white for dark colors, dark for light colors
        return luminance > 0.5 ? "#000000" : "#ffffff";
    }
    async saveBuckets() {
        const settings = this.plugin.settings;
        const activeProjectId = settings.activeProjectId;
        const projects = settings.projects || [];
        const activeProject = projects.find((p) => p.id === activeProjectId);
        if (activeProject) {
            activeProject.buckets = [...this.buckets];
            await this.plugin.saveSettings();
        }
    }
    setupBucketDrag(header, column, bucket) {
        // Drag start
        header.ondragstart = (e) => {
            this.draggedBucketId = bucket.id;
            column.classList.add("planner-board-column-dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", bucket.id);
        };
        // Drag end
        header.ondragend = () => {
            this.draggedBucketId = null;
            column.classList.remove("planner-board-column-dragging");
            // Remove all dragover states
            document.querySelectorAll(".planner-board-column-dragover-bucket").forEach(el => {
                el.classList.remove("planner-board-column-dragover-bucket");
            });
        };
        // Drag over - allow drop
        column.ondragover = (e) => {
            // Only allow bucket dragging, not task dragging
            if (!this.draggedBucketId || this.draggedTaskId)
                return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            if (this.draggedBucketId !== bucket.id) {
                column.classList.add("planner-board-column-dragover-bucket");
            }
        };
        // Drag leave
        column.ondragleave = (e) => {
            if (!this.draggedBucketId)
                return;
            // Only remove highlight if we're actually leaving the column
            const rect = column.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;
            if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
                column.classList.remove("planner-board-column-dragover-bucket");
            }
        };
        // Drop - reorder buckets
        column.ondrop = async (e) => {
            if (!this.draggedBucketId || this.draggedTaskId)
                return;
            e.preventDefault();
            e.stopPropagation();
            column.classList.remove("planner-board-column-dragover-bucket");
            const draggedId = this.draggedBucketId;
            const targetId = bucket.id;
            if (draggedId === targetId)
                return;
            // Find indices
            const draggedIndex = this.buckets.findIndex(b => b.id === draggedId);
            const targetIndex = this.buckets.findIndex(b => b.id === targetId);
            if (draggedIndex === -1 || targetIndex === -1)
                return;
            // Reorder buckets array
            const [draggedBucket] = this.buckets.splice(draggedIndex, 1);
            const adjustedTarget = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
            this.buckets.splice(adjustedTarget, 0, draggedBucket);
            // Save new order and re-render
            await this.saveBuckets();
            this.render();
        };
    }
    // Public API for task updates
    async updateTask(id, fields) {
        await this.taskStore.updateTask(id, fields);
        // No explicit render() — TaskStore.save() → emit() already re-renders via subscription
    }
}

const VIEW_TYPE_TASK_DETAIL = "project-planner-task-detail";
class TaskDetailView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.task = null;
        this.unsubscribe = null;
        this.savedScrollTop = null;
        this.activeDragCleanup = null;
        this.plugin = plugin;
    }
    getViewType() {
        return VIEW_TYPE_TASK_DETAIL;
    }
    getDisplayText() {
        return "Task Details";
    }
    // ---------------------------------------------------------------------------
    // Canonical task retrieval
    // ---------------------------------------------------------------------------
    getCanonicalTask(id) {
        // Use plugin's taskStore directly - it's the single source of truth
        return this.plugin.taskStore.getAll().find((t) => t.id === id) || null;
    }
    // Called when GridView selects a task
    setTask(task) {
        const canonical = this.getCanonicalTask(task.id);
        this.task = canonical ?? task;
        this.render();
    }
    async onOpen() {
        // Subscribe to taskStore changes to update in real-time
        const taskStore = this.plugin.taskStore;
        await taskStore.ensureLoaded();
        this.unsubscribe = taskStore.subscribe(() => {
            // Re-fetch the current task to get latest data
            if (this.task && this.task.id) {
                const updated = this.getCanonicalTask(this.task.id);
                if (updated) {
                    this.task = updated;
                    this.render();
                }
            }
        });
        this.render();
    }
    async onClose() {
        this.containerEl.empty();
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        // Clean up any in-progress subtask drag listeners / DOM elements
        if (this.activeDragCleanup) {
            this.activeDragCleanup();
            this.activeDragCleanup = null;
        }
    }
    // ---------------------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------------------
    render() {
        const container = this.containerEl;
        // Save scroll position before clearing
        if (this.savedScrollTop === null) {
            this.savedScrollTop = container.scrollTop;
        }
        container.empty();
        container.addClass("planner-detail-wrapper");
        if (!this.task) {
            container.createEl("div", { text: "No task selected." });
            return;
        }
        // Restore scroll position after DOM is rebuilt.
        // Capture into local so a queued re-render can't clobber with stale 0.
        if (this.savedScrollTop !== null) {
            const scrollTop = this.savedScrollTop;
            this.savedScrollTop = null;
            requestAnimationFrame(() => {
                container.scrollTop = scrollTop;
            });
        }
        const task = this.task;
        // Check if this task is a rolled-up parent (has children with roll-up enabled)
        const allTasks = this.plugin.taskStore.getAll();
        const hasChildren = allTasks.some((t) => t.parentId === task.id);
        const isRolledUp = hasChildren && this.plugin.settings?.enableParentRollUp;
        //
        // COMPLETE BUTTON — top action
        //
        const headerContainer = container.createDiv("planner-detail-header");
        const completeBtn = headerContainer.createEl("button", {
            cls: "planner-complete-btn"
        });
        const checkIcon = completeBtn.createSpan({ cls: "planner-btn-icon" });
        obsidian.setIcon(checkIcon, task.status === "Completed" ? "check-circle" : "circle");
        completeBtn.createSpan({
            cls: "planner-btn-text",
            text: task.status === "Completed" ? "Completed" : "Mark as Complete"
        });
        completeBtn.onclick = async () => {
            const newStatus = task.status === "Completed" ? "Not Started" : "Completed";
            await this.update({ status: newStatus });
        };
        if (task.status === "Completed") {
            completeBtn.classList.add("planner-complete-btn-active");
        }
        // COPY LINK button
        const copyLinkBtn = headerContainer.createEl("button", {
            cls: "planner-copy-link-btn"
        });
        const linkIcon = copyLinkBtn.createSpan({ cls: "planner-btn-icon" });
        obsidian.setIcon(linkIcon, "link");
        copyLinkBtn.createSpan({ cls: "planner-btn-text", text: "Copy Link" });
        copyLinkBtn.onclick = async () => {
            const projectId = this.plugin.settings?.activeProjectId || "";
            const uri = `obsidian://open-planner-task?id=${encodeURIComponent(task.id)}&project=${encodeURIComponent(projectId)}`;
            await navigator.clipboard.writeText(uri);
            // Visual feedback
            copyLinkBtn.classList.add("planner-btn-success");
            linkIcon.empty();
            obsidian.setIcon(linkIcon, "check");
            const textSpan = copyLinkBtn.querySelector(".planner-btn-text");
            if (textSpan)
                textSpan.textContent = "Copied!";
            setTimeout(() => {
                copyLinkBtn.classList.remove("planner-btn-success");
                linkIcon.empty();
                obsidian.setIcon(linkIcon, "link");
                if (textSpan)
                    textSpan.textContent = "Copy Link";
            }, 2000);
        };
        // CLOSE PANEL button
        const closeBtn = headerContainer.createEl("button", {
            cls: "planner-close-btn",
            title: "Close Task Details"
        });
        const closeIcon = closeBtn.createSpan({ cls: "planner-btn-icon" });
        obsidian.setIcon(closeIcon, "x");
        closeBtn.onclick = () => {
            try {
                this.leaf?.detach();
            }
            catch (e) {
                console.warn("Task Detail close failed", e);
            }
        };
        //
        // TITLE — editable
        //
        container.createEl("h2", { text: "Task Title" });
        this.createEditableInput(container, task.title, async (val) => {
            await this.update({ title: val });
        });
        //
        // DESCRIPTION (with Markdown support)
        //
        container.createEl("h3", { text: "Description" });
        this.createEditableMarkdown(container, task.description || "", async (val) => {
            await this.update({ description: val });
        });
        //
        // STATUS — dropdown
        //
        container.createEl("h3", { text: "Status" });
        const settings = this.plugin.settings;
        const availableStatuses = settings.availableStatuses || [];
        const statusNames = availableStatuses.map(s => s.name);
        this.createEditableSelect(container, task.status, statusNames, async (val) => {
            await this.update({ status: val });
        });
        //
        // PRIORITY — dropdown
        //
        container.createEl("h3", { text: "Priority" });
        const availablePriorities = settings.availablePriorities || [];
        const priorityNames = availablePriorities.map(p => p.name);
        const defaultPriority = availablePriorities[0]?.name || "Medium";
        this.createEditableSelect(container, task.priority || defaultPriority, priorityNames, async (val) => {
            await this.update({ priority: val });
        });
        //
        // TAGS — multi-select with color badges
        //
        container.createEl("h3", { text: "Tags" });
        this.renderTagSelector(container, task);
        //
        // CHECKLIST / SUBTASKS
        //
        container.createEl("h3", { text: "Checklist" });
        const checklistWrapper = container.createDiv("planner-subtask-list");
        const subtasks = task.subtasks ?? [];
        if (subtasks.length === 0) {
            checklistWrapper.createEl("div", {
                text: "No checklist items. Use the button below to add one.",
                cls: "planner-subtask-empty",
            });
        }
        else {
            for (let i = 0; i < subtasks.length; i++) {
                this.renderSubtaskRow(checklistWrapper, subtasks[i].id, i);
            }
        }
        const addBtn = container.createEl("button", {
            cls: "planner-subtask-add",
            text: "Add checklist item",
        });
        addBtn.onclick = async () => {
            if (!this.task)
                return;
            const current = this.task.subtasks ?? [];
            const newSubtasks = [
                ...current,
                {
                    id: this.createSubtaskId(),
                    title: "New checklist item",
                    completed: false,
                },
            ];
            await this.update({ subtasks: newSubtasks });
        };
        //
        // CARD PREVIEW — what to show on board card
        //
        container.createEl("h3", { text: "Card Preview" });
        const cardPreviewOptions = ["none", "checklist", "description"];
        const cardPreviewLabels = {
            none: "Hide checklist and description",
            checklist: "Show checklist on card",
            description: "Show description on card"
        };
        const cardPreviewContainer = container.createDiv();
        const cardPreviewSelect = cardPreviewContainer.createEl("select", {
            cls: "planner-detail-select"
        });
        cardPreviewOptions.forEach(option => {
            const opt = cardPreviewSelect.createEl("option", {
                value: option,
                text: cardPreviewLabels[option]
            });
            if ((task.cardPreview || "none") === option) {
                opt.selected = true;
            }
        });
        cardPreviewSelect.onchange = async () => {
            await this.update({ cardPreview: cardPreviewSelect.value });
        };
        //
        // BUCKET — dropdown
        //
        container.createEl("h3", { text: "Bucket" });
        const activeProject = settings.projects?.find(p => p.id === settings.activeProjectId);
        const buckets = activeProject?.buckets || [];
        const bucketNames = ["Unassigned", ...buckets.map(b => b.name)];
        const currentBucketId = task.bucketId;
        const currentBucketName = currentBucketId
            ? buckets.find(b => b.id === currentBucketId)?.name || "Unassigned"
            : "Unassigned";
        this.createEditableSelect(container, currentBucketName, bucketNames, async (val) => {
            if (val === "Unassigned") {
                await this.update({ bucketId: undefined });
            }
            else {
                const selectedBucket = buckets.find(b => b.name === val);
                if (selectedBucket) {
                    await this.update({ bucketId: selectedBucket.id });
                }
            }
        });
        //
        // START DATE
        //
        container.createEl("h3", { text: "Start Date" });
        if (isRolledUp) {
            const startReadonly = container.createDiv("planner-date-readonly planner-rolled-up");
            startReadonly.textContent = task.startDate || "—";
            startReadonly.title = "Rolled up from subtasks";
        }
        else {
            this.createEditableDateTime(container, task.startDate, async (val) => {
                await this.update({ startDate: val });
            });
        }
        //
        // DUE DATE
        //
        container.createEl("h3", { text: "Due Date" });
        if (isRolledUp) {
            const dueReadonly = container.createDiv("planner-date-readonly planner-rolled-up");
            dueReadonly.textContent = task.dueDate || "—";
            dueReadonly.title = "Rolled up from subtasks";
        }
        else {
            this.createEditableDateTime(container, task.dueDate, async (val) => {
                await this.update({ dueDate: val });
            });
        }
        //
        // DURATION (auto-calculated from start/due dates)
        //
        this.renderDurationRow(container, task, isRolledUp);
        //
        // % COMPLETE
        //
        container.createEl("h3", { text: "% Complete" });
        this.renderPercentComplete(container, task, isRolledUp);
        //
        // EFFORT
        //
        this.renderEffortSection(container, task, isRolledUp);
        //
        // COST
        //
        this.renderCostSection(container, task, isRolledUp);
        //
        // DEPENDENCIES
        //
        container.createEl("h3", { text: "Dependencies" });
        this.renderDependencies(container, task);
        //
        // LINKS / ATTACHMENTS
        //
        container.createEl("h3", { text: "Links & Attachments" });
        this.renderLinks(container, task);
    }
    // ---------------------------------------------------------------------------
    // Subtasks
    // ---------------------------------------------------------------------------
    renderSubtaskRow(parent, subtaskId, index) {
        if (!this.task)
            return;
        const subtasks = this.task.subtasks ?? [];
        const sub = subtasks.find((s) => s.id === subtaskId);
        if (!sub)
            return;
        const row = parent.createDiv("planner-subtask-row");
        row.dataset.subtaskId = sub.id;
        // Drag handle
        const dragHandle = row.createEl("span", {
            cls: "planner-subtask-drag-handle",
            text: "⋮⋮",
        });
        dragHandle.onpointerdown = (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            const rowRect = row.getBoundingClientRect();
            // Create ghost element
            const ghost = document.createElement("div");
            ghost.className = "planner-subtask-ghost";
            ghost.style.position = "fixed";
            ghost.style.left = `${rowRect.left}px`;
            ghost.style.top = `${rowRect.top}px`;
            ghost.style.width = `${rowRect.width}px`;
            ghost.style.pointerEvents = "none";
            ghost.style.zIndex = "9998";
            ghost.style.opacity = "0.9";
            ghost.style.background = getComputedStyle(row).backgroundColor || "var(--background-primary)";
            ghost.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.25)";
            ghost.style.borderRadius = "6px";
            const inner = row.cloneNode(true);
            ghost.appendChild(inner);
            // Create drop indicator
            const indicator = document.createElement("div");
            indicator.className = "planner-subtask-drop-indicator";
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
            let dragTargetId = null;
            let dragInsertAfter = false;
            row.classList.add("planner-subtask-dragging");
            document.body.style.userSelect = "none";
            document.body.style.webkitUserSelect = "none";
            document.body.style.cursor = "grabbing";
            const offsetY = evt.clientY - rowRect.top;
            const onMove = (moveEvt) => {
                moveEvt.preventDefault();
                const y = moveEvt.clientY - offsetY;
                ghost.style.top = `${y}px`;
                const targetEl = document.elementFromPoint(moveEvt.clientX, moveEvt.clientY);
                const targetRow = targetEl?.closest(".planner-subtask-row");
                if (!targetRow || !targetRow.dataset.subtaskId) {
                    indicator.style.display = "none";
                    dragTargetId = null;
                    return;
                }
                const targetRect = targetRow.getBoundingClientRect();
                const before = moveEvt.clientY < targetRect.top + targetRect.height / 2;
                indicator.style.display = "block";
                indicator.style.left = `${targetRect.left}px`;
                indicator.style.width = `${targetRect.width}px`;
                indicator.style.top = before
                    ? `${targetRect.top}px`
                    : `${targetRect.bottom}px`;
                dragTargetId = targetRow.dataset.subtaskId || null;
                dragInsertAfter = !before;
            };
            const onUp = async (upEvt) => {
                upEvt.preventDefault();
                window.removeEventListener("pointermove", onMove, true);
                window.removeEventListener("pointerup", onUp, true);
                this.activeDragCleanup = null;
                ghost.remove();
                indicator.remove();
                row.classList.remove("planner-subtask-dragging");
                document.body.style.userSelect = "";
                document.body.style.webkitUserSelect = "";
                document.body.style.cursor = "";
                if (dragTargetId && dragTargetId !== sub.id) {
                    await this.handleSubtaskDrop(sub.id, dragTargetId, dragInsertAfter);
                }
            };
            window.addEventListener("pointermove", onMove, true);
            window.addEventListener("pointerup", onUp, true);
            // Store cleanup in case view is closed mid-drag
            this.activeDragCleanup = () => {
                window.removeEventListener("pointermove", onMove, true);
                window.removeEventListener("pointerup", onUp, true);
                ghost.remove();
                indicator.remove();
                row.classList.remove("planner-subtask-dragging");
                document.body.style.userSelect = "";
                document.body.style.webkitUserSelect = "";
                document.body.style.cursor = "";
            };
        };
        // Checkbox
        const checkbox = row.createEl("input", {
            attr: { type: "checkbox" },
        });
        checkbox.checked = !!sub.completed;
        checkbox.onchange = async () => {
            if (!this.task)
                return;
            const updated = (this.task.subtasks ?? []).map((s) => s.id === sub.id ? { ...s, completed: checkbox.checked } : s);
            await this.update({ subtasks: updated });
        };
        // Title (click-to-edit)
        const titleSpan = row.createEl("span", {
            text: sub.title,
            cls: "planner-subtask-title",
        });
        if (sub.completed) {
            titleSpan.classList.add("planner-subtask-completed");
        }
        titleSpan.onclick = () => {
            const input = row.createEl("input", {
                attr: { type: "text" },
                cls: "planner-subtask-input",
            });
            input.value = sub.title;
            titleSpan.replaceWith(input);
            input.focus();
            input.select();
            const commit = async () => {
                if (!this.task)
                    return;
                const newTitle = input.value.trim() || sub.title;
                const updated = (this.task.subtasks ?? []).map((s) => s.id === sub.id ? { ...s, title: newTitle } : s);
                await this.update({ subtasks: updated });
            };
            input.onblur = () => void commit();
            input.onkeydown = (e) => {
                if (e.key === "Enter")
                    void commit();
                if (e.key === "Escape")
                    this.render();
            };
        };
        // Delete button
        const delBtn = row.createEl("button", {
            text: "✕",
            cls: "planner-subtask-delete",
        });
        delBtn.onclick = async () => {
            if (!this.task)
                return;
            const updated = (this.task.subtasks ?? []).filter((s) => s.id !== sub.id);
            await this.update({ subtasks: updated });
        };
    }
    // Handle subtask drag and drop reordering
    async handleSubtaskDrop(dragId, targetId, insertAfter) {
        if (!this.task)
            return;
        // Clone the array to avoid mutating the store's data in-place before
        // the async update() call completes.
        const subtasks = [...(this.task.subtasks ?? [])];
        const dragIndex = subtasks.findIndex((s) => s.id === dragId);
        const targetIndex = subtasks.findIndex((s) => s.id === targetId);
        if (dragIndex === -1 || targetIndex === -1)
            return;
        // Remove from current position
        const [dragItem] = subtasks.splice(dragIndex, 1);
        // Insert at new position
        let newIndex = subtasks.findIndex((s) => s.id === targetId);
        if (insertAfter) {
            newIndex += 1;
        }
        subtasks.splice(newIndex, 0, dragItem);
        await this.update({ subtasks });
    }
    // ---------------------------------------------------------------------------
    // Update Helper – canonical safe
    // ---------------------------------------------------------------------------
    async update(fields) {
        if (!this.task)
            return;
        // Update canonical TaskStore via plugin.updateTask().
        // The taskStore.emit() inside updateTask triggers our subscriber which
        // re-fetches the canonical task and calls render() — no need to do either
        // again here.  Doing so caused a redundant full DOM rebuild on every edit.
        await this.plugin.updateTask(this.task.id, fields);
    }
    // ---------------------------------------------------------------------------
    // Editable Controls
    // ---------------------------------------------------------------------------
    createEditableInput(container, value, onSave) {
        const input = container.createEl("input", {
            attr: { type: "text" },
        });
        input.value = value;
        input.classList.add("planner-detail-input");
        const commit = () => onSave(input.value.trim());
        input.onblur = commit;
        input.onkeydown = (e) => {
            if (e.key === "Enter")
                commit();
        };
    }
    createEditableTextarea(container, value, onSave) {
        const area = container.createEl("textarea", {
            cls: "planner-detail-textarea",
        });
        area.value = value;
        area.onblur = () => {
            void onSave(area.value.trim());
        };
    }
    createEditableMarkdown(container, value, onSave) {
        let isEditing = false;
        const wrapper = container.createDiv("planner-markdown-wrapper");
        const toolbar = wrapper.createDiv("planner-markdown-toolbar");
        const toggleBtn = toolbar.createEl("button", {
            cls: "planner-markdown-toggle",
            text: isEditing ? "Preview" : "Edit",
        });
        const previewContainer = wrapper.createDiv("planner-markdown-preview");
        const editContainer = wrapper.createDiv("planner-markdown-edit");
        // Setup preview
        const renderPreview = async () => {
            previewContainer.empty();
            if (value.trim()) {
                await obsidian.MarkdownRenderer.render(this.app, value, previewContainer, "", this.plugin);
            }
            else {
                previewContainer.createEl("p", {
                    text: "No description",
                    cls: "planner-markdown-empty",
                });
            }
        };
        // Setup editor
        const setupEditor = () => {
            editContainer.empty();
            const textarea = editContainer.createEl("textarea", {
                cls: "planner-markdown-textarea",
            });
            textarea.value = value;
            textarea.focus();
            const saveEdit = async () => {
                const newValue = textarea.value;
                value = newValue;
                await onSave(newValue);
            };
            textarea.onblur = () => {
                void saveEdit();
            };
            textarea.onkeydown = (e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                    void saveEdit();
                }
            };
        };
        // Setup toggle behavior
        toggleBtn.onclick = async () => {
            isEditing = !isEditing;
            toggleBtn.setText(isEditing ? "Preview" : "Edit");
            if (isEditing) {
                previewContainer.style.display = "none";
                editContainer.style.display = "block";
                setupEditor();
            }
            else {
                editContainer.style.display = "none";
                previewContainer.style.display = "block";
                await renderPreview();
            }
        };
        // Initial state: show preview
        editContainer.style.display = "none";
        void renderPreview();
    }
    createEditableSelect(container, value, options, onSave) {
        const select = container.createEl("select", {
            cls: "planner-detail-select",
        });
        for (const opt of options) {
            const optionEl = select.createEl("option", { text: opt });
            if (opt === value)
                optionEl.selected = true;
        }
        select.onchange = () => {
            void onSave(select.value);
        };
    }
    createEditableDateTime(container, value, onSave) {
        const input = container.createEl("input", {
            attr: { type: "date" },
            cls: "planner-detail-date",
        });
        if (value) {
            // Handle both YYYY-MM-DD and ISO format (for backward compatibility)
            const dateStr = value.includes('T') ? value.slice(0, 10) : value;
            input.value = dateStr;
        }
        input.onchange = () => {
            // Store as YYYY-MM-DD format
            void onSave(input.value);
        };
    }
    // ---------------------------------------------------------------------------
    // Dependencies
    // ---------------------------------------------------------------------------
    renderDependencies(container, task) {
        const dependencies = task.dependencies || [];
        const allTasks = this.getAllTasks();
        const depContainer = container.createDiv("planner-dependency-container");
        // Display existing dependencies
        const assignedDepsDiv = depContainer.createDiv("planner-assigned-dependencies");
        if (dependencies.length === 0) {
            assignedDepsDiv.createEl("span", {
                text: "No dependencies",
                cls: "planner-no-dependencies"
            });
        }
        else {
            dependencies.forEach((dep, index) => {
                const predecessor = allTasks.find(t => t.id === dep.predecessorId);
                if (predecessor) {
                    const depRow = assignedDepsDiv.createDiv({
                        cls: "planner-dependency-row"
                    });
                    // Dependency type label
                    const typeLabels = {
                        FS: "Finish-to-Start",
                        SS: "Start-to-Start",
                        FF: "Finish-to-Finish",
                        SF: "Start-to-Finish"
                    };
                    depRow.createEl("span", {
                        cls: "planner-dependency-type",
                        text: typeLabels[dep.type]
                    });
                    // Task title
                    depRow.createEl("span", {
                        cls: "planner-dependency-task",
                        text: predecessor.title
                    });
                    // Remove button
                    const removeBtn = depRow.createEl("span", {
                        cls: "planner-dependency-remove",
                        text: "×"
                    });
                    removeBtn.onclick = async () => {
                        const newDeps = dependencies.filter((_, i) => i !== index);
                        await this.update({ dependencies: newDeps });
                    };
                }
            });
        }
        // Add dependency controls
        const addDepDiv = depContainer.createDiv("planner-add-dependency");
        // Filter out: this task, its children, and tasks already added as dependencies
        const availableTasks = allTasks.filter(t => {
            if (t.id === task.id)
                return false; // Can't depend on itself
            if (t.parentId === task.id)
                return false; // Can't depend on child
            if (dependencies.some(d => d.predecessorId === t.id))
                return false; // Already added
            return true;
        });
        if (availableTasks.length > 0) {
            // Task selector
            const taskSelect = addDepDiv.createEl("select", {
                cls: "planner-dependency-task-select"
            });
            taskSelect.createEl("option", { text: "Select task...", value: "" });
            availableTasks.forEach(t => {
                const indent = t.parentId ? "  └ " : "";
                taskSelect.createEl("option", {
                    text: indent + t.title,
                    value: t.id
                });
            });
            // Dependency type selector
            const typeSelect = addDepDiv.createEl("select", {
                cls: "planner-dependency-type-select"
            });
            typeSelect.createEl("option", { text: "Finish-to-Start", value: "FS" });
            typeSelect.createEl("option", { text: "Start-to-Start", value: "SS" });
            typeSelect.createEl("option", { text: "Finish-to-Finish", value: "FF" });
            typeSelect.createEl("option", { text: "Start-to-Finish", value: "SF" });
            // Add button
            const addBtn = addDepDiv.createEl("button", {
                cls: "planner-dependency-add-btn",
                text: "Add"
            });
            addBtn.onclick = async () => {
                if (taskSelect.value) {
                    const newDep = {
                        predecessorId: taskSelect.value,
                        type: typeSelect.value
                    };
                    // Check for circular dependencies
                    if (this.wouldCreateCircularDependency(task.id, newDep.predecessorId)) {
                        // Show error (simple alert for now)
                        alert("Cannot add dependency: This would create a circular dependency chain.");
                        return;
                    }
                    const newDeps = [...dependencies, newDep];
                    await this.update({ dependencies: newDeps });
                }
            };
        }
        else {
            addDepDiv.createEl("div", {
                text: "No available tasks to add as dependencies.",
                cls: "planner-no-dependencies-hint"
            });
        }
    }
    getAllTasks() {
        // Get tasks directly from the plugin's TaskStore (single source of truth)
        // This works regardless of which view is open (Grid, Timeline, Board, etc.)
        return this.plugin.taskStore.getAll();
    }
    wouldCreateCircularDependency(taskId, predecessorId) {
        const allTasks = this.getAllTasks();
        const visited = new Set();
        // Walk the dependency chain from predecessor
        const checkChain = (currentId) => {
            if (currentId === taskId)
                return true; // Circular!
            if (visited.has(currentId))
                return false;
            visited.add(currentId);
            const current = allTasks.find(t => t.id === currentId);
            if (!current || !current.dependencies)
                return false;
            for (const dep of current.dependencies) {
                if (checkChain(dep.predecessorId))
                    return true;
            }
            return false;
        };
        return checkChain(predecessorId);
    }
    // ---------------------------------------------------------------------------
    // Links / Attachments
    // ---------------------------------------------------------------------------
    renderLinks(container, task) {
        const links = task.links || [];
        const linkContainer = container.createDiv("planner-link-container");
        // Display existing links
        const assignedLinksDiv = linkContainer.createDiv("planner-assigned-links");
        if (links.length === 0) {
            assignedLinksDiv.createEl("span", {
                text: "No links or attachments",
                cls: "planner-no-links"
            });
        }
        else {
            links.forEach((link, index) => {
                const linkRow = assignedLinksDiv.createDiv({
                    cls: "planner-link-row"
                });
                // Link icon based on type
                linkRow.createEl("span", {
                    cls: "planner-link-icon",
                    text: link.type === "obsidian" ? "📝" : "🔗"
                });
                // Link title (clickable)
                const linkEl = linkRow.createEl("a", {
                    cls: "planner-link-title",
                    text: link.title
                });
                if (link.type === "obsidian") {
                    // Obsidian internal link
                    linkEl.onclick = (e) => {
                        e.preventDefault();
                        this.app.workspace.openLinkText(link.url, "", false);
                    };
                }
                else {
                    // External link
                    linkEl.href = link.url;
                    linkEl.setAttribute("target", "_blank");
                    linkEl.setAttribute("rel", "noopener noreferrer");
                }
                // Remove button
                const removeBtn = linkRow.createEl("span", {
                    cls: "planner-link-remove",
                    text: "×"
                });
                removeBtn.onclick = async () => {
                    const newLinks = links.filter((_, i) => i !== index);
                    await this.update({ links: newLinks });
                };
            });
        }
        // Add link controls
        const addLinkDiv = linkContainer.createDiv("planner-add-link");
        // Link title input
        const titleInput = addLinkDiv.createEl("input", {
            cls: "planner-link-title-input",
            attr: {
                type: "text",
                placeholder: "Link title"
            }
        });
        // Link URL input
        const urlInput = addLinkDiv.createEl("input", {
            cls: "planner-link-url-input",
            attr: {
                type: "text",
                placeholder: "URL or [[Obsidian Link]]"
            }
        });
        // Add button
        const addBtn = addLinkDiv.createEl("button", {
            cls: "planner-link-add-btn",
            text: "Add Link"
        });
        addBtn.onclick = async () => {
            const title = titleInput.value.trim();
            const url = urlInput.value.trim();
            if (!title || !url) {
                return;
            }
            // Determine link type
            let linkType = "external";
            let cleanUrl = url;
            // Check if it's an Obsidian internal link ([[Page]] or [[Page|Alias]])
            const obsidianLinkMatch = url.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
            if (obsidianLinkMatch) {
                linkType = "obsidian";
                cleanUrl = obsidianLinkMatch[1]; // Extract the page name
            }
            const newLink = {
                id: this.createLinkId(),
                title,
                url: cleanUrl,
                type: linkType
            };
            const newLinks = [...links, newLink];
            await this.update({ links: newLinks });
            // Clear inputs
            titleInput.value = "";
            urlInput.value = "";
        };
        // Add hint text
        const hintDiv = linkContainer.createDiv("planner-link-hint");
        hintDiv.createEl("small", {
            text: "Tip: Use [[Page Name]] for Obsidian links or http(s):// for external links",
            cls: "planner-link-hint-text"
        });
    }
    createLinkId() {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
            return crypto.randomUUID();
        }
        return `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    // Tags
    // ---------------------------------------------------------------------------
    renderTagSelector(container, task) {
        const settings = this.plugin.settings;
        const availableTags = settings.availableTags || [];
        const taskTags = task.tags || [];
        const tagContainer = container.createDiv("planner-tag-container");
        // Display assigned tags as badges
        const assignedTagsDiv = tagContainer.createDiv("planner-assigned-tags");
        if (taskTags.length === 0) {
            assignedTagsDiv.createEl("span", {
                text: "No tags assigned",
                cls: "planner-no-tags"
            });
        }
        else {
            taskTags.forEach((tagId) => {
                const tag = availableTags.find((t) => t.id === tagId);
                if (tag) {
                    const badge = assignedTagsDiv.createDiv({
                        cls: "planner-tag-badge",
                        text: tag.name
                    });
                    badge.style.backgroundColor = tag.color;
                    // Add remove button
                    const removeBtn = badge.createEl("span", {
                        cls: "planner-tag-remove",
                        text: "×"
                    });
                    removeBtn.onclick = async () => {
                        const newTags = taskTags.filter(id => id !== tagId);
                        await this.update({ tags: newTags });
                    };
                }
            });
        }
        // Add tag dropdown
        if (availableTags.length > 0) {
            const addTagDiv = tagContainer.createDiv("planner-add-tag");
            const select = addTagDiv.createEl("select", {
                cls: "planner-tag-select"
            });
            select.createEl("option", { text: "Add tag...", value: "" });
            availableTags.forEach((tag) => {
                if (!taskTags.includes(tag.id)) {
                    select.createEl("option", { text: tag.name, value: tag.id });
                }
            });
            select.onchange = async () => {
                if (select.value) {
                    const newTags = [...taskTags, select.value];
                    await this.update({ tags: newTags });
                }
            };
        }
        else {
            tagContainer.createEl("div", {
                text: "No tags available. Create tags in plugin settings.",
                cls: "planner-no-tags-hint"
            });
        }
    }
    // Helpers
    // ---------------------------------------------------------------------------
    // ---------------------------------------------------------------------------
    // Duration (auto-calculated read-only)
    // ---------------------------------------------------------------------------
    renderDurationRow(container, task, isRolledUp) {
        const wrapper = container.createDiv("planner-duration-row");
        if (isRolledUp)
            wrapper.classList.add("planner-rolled-up");
        wrapper.createEl("h3", { text: "Duration" });
        const durationValue = wrapper.createDiv("planner-duration-value");
        if (task.startDate && task.dueDate) {
            // Parse as local midnight to match GridView (avoid UTC shift with new Date(string))
            const sp = task.startDate.split("-").map(Number);
            const ep = task.dueDate.split("-").map(Number);
            const start = new Date(sp[0], sp[1] - 1, sp[2]);
            const end = new Date(ep[0], ep[1] - 1, ep[2]);
            const diffMs = end.getTime() - start.getTime();
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            if (diffDays >= 0) {
                durationValue.textContent = diffDays === 1 ? "1 day" : `${diffDays} days`;
            }
            else {
                durationValue.textContent = "Invalid range";
                durationValue.classList.add("planner-duration-invalid");
            }
        }
        else {
            durationValue.textContent = "Set start & due dates";
            durationValue.classList.add("planner-duration-placeholder");
        }
    }
    // ---------------------------------------------------------------------------
    // % Complete
    // ---------------------------------------------------------------------------
    renderPercentComplete(container, task, isRolledUp) {
        const wrapper = container.createDiv("planner-percent-complete-wrapper");
        if (isRolledUp)
            wrapper.classList.add("planner-rolled-up");
        wrapper.createDiv({
            cls: "planner-percent-display",
            text: String(task.percentComplete ?? 0)
        });
        wrapper.createSpan({ text: "%", cls: "planner-percent-suffix" });
        wrapper.createSpan({
            text: isRolledUp ? "(rolled up from subtasks)" : "(calculated from effort)",
            cls: "planner-percent-hint"
        });
        if (isRolledUp)
            wrapper.title = "Rolled up from subtasks";
    }
    // ---------------------------------------------------------------------------
    // Effort section (Completed + Remaining = Total)
    // ---------------------------------------------------------------------------
    renderEffortSection(container, task, isRolledUp) {
        const section = container.createDiv("planner-effort-section");
        const heading = section.createEl("h3", { text: "Effort" });
        if (isRolledUp) {
            heading.createSpan({ text: " (rolled up)", cls: "planner-rolled-up-hint" });
        }
        const grid = section.createDiv("planner-effort-grid");
        const completed = task.effortCompleted ?? 0;
        const remaining = task.effortRemaining ?? 0;
        const total = completed + remaining;
        // Completed
        const completedCol = grid.createDiv("planner-effort-col");
        completedCol.createDiv({ text: "Completed", cls: "planner-effort-label" });
        if (isRolledUp) {
            const readonlyCompleted = completedCol.createDiv({ cls: "planner-effort-readonly planner-rolled-up" });
            readonlyCompleted.textContent = completed > 0 ? String(completed) : "0";
            readonlyCompleted.title = "Rolled up from subtasks";
        }
        else {
            const completedInput = completedCol.createEl("input", {
                attr: { type: "number", min: "0", step: "0.5", placeholder: "0" },
                cls: "planner-effort-input"
            });
            completedInput.value = completed ? String(completed) : "";
            // Event handler — Microsoft Planner style: changing completed auto-adjusts remaining from total
            const commitCompleted = async () => {
                const c = parseFloat(completedInput.value) || 0;
                const tot = (task.effortCompleted ?? 0) + (task.effortRemaining ?? 0);
                const r = Math.max(0, tot - c);
                await this.update({ effortCompleted: c, effortRemaining: r });
            };
            completedInput.onblur = commitCompleted;
            completedInput.onkeydown = (e) => { if (e.key === "Enter")
                void commitCompleted(); };
        }
        // Plus sign
        const plusCol = grid.createDiv("planner-effort-operator");
        plusCol.createSpan({ text: "+" });
        // Remaining
        const remainingCol = grid.createDiv("planner-effort-col");
        remainingCol.createDiv({ text: "Remaining", cls: "planner-effort-label" });
        if (isRolledUp) {
            const readonlyRemaining = remainingCol.createDiv({ cls: "planner-effort-readonly planner-rolled-up" });
            readonlyRemaining.textContent = remaining > 0 ? String(remaining) : "0";
            readonlyRemaining.title = "Rolled up from subtasks";
        }
        else {
            const remainingInput = remainingCol.createEl("input", {
                attr: { type: "number", min: "0", step: "0.5", placeholder: "0" },
                cls: "planner-effort-input"
            });
            remainingInput.value = remaining ? String(remaining) : "";
            // Changing remaining adjusts the total (completed stays fixed)
            const commitRemaining = async () => {
                const r = parseFloat(remainingInput.value) || 0;
                await this.update({ effortRemaining: r });
            };
            remainingInput.onblur = commitRemaining;
            remainingInput.onkeydown = (e) => { if (e.key === "Enter")
                void commitRemaining(); };
        }
        // Equals sign
        const equalsCol = grid.createDiv("planner-effort-operator");
        equalsCol.createSpan({ text: "=" });
        // Total (always read-only)
        const totalCol = grid.createDiv("planner-effort-col");
        totalCol.createDiv({ text: "Total", cls: "planner-effort-label" });
        if (isRolledUp) {
            const readonlyTotal = totalCol.createDiv({ cls: "planner-effort-readonly planner-rolled-up" });
            readonlyTotal.textContent = total > 0 ? String(total) : "0";
            readonlyTotal.title = "Rolled up from subtasks";
        }
        else {
            const totalInput = totalCol.createEl("input", {
                attr: { type: "number", readonly: "true" },
                cls: "planner-effort-input planner-effort-total"
            });
            totalInput.value = total > 0 ? String(total) : "";
        }
        // Unit label
        const unitLabel = grid.createDiv("planner-effort-unit");
        unitLabel.createSpan({ text: "hours" });
    }
    // ---------------------------------------------------------------------------
    // Cost section
    // ---------------------------------------------------------------------------
    renderCostSection(container, task, isRolledUp) {
        const section = container.createDiv("planner-cost-section");
        const heading = section.createEl("h3", { text: "Cost" });
        if (isRolledUp) {
            heading.createSpan({ text: " (rolled up)", cls: "planner-rolled-up-hint" });
        }
        // Resolve project for rate/currency
        const settings = this.plugin.settings;
        const project = settings.projects?.find(p => p.id === settings.activeProjectId);
        const currency = project?.currencySymbol || "$";
        // --- Cost Type selector (fixed vs hourly) ---
        if (!isRolledUp) {
            const typeRow = section.createDiv("planner-cost-type-row");
            typeRow.createSpan({ text: "Cost Type:", cls: "planner-cost-type-label" });
            const typeSelect = typeRow.createEl("select", { cls: "planner-cost-type-select" });
            typeSelect.createEl("option", { text: "None", attr: { value: "" } });
            typeSelect.createEl("option", { text: "Fixed", attr: { value: "fixed" } });
            typeSelect.createEl("option", { text: "Hourly", attr: { value: "hourly" } });
            typeSelect.value = task.costType || "";
            typeSelect.onchange = async () => {
                const val = typeSelect.value;
                if (val === "") {
                    await this.update({ costType: undefined, costEstimate: undefined, costActual: undefined, hourlyRate: undefined });
                }
                else {
                    await this.update({ costType: val });
                }
            };
        }
        const costType = task.costType;
        if (!costType)
            return; // No cost tracking for this task
        // --- Cost values grid ---
        const grid = section.createDiv("planner-cost-grid");
        const estimated = getTaskEstimatedCost(task, project);
        const actual = getTaskActualCost(task, project);
        const variance = estimated - actual;
        // Estimated column
        const estCol = grid.createDiv("planner-cost-col");
        estCol.createDiv({ text: "Estimated", cls: "planner-cost-label" });
        if (isRolledUp || costType === "hourly") {
            const readonlyEst = estCol.createDiv({ cls: "planner-cost-readonly" });
            if (isRolledUp)
                readonlyEst.classList.add("planner-rolled-up");
            readonlyEst.textContent = formatCurrency(estimated, currency);
            if (costType === "hourly")
                readonlyEst.title = "Calculated from effort × rate";
            if (isRolledUp)
                readonlyEst.title = "Rolled up from subtasks";
        }
        else {
            const estInput = estCol.createEl("input", {
                attr: { type: "number", min: "0", step: "0.01", placeholder: "0" },
                cls: "planner-cost-input"
            });
            estInput.value = task.costEstimate ? String(task.costEstimate) : "";
            const commitEst = async () => {
                const val = parseFloat(estInput.value) || 0;
                await this.update({ costEstimate: val });
            };
            estInput.onblur = commitEst;
            estInput.onkeydown = (e) => { if (e.key === "Enter")
                void commitEst(); };
        }
        // Actual column
        const actCol = grid.createDiv("planner-cost-col");
        actCol.createDiv({ text: "Actual", cls: "planner-cost-label" });
        if (isRolledUp || costType === "hourly") {
            const readonlyAct = actCol.createDiv({ cls: "planner-cost-readonly" });
            if (isRolledUp)
                readonlyAct.classList.add("planner-rolled-up");
            readonlyAct.textContent = formatCurrency(actual, currency);
            if (costType === "hourly")
                readonlyAct.title = "Calculated from effort completed × rate";
            if (isRolledUp)
                readonlyAct.title = "Rolled up from subtasks";
        }
        else {
            const actInput = actCol.createEl("input", {
                attr: { type: "number", min: "0", step: "0.01", placeholder: "0" },
                cls: "planner-cost-input"
            });
            actInput.value = task.costActual ? String(task.costActual) : "";
            const commitAct = async () => {
                const val = parseFloat(actInput.value) || 0;
                await this.update({ costActual: val });
            };
            actInput.onblur = commitAct;
            actInput.onkeydown = (e) => { if (e.key === "Enter")
                void commitAct(); };
        }
        // Variance column (always read-only)
        const varCol = grid.createDiv("planner-cost-col");
        varCol.createDiv({ text: "Variance", cls: "planner-cost-label" });
        const varDisplay = varCol.createDiv({ cls: "planner-cost-readonly planner-cost-variance" });
        varDisplay.textContent = formatVariance(variance, currency);
        if (variance < 0)
            varDisplay.classList.add("planner-cost-over-budget");
        else if (variance > 0)
            varDisplay.classList.add("planner-cost-under-budget");
        // --- Hourly rate override (only for hourly type, non-rolled-up) ---
        if (costType === "hourly" && !isRolledUp) {
            const rateRow = section.createDiv("planner-cost-rate-row");
            const defaultRate = project?.defaultHourlyRate ?? 0;
            rateRow.createSpan({ text: "Hourly Rate:", cls: "planner-cost-rate-label" });
            const rateInput = rateRow.createEl("input", {
                attr: { type: "number", min: "0", step: "0.01", placeholder: String(defaultRate) },
                cls: "planner-cost-rate-input"
            });
            rateInput.value = task.hourlyRate != null ? String(task.hourlyRate) : "";
            const rateHint = rateRow.createSpan({ cls: "planner-cost-rate-hint" });
            rateHint.textContent = task.hourlyRate != null
                ? `(overrides project default: ${currency}${defaultRate}/hr)`
                : `(project default: ${currency}${defaultRate}/hr)`;
            const commitRate = async () => {
                const val = rateInput.value.trim();
                if (val === "") {
                    await this.update({ hourlyRate: undefined });
                }
                else {
                    await this.update({ hourlyRate: parseFloat(val) || 0 });
                }
            };
            rateInput.onblur = commitRate;
            rateInput.onkeydown = (e) => { if (e.key === "Enter")
                void commitRate(); };
        }
    }
    createSubtaskId() {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
            return crypto.randomUUID();
        }
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}

const VIEW_TYPE_DEPENDENCY_GRAPH = "project-planner-dependency-graph";
class DependencyGraphView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.canvas = null;
        this.nodes = [];
        this.edges = [];
        this.selectedNode = null;
        this.dragNode = null;
        this.animationFrame = null;
        this.unsubscribe = null;
        this.resizeHandler = null;
        this.needsRefresh = false;
        this.plugin = plugin;
    }
    getViewType() {
        return VIEW_TYPE_DEPENDENCY_GRAPH;
    }
    getDisplayText() {
        return "Dependency Graph";
    }
    getIcon() {
        return "git-fork";
    }
    async onOpen() {
        const container = this.containerEl;
        container.empty();
        container.addClass("planner-graph-wrapper");
        // Render global navigation header (shared)
        renderPlannerHeader(container, this.plugin, {
            active: "graph",
            onProjectChange: async () => {
                await this.plugin.taskStore.load();
                await this.refresh();
            }
        });
        // Graph-specific controls
        const graphControls = container.createDiv("planner-graph-controls-bar");
        const refreshBtn = graphControls.createEl("button", {
            text: "Refresh",
            cls: "planner-graph-btn"
        });
        refreshBtn.onclick = () => this.refresh();
        const resetBtn = graphControls.createEl("button", {
            text: "Reset Layout",
            cls: "planner-graph-btn"
        });
        resetBtn.onclick = () => this.resetLayout();
        // Canvas container
        const canvasContainer = container.createDiv("planner-graph-canvas-container");
        this.canvas = canvasContainer.createEl("canvas", {
            cls: "planner-graph-canvas"
        });
        // Set canvas size
        this.resizeCanvas();
        this.resizeHandler = () => this.resizeCanvas();
        this.registerDomEvent(window, "resize", this.resizeHandler);
        // Setup mouse events
        this.setupMouseEvents();
        // Load and render
        await this.plugin.taskStore.ensureLoaded();
        this.unsubscribe = this.plugin.taskStore.subscribe(() => this.refresh());
        await this.refresh();
    }
    async onClose() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        // registerDomEvent handles resize, mousemove, mouseup cleanup automatically
        this.containerEl.empty();
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }
    // Old custom header removed in favor of shared helper
    resizeCanvas() {
        if (!this.canvas)
            return;
        const container = this.canvas.parentElement;
        if (!container)
            return;
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
        const ctx = this.canvas.getContext("2d");
        if (ctx)
            ctx.scale(dpr, dpr);
        this.render();
    }
    setupMouseEvents() {
        if (!this.canvas)
            return;
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;
        this.canvas.addEventListener("mousedown", (e) => {
            if (!this.canvas)
                return;
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            // Find clicked node
            for (const node of this.nodes) {
                const dx = x - node.x;
                const dy = y - node.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < 30) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.dragNode = node;
                    isDragging = true;
                    offsetX = dx;
                    offsetY = dy;
                    this.selectedNode = node;
                    this.render();
                    return;
                }
            }
            this.selectedNode = null;
            this.render();
        });
        // Bind mousemove/mouseup to document so drag continues outside canvas
        this.registerDomEvent(document, "mousemove", (e) => {
            if (isDragging && this.dragNode && this.canvas) {
                e.preventDefault();
                const rect = this.canvas.getBoundingClientRect();
                this.dragNode.x = e.clientX - rect.left - offsetX;
                this.dragNode.y = e.clientY - rect.top - offsetY;
                this.dragNode.vx = 0;
                this.dragNode.vy = 0;
                this.render();
            }
        });
        this.registerDomEvent(document, "mouseup", (_e) => {
            if (isDragging && this.dragNode) {
                // Zero velocity so the node stays where dropped
                this.dragNode.vx = 0;
                this.dragNode.vy = 0;
            }
            isDragging = false;
            this.dragNode = null;
            // If a refresh was deferred during the drag, run it now
            if (this.needsRefresh) {
                this.refresh();
            }
        });
        // Double click to open task details
        this.canvas.addEventListener("dblclick", (e) => {
            if (!this.selectedNode)
                return;
            this.plugin.openTaskDetail(this.selectedNode.task);
        });
    }
    async refresh() {
        // Don't rebuild graph while user is dragging a node
        if (this.dragNode) {
            this.needsRefresh = true;
            return;
        }
        this.needsRefresh = false;
        const tasks = this.getAllTasks();
        this.buildGraph(tasks);
        this.startSimulation();
    }
    getAllTasks() {
        const store = this.plugin.taskStore;
        if (!store)
            return [];
        return store.getAll();
    }
    buildGraph(tasks) {
        this.nodes = [];
        this.edges = [];
        // Only include tasks that have dependencies or are dependencies
        const tasksWithDeps = tasks.filter(t => {
            const hasDeps = (t.dependencies || []).length > 0;
            const isDep = tasks.some(other => (other.dependencies || []).some(d => d.predecessorId === t.id));
            return hasDeps || isDep;
        });
        if (tasksWithDeps.length === 0) {
            // Show message if no dependencies
            this.nodes = [];
            this.edges = [];
            this.render();
            return;
        }
        // Create nodes
        const width = this.canvas?.width || 800;
        const height = this.canvas?.height || 600;
        tasksWithDeps.forEach((task, index) => {
            const angle = (index / tasksWithDeps.length) * Math.PI * 2;
            const radius = Math.min(width, height) / 3;
            this.nodes.push({
                id: task.id,
                task,
                x: width / 2 + Math.cos(angle) * radius,
                y: height / 2 + Math.sin(angle) * radius,
                vx: 0,
                vy: 0
            });
        });
        // Create edges
        tasksWithDeps.forEach(task => {
            (task.dependencies || []).forEach(dep => {
                this.edges.push({
                    source: dep.predecessorId,
                    target: task.id,
                    type: dep.type
                });
            });
        });
    }
    startSimulation() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        let iterations = 0;
        const maxIterations = 300;
        const animate = () => {
            if (iterations < maxIterations) {
                this.applyForces();
                this.render();
                iterations++;
                this.animationFrame = requestAnimationFrame(animate);
            }
        };
        animate();
    }
    applyForces() {
        const repulsionStrength = 5000;
        const attractionStrength = 0.01;
        const damping = 0.8;
        // Repulsion between all nodes
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const node1 = this.nodes[i];
                const node2 = this.nodes[j];
                const dx = node2.x - node1.x;
                const dy = node2.y - node1.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = repulsionStrength / (distance * distance);
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;
                if (node1 !== this.dragNode) {
                    node1.vx -= fx;
                    node1.vy -= fy;
                }
                if (node2 !== this.dragNode) {
                    node2.vx += fx;
                    node2.vy += fy;
                }
            }
        }
        // Attraction along edges
        this.edges.forEach(edge => {
            const source = this.nodes.find(n => n.id === edge.source);
            const target = this.nodes.find(n => n.id === edge.target);
            if (source && target) {
                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = distance * attractionStrength;
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;
                if (source !== this.dragNode) {
                    source.vx += fx;
                    source.vy += fy;
                }
                if (target !== this.dragNode) {
                    target.vx -= fx;
                    target.vy -= fy;
                }
            }
        });
        // Update positions
        this.nodes.forEach(node => {
            if (node !== this.dragNode) {
                node.x += node.vx;
                node.y += node.vy;
                node.vx *= damping;
                node.vy *= damping;
                // Keep nodes within bounds
                const margin = 50;
                if (this.canvas) {
                    const dpr = window.devicePixelRatio || 1;
                    const logicalW = this.canvas.width / dpr;
                    const logicalH = this.canvas.height / dpr;
                    node.x = Math.max(margin, Math.min(logicalW - margin, node.x));
                    node.y = Math.max(margin, Math.min(logicalH - margin, node.y));
                }
            }
        });
    }
    render() {
        if (!this.canvas)
            return;
        const ctx = this.canvas.getContext("2d");
        if (!ctx)
            return;
        // Clear (use logical dimensions since ctx is already scaled by dpr)
        const dpr = window.devicePixelRatio || 1;
        const logicalW = this.canvas.width / dpr;
        const logicalH = this.canvas.height / dpr;
        ctx.clearRect(0, 0, logicalW, logicalH);
        // Check if empty
        if (this.nodes.length === 0) {
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text-muted");
            ctx.font = "14px var(--font-interface)";
            ctx.textAlign = "center";
            ctx.fillText("No task dependencies to visualize", logicalW / 2, logicalH / 2);
            ctx.fillText("Create dependencies in the Task Details panel", logicalW / 2, logicalH / 2 + 25);
            return;
        }
        // Draw edges
        this.edges.forEach(edge => {
            const source = this.nodes.find(n => n.id === edge.source);
            const target = this.nodes.find(n => n.id === edge.target);
            if (source && target) {
                this.drawEdge(ctx, source, target, edge.type);
            }
        });
        // Draw nodes
        this.nodes.forEach(node => {
            this.drawNode(ctx, node, node === this.selectedNode);
        });
    }
    drawEdge(ctx, source, target, type) {
        // Edge colors by type
        const colors = {
            FS: "#0a84ff", // Finish-to-Start (blue)
            SS: "#2f9e44", // Start-to-Start (green)
            FF: "#ff8c00", // Finish-to-Finish (orange)
            SF: "#d70022" // Start-to-Finish (red)
        };
        ctx.strokeStyle = colors[type] || "#666";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        // Calculate arrow
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const angle = Math.atan2(dy, dx);
        // Shorten line to not overlap nodes
        const startX = source.x + Math.cos(angle) * 30;
        const startY = source.y + Math.sin(angle) * 30;
        const endX = target.x - Math.cos(angle) * 30;
        const endY = target.y - Math.sin(angle) * 30;
        // Draw line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        // Draw arrowhead
        const arrowSize = 10;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - arrowSize * Math.cos(angle - Math.PI / 6), endY - arrowSize * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - arrowSize * Math.cos(angle + Math.PI / 6), endY - arrowSize * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = colors[type] || "#666";
        ctx.fill();
        // Draw type label
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--background-primary");
        ctx.fillRect(midX - 15, midY - 8, 30, 16);
        ctx.fillStyle = colors[type] || "#666";
        ctx.font = "10px var(--font-interface)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(type, midX, midY);
    }
    drawNode(ctx, node, isSelected) {
        const task = node.task;
        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, 30, 0, Math.PI * 2);
        // Status-based colors
        const statusColors = {
            "Not Started": "#6c757d",
            "In Progress": "#0a84ff",
            "Blocked": "#d70022",
            "Completed": "#2f9e44"
        };
        ctx.fillStyle = statusColors[task.status] || "#6c757d";
        ctx.fill();
        if (isSelected) {
            ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--interactive-accent");
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        // Task title
        ctx.fillStyle = "#ffffff";
        ctx.font = "12px var(--font-interface)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const title = task.title.length > 8 ? task.title.substring(0, 8) + "..." : task.title;
        ctx.fillText(title, node.x, node.y);
        // Full title on hover (simplified - just show below node)
        if (isSelected) {
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--background-primary");
            const textWidth = ctx.measureText(task.title).width + 10;
            ctx.fillRect(node.x - textWidth / 2, node.y + 40, textWidth, 20);
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text-normal");
            ctx.fillText(task.title, node.x, node.y + 50);
        }
    }
    resetLayout() {
        const tasks = this.getAllTasks();
        this.buildGraph(tasks);
        this.startSimulation();
    }
}

const VIEW_TYPE_GANTT = "project-planner-gantt-view";
class GanttView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.unsubscribe = null;
        this.dayMs = 24 * 60 * 60 * 1000;
        // Drag and drop state
        this.currentDragId = null;
        this.dragTargetTaskId = null;
        this.dragInsertAfter = false;
        this.activeDragCleanup = null;
        this.activeResizerCleanup = null;
        // Filters
        this.currentFilters = {
            status: "All",
            priority: "All",
            search: ""
        };
        // Zoom level
        this.zoomLevel = "day";
        // Clipboard for Cut/Copy/Paste
        this.clipboardTask = null;
        // Dependency arrows toggle
        this.showDependencyArrows = true;
        // Scroll preservation
        this.savedLeftScrollTop = null;
        this.savedRightScrollTop = null;
        this.savedRightScrollLeft = null;
        // Scroll-to-date target (set by scrollToDate, consumed by render)
        this.scrollTargetDate = null;
        this.plugin = plugin;
        // Load column width from settings
        this.leftColumnWidth = plugin.settings.ganttLeftColumnWidth || 300;
    }
    getViewType() {
        return VIEW_TYPE_GANTT;
    }
    getDisplayText() {
        return "Timeline (Gantt)";
    }
    getIcon() {
        return "calendar";
    }
    async onOpen() {
        await this.plugin.taskStore.ensureLoaded();
        this.unsubscribe = this.plugin.taskStore.subscribe(() => this.render());
        this.render();
    }
    async onClose() {
        this.containerEl.empty();
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        // Clean up any in-progress drag listeners
        if (this.activeDragCleanup) {
            this.activeDragCleanup();
            this.activeDragCleanup = null;
        }
    }
    parseLocalDate(dateStr) {
        const parts = dateStr.split("-").map(Number);
        if (parts.length !== 3 || parts.some(isNaN))
            return null;
        const [y, m, d] = parts;
        const date = new Date(y, m - 1, d);
        date.setHours(0, 0, 0, 0);
        return date;
    }
    getTaskRange(task, todayMs) {
        let start = null;
        let end = null;
        if (task.startDate) {
            const startDate = this.parseLocalDate(task.startDate);
            if (startDate)
                start = startDate.getTime();
        }
        if (task.dueDate) {
            const endDate = this.parseLocalDate(task.dueDate);
            if (endDate)
                end = endDate.getTime();
        }
        if (start === null && end !== null)
            start = end;
        if (end === null && start !== null)
            end = start;
        if (start === null && end === null) {
            start = todayMs;
            end = todayMs + this.dayMs; // one-day default span
        }
        if (end < start) {
            end = start;
        }
        return { start: start, end: end };
    }
    toISODate(ms) {
        const d = new Date(ms);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }
    async updateTaskDates(taskId, startMs, endMs) {
        await this.plugin.taskStore.updateTask(taskId, {
            startDate: this.toISODate(startMs),
            dueDate: this.toISODate(endMs)
        });
    }
    async updateTaskTitle(taskId, title) {
        await this.plugin.taskStore.updateTask(taskId, { title });
    }
    async handleDrop(dragId, targetId, insertAfter) {
        const tasks = this.plugin.taskStore.getAll();
        const dragTask = tasks.find((t) => t.id === dragId);
        const targetTask = tasks.find((t) => t.id === targetId);
        if (!dragTask || !targetTask)
            return;
        if (dragTask.id === targetTask.id)
            return;
        const ids = tasks.map((t) => t.id);
        // Helper to get all descendants recursively
        const getAllDescendants = (taskId) => {
            const descendants = [];
            const children = tasks.filter((t) => t.parentId === taskId);
            for (const child of children) {
                descendants.push(child.id);
                descendants.push(...getAllDescendants(child.id));
            }
            return descendants;
        };
        // Parent drag: move parent + all descendants as a contiguous block
        if (!dragTask.parentId) {
            const blockIds = [dragTask.id, ...getAllDescendants(dragTask.id)];
            // If target is inside the same block, ignore
            if (blockIds.includes(targetTask.id))
                return;
            const targetRootId = targetTask.parentId || targetTask.id;
            // If dropping onto one of own descendants, ignore
            if (blockIds.includes(targetRootId))
                return;
            // Remove block from ids
            const firstIdx = ids.indexOf(blockIds[0]);
            if (firstIdx === -1)
                return;
            ids.splice(firstIdx, blockIds.length);
            // Find target root index in the remaining list
            let targetRootIndex = ids.indexOf(targetRootId);
            if (targetRootIndex === -1) {
                targetRootIndex = ids.length;
            }
            // If inserting after, move index to after the entire target block
            if (insertAfter && targetRootIndex < ids.length) {
                const targetDescendants = getAllDescendants(targetRootId);
                // Find the last descendant position
                let endIndex = targetRootIndex;
                for (const descId of targetDescendants) {
                    const descIndex = ids.indexOf(descId);
                    if (descIndex > endIndex) {
                        endIndex = descIndex;
                    }
                }
                targetRootIndex = endIndex + 1;
            }
            ids.splice(targetRootIndex, 0, ...blockIds);
            await this.plugin.taskStore.setOrder(ids);
            // No explicit render() — TaskStore.save() → emit() already re-renders via subscription
            return;
        }
        // Child drag: move subtask (and its descendants) and update hierarchy if needed
        const blockIds = [dragTask.id, ...getAllDescendants(dragTask.id)];
        // Don't allow dropping onto own descendants
        if (blockIds.includes(targetTask.id))
            return;
        const fromIndex = ids.indexOf(dragId);
        if (fromIndex === -1)
            return;
        ids.splice(fromIndex, blockIds.length);
        let insertIndex = ids.indexOf(targetId);
        if (insertIndex === -1) {
            insertIndex = ids.length;
        }
        else if (insertAfter) {
            insertIndex += 1;
        }
        ids.splice(insertIndex, 0, ...blockIds);
        // Determine new parent based on drop location
        let newParentId = null;
        if (insertIndex > 0) {
            const taskBeforeId = ids[insertIndex - 1];
            const taskBefore = tasks.find((t) => t.id === taskBeforeId);
            if (taskBefore) {
                // If the task before has a parent, use that same parent
                if (taskBefore.parentId) {
                    newParentId = taskBefore.parentId;
                }
                // Otherwise, taskBefore is a root - don't set parent (dragTask becomes root)
            }
        }
        // If insertIndex is 0, dragTask becomes a root task (newParentId stays null)
        // Update the task's parent if it changed
        if (dragTask.parentId !== newParentId) {
            await this.plugin.taskStore.updateTask(dragId, { parentId: newParentId });
        }
        await this.plugin.taskStore.setOrder(ids);
        // No explicit render() — TaskStore.save() → emit() already re-renders via subscription
    }
    matchesFilters(task) {
        if (this.currentFilters.status !== "All" && task.status !== this.currentFilters.status) {
            return false;
        }
        if (this.currentFilters.priority !== "All" && task.priority !== this.currentFilters.priority) {
            return false;
        }
        if (this.currentFilters.search) {
            const search = this.currentFilters.search.toLowerCase();
            if (!task.title.toLowerCase().includes(search)) {
                return false;
            }
        }
        return true;
    }
    showTaskMenu(evt, task) {
        evt.preventDefault();
        const menu = new obsidian.Menu();
        menu.addItem((item) => {
            item.setTitle("Open details");
            item.setIcon("pencil");
            item.onClick(async () => await this.plugin.openTaskDetail(task));
        });
        menu.addSeparator();
        // Cut
        menu.addItem((item) => {
            item.setTitle("Cut");
            item.setIcon("scissors");
            item.onClick(() => {
                this.clipboardTask = { task: { ...task }, isCut: true };
            });
        });
        // Copy
        menu.addItem((item) => {
            item.setTitle("Copy");
            item.setIcon("copy");
            item.onClick(() => {
                this.clipboardTask = { task: { ...task }, isCut: false };
            });
        });
        // Paste
        menu.addItem((item) => {
            item.setTitle("Paste");
            item.setIcon("clipboard");
            item.setDisabled(!this.clipboardTask);
            item.onClick(async () => {
                if (!this.clipboardTask)
                    return;
                const { task: clipTask, isCut } = this.clipboardTask;
                const store = this.plugin.taskStore;
                if (isCut) {
                    // Move the task by updating its parentId
                    await store.updateTask(clipTask.id, {
                        parentId: task.parentId,
                    });
                    this.clipboardTask = null;
                }
                else {
                    // Copy: create a duplicate task
                    const newTask = await store.addTask(clipTask.title);
                    await store.updateTask(newTask.id, {
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
                // No explicit render() — TaskStore.save() → emit() already re-renders via subscription
            });
        });
        menu.addSeparator();
        // Copy link to task
        menu.addItem((item) => {
            item.setTitle("Copy link to task");
            item.setIcon("link");
            item.onClick(async () => {
                const projectId = this.plugin.settings.activeProjectId;
                const uri = `obsidian://open-planner-task?id=${encodeURIComponent(task.id)}&project=${encodeURIComponent(projectId)}`;
                try {
                    await navigator.clipboard.writeText(uri);
                    new obsidian.Notice("Task link copied to clipboard");
                }
                catch (err) {
                    console.error("Failed to copy link:", err);
                    new obsidian.Notice("Failed to copy link");
                }
            });
        });
        // Open Markdown task note
        menu.addItem((item) => {
            item.setTitle("Open Markdown task note");
            item.setIcon("file-text");
            item.setDisabled(!this.plugin.settings.enableMarkdownSync);
            item.onClick(async () => {
                if (!this.plugin.settings.enableMarkdownSync)
                    return;
                const projectId = this.plugin.settings.activeProjectId;
                const project = this.plugin.settings.projects.find((p) => p.id === projectId);
                if (!project)
                    return;
                // Use the same path as TaskSync
                const filePath = this.plugin.taskSync.getTaskFilePath(task, project.name);
                try {
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (file && file instanceof obsidian.TFile) {
                        await this.app.workspace.openLinkText(filePath, "", true);
                    }
                    else {
                        // Note doesn't exist - create it
                        new obsidian.Notice("Creating task note...");
                        await this.plugin.taskSync.syncTaskToMarkdown(task, projectId);
                        // Wait a moment for the file to be created, then open it
                        setTimeout(async () => {
                            await this.app.workspace.openLinkText(filePath, "", true);
                        }, 100);
                    }
                }
                catch (err) {
                    console.error("Failed to open task note:", err);
                    new obsidian.Notice("Failed to open task note");
                }
            });
        });
        menu.addSeparator();
        menu.addItem((item) => {
            item.setTitle("Add new task above");
            item.setIcon("plus");
            item.onClick(async () => {
                const store = this.plugin.taskStore;
                const newTask = await store.addTask("New Task");
                // Insert before current task in manual order
                const allTasks = store.getAll();
                const taskIndex = allTasks.findIndex((t) => t.id === task.id);
                if (taskIndex >= 0) {
                    const reordered = [...allTasks];
                    const newIndex = reordered.findIndex((t) => t.id === newTask.id);
                    if (newIndex >= 0) {
                        const [moved] = reordered.splice(newIndex, 1);
                        reordered.splice(taskIndex, 0, moved);
                        await store.setOrder(reordered.map((t) => t.id));
                    }
                }
                // No explicit render() — TaskStore.save() → emit() already re-renders via subscription
            });
        });
        menu.addItem((item) => {
            item.setTitle("Make subtask");
            item.setIcon("arrow-right");
            item.onClick(async () => {
                const store = this.plugin.taskStore;
                const allTasks = store.getAll();
                const taskIndex = allTasks.findIndex((t) => t.id === task.id);
                if (taskIndex <= 0)
                    return;
                // Find previous task to become parent
                const prevTask = allTasks[taskIndex - 1];
                const parentId = prevTask.parentId || prevTask.id;
                await store.makeSubtask(task.id, parentId);
                // No explicit render() — TaskStore emit() already re-renders via subscription
            });
        });
        menu.addItem((item) => {
            item.setTitle("Promote to parent");
            item.setIcon("arrow-left");
            item.setDisabled(!task.parentId);
            item.onClick(async () => {
                if (!task.parentId)
                    return;
                const store = this.plugin.taskStore;
                await store.promoteSubtask(task.id);
                // No explicit render() — TaskStore emit() already re-renders via subscription
            });
        });
        menu.addSeparator();
        menu.addItem((item) => {
            item.setTitle("Delete task");
            item.setIcon("trash");
            item.onClick(async () => {
                await this.plugin.taskStore.deleteTask(task.id);
                // No explicit render() — TaskStore emit() already re-renders via subscription
            });
        });
        menu.showAtMouseEvent(evt);
    }
    attachBarInteractions(bar, task, startMs, endMs, timelineStart, dayWidth) {
        const isHandle = (el) => el.classList.contains("planner-gantt-handle");
        bar.addEventListener("pointerdown", (e) => {
            if (e.button !== 0)
                return;
            const target = e.target;
            const mode = target.classList.contains("planner-gantt-handle-left")
                ? "resize-left"
                : target.classList.contains("planner-gantt-handle-right")
                    ? "resize-right"
                    : "move";
            e.preventDefault();
            bar.setPointerCapture(e.pointerId);
            const startX = e.clientX;
            const initialStart = startMs;
            const initialEnd = endMs;
            let newStart = startMs;
            let newEnd = endMs;
            let moved = false;
            bar.classList.add("planner-gantt-bar-dragging");
            const updateVisual = () => {
                const leftPx = Math.round(((newStart - timelineStart) / this.dayMs) * dayWidth);
                const widthPx = Math.max(dayWidth, Math.round(((newEnd - newStart) / this.dayMs + 1) * dayWidth) - 4);
                bar.style.left = `${leftPx}px`;
                bar.style.width = `${widthPx}px`;
            };
            const onMove = (evt) => {
                const deltaDays = Math.round((evt.clientX - startX) / dayWidth);
                if (deltaDays === 0)
                    return;
                moved = true;
                if (mode === "move") {
                    newStart = initialStart + deltaDays * this.dayMs;
                    newEnd = initialEnd + deltaDays * this.dayMs;
                }
                else if (mode === "resize-left") {
                    newStart = initialStart + deltaDays * this.dayMs;
                    // Prevent inverting range
                    if (newStart > newEnd - this.dayMs) {
                        newStart = newEnd - this.dayMs;
                    }
                }
                else if (mode === "resize-right") {
                    newEnd = initialEnd + deltaDays * this.dayMs;
                    if (newEnd < newStart + this.dayMs) {
                        newEnd = newStart + this.dayMs;
                    }
                }
                updateVisual();
            };
            const onUp = async (_evt) => {
                bar.classList.remove("planner-gantt-bar-dragging");
                bar.releasePointerCapture(e.pointerId);
                bar.removeEventListener("pointermove", onMove);
                bar.removeEventListener("pointerup", onUp);
                bar.removeEventListener("pointercancel", onUp);
                if (!moved && mode === "move" && !isHandle(target)) {
                    await this.plugin.openTaskDetail(task);
                    return;
                }
                // Commit new dates
                await this.updateTaskDates(task.id, newStart, newEnd);
                // No explicit render() — TaskStore emit() already re-renders via subscription
            };
            bar.addEventListener("pointermove", onMove);
            bar.addEventListener("pointerup", onUp);
            bar.addEventListener("pointercancel", onUp);
        });
    }
    attachInlineTitle(container, task, hasChildren = false) {
        container.style.position = "relative";
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.gap = "6px";
        const titleSpan = container.createSpan({ text: task.title });
        titleSpan.style.flex = "1";
        titleSpan.style.overflow = "hidden";
        titleSpan.style.textOverflow = "ellipsis";
        titleSpan.style.whiteSpace = "nowrap";
        // Bold if this task has children (matching Grid view)
        if (hasChildren) {
            titleSpan.classList.add("planner-parent-bold");
        }
        const startEdit = () => {
            const input = container.createEl("input", {
                type: "text",
                value: task.title,
            });
            input.classList.add("planner-input");
            input.style.marginLeft = "4px";
            input.style.maxWidth = "220px";
            titleSpan.replaceWith(input);
            input.focus();
            input.select();
            const commit = async () => {
                const newTitle = input.value.trim() || task.title;
                await this.updateTaskTitle(task.id, newTitle);
                // No explicit render() — TaskStore emit() already re-renders via subscription
            };
            const cancel = () => {
                this.render();
            };
            input.onkeydown = (ev) => {
                if (ev.key === "Enter") {
                    ev.preventDefault();
                    void commit();
                }
                else if (ev.key === "Escape") {
                    ev.preventDefault();
                    cancel();
                }
            };
            input.onblur = () => void commit();
        };
        // Single click opens detail (Planner-like), double-click edits
        titleSpan.onclick = () => this.plugin.openTaskDetail(task);
        titleSpan.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            startEdit();
        };
        titleSpan.oncontextmenu = (e) => this.showTaskMenu(e, task);
        const menuBtn = container.createEl("button", {
            cls: "planner-task-menu",
            text: "⋯",
        });
        menuBtn.onclick = (e) => {
            e.stopPropagation();
            this.showTaskMenu(e, task);
        };
        menuBtn.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showTaskMenu(e, task);
        };
    }
    showDatePicker(evt, btn) {
        const menu = new obsidian.Menu();
        // Add today option
        menu.addItem((item) => {
            item.setTitle("Go to today")
                .setIcon("calendar-check")
                .onClick(() => {
                this.scrollToDate(new Date());
            });
        });
        menu.addSeparator();
        // Add custom date option
        menu.addItem((item) => {
            item.setTitle("Choose date...")
                .setIcon("calendar")
                .onClick(() => {
                // Create modal for date selection
                const modal = document.createElement("div");
                modal.className = "planner-date-modal";
                // Position modal below the button
                const btnRect = btn.getBoundingClientRect();
                modal.style.position = "fixed";
                modal.style.top = `${btnRect.bottom + 8}px`;
                modal.style.left = `${btnRect.left}px`;
                const input = modal.createEl("input", {
                    type: "date",
                    cls: "planner-date-picker-input"
                });
                const today = new Date();
                input.value = today.toISOString().split('T')[0];
                const btnContainer = modal.createDiv({ cls: "planner-date-modal-buttons" });
                const goBtn = btnContainer.createEl("button", {
                    text: "Go",
                    cls: "mod-cta"
                });
                const cancelBtn = btnContainer.createEl("button", {
                    text: "Cancel"
                });
                goBtn.onclick = () => {
                    if (input.value) {
                        this.scrollToDate(new Date(input.value));
                    }
                    modal.remove();
                };
                cancelBtn.onclick = () => {
                    modal.remove();
                };
                input.onkeydown = (e) => {
                    if (e.key === "Enter") {
                        goBtn.click();
                    }
                    else if (e.key === "Escape") {
                        cancelBtn.click();
                    }
                };
                document.body.appendChild(modal);
                input.focus();
            });
        });
        menu.showAtMouseEvent(evt);
    }
    scrollToDate(targetDate) {
        // Store target date and re-render (the render will handle scrolling)
        this.scrollTargetDate = targetDate;
        this.render();
    }
    startDrag(evt, row, task) {
        const rowRect = row.getBoundingClientRect();
        // Create ghost element
        const ghost = document.createElement("div");
        ghost.className = "planner-gantt-drag-ghost";
        ghost.style.position = "fixed";
        ghost.style.left = `${rowRect.left}px`;
        ghost.style.top = `${rowRect.top}px`;
        ghost.style.width = `${rowRect.width}px`;
        ghost.style.pointerEvents = "none";
        ghost.style.zIndex = "9998";
        ghost.style.opacity = "0.9";
        ghost.style.background = getComputedStyle(row).backgroundColor || "var(--background-primary)";
        ghost.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.25)";
        const inner = row.cloneNode(true);
        inner.classList.remove("planner-gantt-row-dragging");
        ghost.appendChild(inner);
        // Create drop indicator
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
        row.classList.add("planner-gantt-row-dragging");
        document.body.style.userSelect = "none";
        document.body.style.webkitUserSelect = "none";
        document.body.style.cursor = "grabbing";
        const offsetY = evt.clientY - rowRect.top;
        const onMove = (moveEvt) => {
            moveEvt.preventDefault();
            const y = moveEvt.clientY - offsetY;
            ghost.style.top = `${y}px`;
            const targetEl = document.elementFromPoint(moveEvt.clientX, moveEvt.clientY);
            const targetRow = targetEl?.closest(".planner-gantt-row-left");
            if (!targetRow || !targetRow.dataset.taskId) {
                indicator.style.display = "none";
                this.dragTargetTaskId = null;
                return;
            }
            const targetRect = targetRow.getBoundingClientRect();
            const before = moveEvt.clientY < targetRect.top + targetRect.height / 2;
            indicator.style.display = "block";
            indicator.style.left = `${targetRect.left}px`;
            indicator.style.width = `${targetRect.width}px`;
            indicator.style.top = before ? `${targetRect.top}px` : `${targetRect.bottom}px`;
            this.dragTargetTaskId = targetRow.dataset.taskId;
            this.dragInsertAfter = !before;
        };
        const onUp = async (upEvt) => {
            upEvt.preventDefault();
            window.removeEventListener("pointermove", onMove, true);
            window.removeEventListener("pointerup", onUp, true);
            this.activeDragCleanup = null;
            ghost.remove();
            indicator.remove();
            row.classList.remove("planner-gantt-row-dragging");
            document.body.style.userSelect = "";
            document.body.style.webkitUserSelect = "";
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
        // Store cleanup in case view is closed mid-drag
        this.activeDragCleanup = () => {
            window.removeEventListener("pointermove", onMove, true);
            window.removeEventListener("pointerup", onUp, true);
            ghost.remove();
            indicator.remove();
            document.body.style.userSelect = "";
            document.body.style.webkitUserSelect = "";
            document.body.style.cursor = "";
        };
    }
    render() {
        const container = this.containerEl;
        // Save scroll positions before clearing
        const existingLeft = container.querySelector('.planner-gantt-left');
        const existingRightWrap = container.querySelector('.planner-gantt-right-wrap');
        if (existingLeft && this.savedLeftScrollTop === null) {
            this.savedLeftScrollTop = existingLeft.scrollTop;
        }
        if (existingRightWrap && this.savedRightScrollTop === null) {
            this.savedRightScrollTop = existingRightWrap.scrollTop;
            this.savedRightScrollLeft = existingRightWrap.scrollLeft;
        }
        container.empty();
        container.addClass("planner-gantt-wrapper");
        // Shared header
        renderPlannerHeader(container, this.plugin, {
            active: "gantt",
            onProjectChange: async () => {
                await this.plugin.taskStore.load();
                // No explicit render() — TaskStore.load() → emit() already re-renders via subscription
            }
        });
        // Filter and zoom controls
        const toolbar = container.createDiv("planner-gantt-toolbar");
        // Filters
        const filters = toolbar.createDiv("planner-gantt-filters");
        // Status filter
        const statusFilterGroup = filters.createDiv("planner-filter-group");
        statusFilterGroup.createSpan({ cls: "planner-filter-label", text: "Status:" });
        const statusFilter = statusFilterGroup.createEl("select", { cls: "planner-filter-select" });
        ["All", "Not Started", "In Progress", "Blocked", "Completed"].forEach(status => {
            const option = statusFilter.createEl("option", { text: status, value: status });
            if (status === this.currentFilters.status)
                option.selected = true;
        });
        statusFilter.onchange = () => {
            this.currentFilters.status = statusFilter.value;
            this.render();
        };
        // Priority filter
        const priorityFilterGroup = filters.createDiv("planner-filter-group");
        priorityFilterGroup.createSpan({ cls: "planner-filter-label", text: "Priority:" });
        const priorityFilter = priorityFilterGroup.createEl("select", { cls: "planner-filter-select" });
        ["All", "Low", "Medium", "High", "Critical"].forEach(priority => {
            const option = priorityFilter.createEl("option", { text: priority, value: priority });
            if (priority === this.currentFilters.priority)
                option.selected = true;
        });
        priorityFilter.onchange = () => {
            this.currentFilters.priority = priorityFilter.value;
            this.render();
        };
        // Search filter
        const searchInput = filters.createEl("input", {
            type: "text",
            placeholder: "Search tasks...",
            cls: "planner-filter-search"
        });
        searchInput.value = this.currentFilters.search;
        searchInput.oninput = () => {
            this.currentFilters.search = searchInput.value;
            // Don't call render() here - it would recreate the input and lose focus
            // Instead, we'll debounce or handle this differently
            // For now, just update the filter value
        };
        // Add search on Enter or blur
        searchInput.onkeydown = (e) => {
            if (e.key === "Enter") {
                this.render();
            }
        };
        searchInput.onblur = () => {
            this.render();
        };
        // Clear filter button (X)
        const clearFilterBtn = toolbar.createEl("button", {
            text: "✕",
            cls: "planner-clear-filter"
        });
        clearFilterBtn.style.display = "none"; // Hidden by default
        const updateClearButtonVisibility = () => {
            const hasActiveFilters = this.currentFilters.status !== "All" ||
                this.currentFilters.priority !== "All" ||
                this.currentFilters.search.trim() !== "";
            clearFilterBtn.style.display = hasActiveFilters ? "inline-block" : "none";
        };
        clearFilterBtn.onclick = () => {
            this.currentFilters.status = "All";
            this.currentFilters.priority = "All";
            this.currentFilters.search = "";
            this.render();
        };
        updateClearButtonVisibility();
        // Zoom controls
        const zoomControls = toolbar.createDiv("planner-gantt-zoom");
        zoomControls.createSpan({ text: "Zoom: ", cls: "planner-zoom-label" });
        const zoomBtnGroup = zoomControls.createDiv("planner-zoom-buttons");
        ["day", "week", "month"].forEach((level) => {
            const btn = zoomBtnGroup.createEl("button", {
                text: level.charAt(0).toUpperCase() + level.slice(1),
                cls: "planner-zoom-btn"
            });
            if (level === this.zoomLevel)
                btn.classList.add("active");
            btn.onclick = () => {
                this.zoomLevel = level;
                this.render();
            };
        });
        // Go to date button
        const goToDateBtn = toolbar.createEl("button", {
            text: "Go to date",
            cls: "planner-goto-date-btn"
        });
        obsidian.setIcon(goToDateBtn.createSpan({ cls: "planner-goto-date-icon" }), "calendar");
        goToDateBtn.onclick = (e) => {
            this.showDatePicker(e, goToDateBtn);
        };
        // Dependency arrows toggle
        const depArrowBtn = toolbar.createEl("button", {
            cls: `planner-dep-arrow-btn${this.showDependencyArrows ? " active" : ""}`,
        });
        obsidian.setIcon(depArrowBtn, "arrow-right");
        depArrowBtn.setAttribute("title", this.showDependencyArrows ? "Hide dependency arrows" : "Show dependency arrows");
        depArrowBtn.onclick = () => {
            this.showDependencyArrows = !this.showDependencyArrows;
            this.render();
        };
        // Content area
        const content = container.createDiv("planner-gantt-content");
        const allTasks = this.plugin.taskStore.getAll();
        // Build hierarchical task list with filters
        const matchesFilter = new Map();
        for (const t of allTasks) {
            matchesFilter.set(t.id, this.matchesFilters(t));
        }
        // Build visible task hierarchy
        const visibleTasks = [];
        const roots = allTasks.filter((t) => !t.parentId);
        const addTaskAndChildren = (task, depth) => {
            const children = allTasks.filter((t) => t.parentId === task.id);
            const taskMatches = matchesFilter.get(task.id) ?? true;
            const matchingChildren = children.filter((c) => matchesFilter.get(c.id) ?? true);
            const hasChildren = children.length > 0;
            if (!taskMatches && matchingChildren.length === 0)
                return;
            visibleTasks.push({
                task,
                depth,
                hasChildren,
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
        if (visibleTasks.length === 0) {
            content.createEl("div", { text: "No tasks match current filters." });
            return;
        }
        // Determine timeline range from all visible tasks
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const ranges = visibleTasks.map((vt) => this.getTaskRange(vt.task, today.getTime()));
        const dates = [];
        for (const r of ranges) {
            dates.push(r.start, r.end);
        }
        let minTime = dates.length ? Math.min(...dates) : today.getTime();
        let maxTime = dates.length ? Math.max(...dates) : today.getTime() + 30 * this.dayMs;
        // Ensure at least 30 days span
        if (maxTime - minTime < 30 * this.dayMs)
            maxTime = minTime + 30 * this.dayMs;
        // Build scale with zoom-based day width
        const dayMs = this.dayMs;
        let dayWidth = 20; // px per day (default)
        if (this.zoomLevel === "week")
            dayWidth = 8;
        else if (this.zoomLevel === "month")
            dayWidth = 3;
        // Calculate available width for timeline
        const containerWidth = this.containerEl.clientWidth;
        const minTimelineWidth = containerWidth - this.leftColumnWidth - 50;
        // Always add substantial padding for scrollable timeline
        // More padding at higher zoom levels to ensure scrollability
        const paddingMultiplier = this.zoomLevel === "month" ? 90 : this.zoomLevel === "week" ? 60 : 30;
        minTime -= paddingMultiplier * dayMs;
        maxTime += paddingMultiplier * dayMs;
        // Normalize minTime and maxTime to midnight to ensure proper date alignment
        const minDate = new Date(minTime);
        minDate.setHours(0, 0, 0, 0);
        minTime = minDate.getTime();
        const maxDate = new Date(maxTime);
        maxDate.setHours(0, 0, 0, 0);
        maxTime = maxDate.getTime();
        // Calculate total days and timeline width
        let totalDays = Math.floor((maxTime - minTime) / dayMs) + 1;
        let timelineWidth = totalDays * dayWidth;
        // If timeline is still narrower than viewport, extend the date range further
        if (timelineWidth < minTimelineWidth) {
            const additionalDays = Math.ceil((minTimelineWidth - timelineWidth) / dayWidth) + 60; // Extra 60 days for scrolling
            const daysAfter = additionalDays;
            maxTime += daysAfter * dayMs;
            // Recalculate totalDays after extending maxTime
            totalDays = Math.floor((maxTime - minTime) / dayMs) + 1;
            timelineWidth = totalDays * dayWidth;
        }
        const finalTimelineWidth = timelineWidth; // Use actual timeline width, not clamped to minimum
        // Layout containers: left list + right timeline
        const layout = content.createDiv("planner-gantt-layout");
        layout.style.gridTemplateColumns = `${this.leftColumnWidth}px 1fr`;
        const leftCol = layout.createDiv("planner-gantt-left");
        const rightColWrap = layout.createDiv("planner-gantt-right-wrap");
        const rightCol = rightColWrap.createDiv("planner-gantt-right");
        rightCol.style.width = `${finalTimelineWidth}px`;
        // Resizer handle (positioned absolutely between columns)
        const resizer = layout.createDiv("planner-gantt-resizer");
        resizer.style.left = `${this.leftColumnWidth}px`;
        this.attachResizerHandlers(resizer, layout);
        // Synchronize vertical scrolling between left and right columns
        // Use requestAnimationFrame to reset the guard flag, ensuring the
        // reciprocal scroll event fires before the flag clears.
        let isLeftScrolling = false;
        let isRightScrolling = false;
        leftCol.addEventListener('scroll', () => {
            if (!isLeftScrolling) {
                isRightScrolling = true;
                rightColWrap.scrollTop = leftCol.scrollTop;
                requestAnimationFrame(() => { isRightScrolling = false; });
            }
        });
        rightColWrap.addEventListener('scroll', () => {
            if (!isRightScrolling) {
                isLeftScrolling = true;
                leftCol.scrollTop = rightColWrap.scrollTop;
                requestAnimationFrame(() => { isLeftScrolling = false; });
            }
        });
        // Restore scroll positions after sync listeners are set up
        if (this.savedLeftScrollTop !== null || this.savedRightScrollTop !== null) {
            const savedLeft = this.savedLeftScrollTop;
            const savedRightTop = this.savedRightScrollTop;
            const savedRightLeft = this.savedRightScrollLeft;
            this.savedLeftScrollTop = null;
            this.savedRightScrollTop = null;
            this.savedRightScrollLeft = null;
            requestAnimationFrame(() => {
                // Suppress cross-sync during restore
                isLeftScrolling = true;
                isRightScrolling = true;
                if (savedLeft !== null)
                    leftCol.scrollTop = savedLeft;
                if (savedRightTop !== null)
                    rightColWrap.scrollTop = savedRightTop;
                if (savedRightLeft !== null)
                    rightColWrap.scrollLeft = savedRightLeft;
                setTimeout(() => {
                    isLeftScrolling = false;
                    isRightScrolling = false;
                }, 20);
            });
        }
        // Two-tier date scale (like MS Planner)
        const scale = rightCol.createDiv("planner-gantt-scale");
        // Top tier: Months/Years
        const monthRow = scale.createDiv("planner-gantt-scale-months");
        // Bottom tier: Days/Weeks based on zoom
        const dayRow = scale.createDiv("planner-gantt-scale-days");
        // Group days by month and create month headers
        const monthGroups = new Map();
        for (let i = 0; i < totalDays; i++) {
            const date = new Date(minTime + i * dayMs);
            const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
            if (!monthGroups.has(monthKey)) {
                monthGroups.set(monthKey, { start: i, count: 1, date });
            }
            else {
                monthGroups.get(monthKey).count++;
            }
        }
        // Render month headers
        monthGroups.forEach(({ count, date }) => {
            const monthCell = monthRow.createDiv("planner-gantt-month-header");
            monthCell.style.width = `${count * dayWidth}px`;
            const monthText = date.toLocaleString(undefined, { month: 'short', year: 'numeric' });
            monthCell.setText(monthText);
        });
        // Render day/week cells based on zoom level
        for (let i = 0; i < totalDays; i++) {
            const date = new Date(minTime + i * dayMs);
            const dayCell = dayRow.createDiv("planner-gantt-day-cell");
            dayCell.style.width = `${dayWidth}px`;
            if (this.zoomLevel === "day") {
                // Show day number on Mondays or 1st of month
                if (date.getDay() === 1 || date.getDate() === 1) {
                    dayCell.setText(`${date.getDate()}`);
                }
            }
            else if (this.zoomLevel === "week") {
                // Show week start dates (Mondays)
                if (date.getDay() === 1) {
                    dayCell.setText(`${date.getDate()}`);
                    dayCell.classList.add("planner-gantt-week-marker");
                }
            }
            else if (this.zoomLevel === "month") {
                // Show day 1 and 15 for month view
                if (date.getDate() === 1 || date.getDate() === 15) {
                    dayCell.setText(`${date.getDate()}`);
                }
            }
        }
        // Today marker
        const todayTime = today.getTime();
        if (todayTime >= minTime && todayTime <= maxTime) {
            const x = Math.round((todayTime - minTime) / dayMs) * dayWidth;
            const marker = rightCol.createDiv("planner-gantt-today");
            marker.style.left = `${x}px`;
        }
        // Rows: one per visible task (hierarchical)
        const statusColor = (status) => {
            switch (status) {
                case "Completed": return "#2f9e44";
                case "In Progress": return "#0a84ff";
                case "Blocked": return "#d70022";
                case "Not Started":
                default: return "#6c757d";
            }
        };
        visibleTasks.forEach((vt, idx) => {
            const t = vt.task;
            const range = ranges[idx];
            let start = range.start;
            let end = range.end;
            // Left label
            const rowLeft = leftCol.createDiv("planner-gantt-row-left");
            rowLeft.dataset.taskId = t.id;
            if (t.completed)
                rowLeft.classList.add("planner-task-completed");
            // Add indentation based on depth
            const indent = vt.depth * 20;
            rowLeft.style.paddingLeft = `${indent + 8}px`;
            // Collapse/expand toggle for parent tasks
            if (vt.hasChildren) {
                const toggle = rowLeft.createDiv({
                    cls: "planner-expand-toggle"
                });
                obsidian.setIcon(toggle, t.collapsed ? "chevron-right" : "chevron-down");
                toggle.onclick = async (e) => {
                    e.stopPropagation();
                    await this.plugin.taskStore.updateTask(t.id, {
                        collapsed: !t.collapsed
                    });
                };
            }
            else {
                // Add spacing for tasks without children to align with those that have toggle
                rowLeft.createDiv({ cls: "planner-expand-spacer" });
            }
            // Drag handle
            const dragHandle = rowLeft.createDiv({ cls: "planner-drag-handle" });
            obsidian.setIcon(dragHandle, "grip-vertical");
            // Attach drag interactions
            dragHandle.style.cursor = "grab";
            dragHandle.onpointerdown = (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                this.startDrag(evt, rowLeft, t);
            };
            // Checkbox for completed toggle
            const checkbox = rowLeft.createEl("input", {
                type: "checkbox",
            });
            checkbox.checked = t.status === "Completed";
            checkbox.style.marginRight = "8px";
            checkbox.onclick = async (e) => {
                e.stopPropagation();
                const isDone = t.status !== "Completed";
                const newStatus = isDone ? "Completed" : "Not Started";
                await this.plugin.taskStore.updateTask(t.id, { status: newStatus, completed: isDone });
            };
            this.attachInlineTitle(rowLeft, t, vt.hasChildren);
            // Right bar row
            const row = rightCol.createDiv("planner-gantt-row");
            row.style.height = `28px`;
            // Calculate bar position
            const clampedStart = Math.max(start, minTime);
            const clampedEnd = Math.min(end, maxTime);
            // Calculate exact day positions (dates are normalized to midnight)
            const startDays = Math.floor((clampedStart - minTime) / dayMs);
            const endDays = Math.floor((clampedEnd - minTime) / dayMs);
            const spanDays = Math.max(1, endDays - startDays + 1);
            const bar = row.createDiv("planner-gantt-bar");
            bar.dataset.taskId = t.id;
            bar.style.left = `${startDays * dayWidth}px`;
            bar.style.width = `${spanDays * dayWidth - 4}px`;
            bar.style.backgroundColor = statusColor(t.status);
            bar.setAttribute("title", `${t.title}`);
            bar.oncontextmenu = (e) => this.showTaskMenu(e, t);
            // Resize handles
            bar.createDiv({ cls: "planner-gantt-handle planner-gantt-handle-left" });
            bar.createDiv({ cls: "planner-gantt-handle planner-gantt-handle-right" });
            this.attachBarInteractions(bar, t, start, end, minTime, dayWidth);
        });
        // Draw dependency arrows between connected task bars
        if (this.showDependencyArrows) {
            this.renderDependencyArrows(rightCol, visibleTasks, ranges, minTime, dayWidth, finalTimelineWidth);
        }
        // Handle scroll to date if requested
        const scrollTarget = this.scrollTargetDate;
        if (scrollTarget && rightColWrap) {
            this.scrollTargetDate = null;
            // Calculate scroll position
            const targetTime = scrollTarget.getTime();
            if (targetTime >= minTime && targetTime <= maxTime) {
                const daysFromStart = Math.round((targetTime - minTime) / dayMs);
                const scrollLeft = daysFromStart * dayWidth - (rightColWrap.clientWidth / 2);
                // Use setTimeout to ensure DOM is fully rendered
                setTimeout(() => {
                    rightColWrap.scrollLeft = Math.max(0, scrollLeft);
                }, 0);
            }
        }
    }
    // ---------------------------------------------------------------------------
    // Dependency arrow rendering (MS Project / GanttProject style)
    // ---------------------------------------------------------------------------
    renderDependencyArrows(rightCol, visibleTasks, ranges, minTime, dayWidth, timelineWidth) {
        const dayMs = this.dayMs;
        const rowHeight = 28; // must match bar row height
        const scaleHeight = 52; // height of the two-tier date scale (month + day rows)
        const barHalfHeight = 10; // approximate vertical midpoint of bars
        const arrowSize = 5; // arrowhead size
        // Build a map: taskId → row index for quick lookup
        const taskRowMap = new Map();
        visibleTasks.forEach((vt, i) => taskRowMap.set(vt.task.id, i));
        // Build a map: taskId → bar pixel range
        const barPositions = new Map();
        visibleTasks.forEach((vt, i) => {
            const range = ranges[i];
            const startDays = Math.floor((Math.max(range.start, minTime) - minTime) / dayMs);
            const endDays = Math.floor((Math.min(range.end, minTime + (timelineWidth / dayWidth) * dayMs) - minTime) / dayMs);
            const spanDays = Math.max(1, endDays - startDays + 1);
            barPositions.set(vt.task.id, {
                left: startDays * dayWidth,
                right: startDays * dayWidth + spanDays * dayWidth - 4,
                row: i,
            });
        });
        // Create SVG overlay
        const totalHeight = visibleTasks.length * rowHeight + scaleHeight;
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "planner-gantt-dependency-svg");
        svg.setAttribute("width", String(timelineWidth));
        svg.setAttribute("height", String(totalHeight));
        svg.style.position = "absolute";
        svg.style.top = "0";
        svg.style.left = "0";
        svg.style.pointerEvents = "none";
        svg.style.overflow = "visible";
        // Define arrowhead marker
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        marker.setAttribute("id", "dep-arrowhead");
        marker.setAttribute("markerWidth", String(arrowSize * 2));
        marker.setAttribute("markerHeight", String(arrowSize * 2));
        marker.setAttribute("refX", String(arrowSize));
        marker.setAttribute("refY", String(arrowSize));
        marker.setAttribute("orient", "auto");
        marker.setAttribute("markerUnits", "userSpaceOnUse");
        const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrowPath.setAttribute("d", `M 0 0 L ${arrowSize * 2} ${arrowSize} L 0 ${arrowSize * 2} Z`);
        arrowPath.setAttribute("class", "planner-dep-arrow-fill");
        marker.appendChild(arrowPath);
        defs.appendChild(marker);
        svg.appendChild(defs);
        let hasArrows = false;
        // Draw arrows for each dependency
        for (const vt of visibleTasks) {
            const task = vt.task;
            if (!task.dependencies || task.dependencies.length === 0)
                continue;
            const successorPos = barPositions.get(task.id);
            if (!successorPos)
                continue;
            for (const dep of task.dependencies) {
                const predPos = barPositions.get(dep.predecessorId);
                if (!predPos)
                    continue; // predecessor not visible
                // Calculate connection points based on dependency type
                let fromX, fromY, toX, toY;
                const predCenterY = scaleHeight + predPos.row * rowHeight + barHalfHeight;
                const succCenterY = scaleHeight + successorPos.row * rowHeight + barHalfHeight;
                switch (dep.type) {
                    case "FS": // Finish-to-Start: predecessor end → successor start
                        fromX = predPos.right;
                        fromY = predCenterY;
                        toX = successorPos.left;
                        toY = succCenterY;
                        break;
                    case "SS": // Start-to-Start: predecessor start → successor start
                        fromX = predPos.left;
                        fromY = predCenterY;
                        toX = successorPos.left;
                        toY = succCenterY;
                        break;
                    case "FF": // Finish-to-Finish: predecessor end → successor end
                        fromX = predPos.right;
                        fromY = predCenterY;
                        toX = successorPos.right;
                        toY = succCenterY;
                        break;
                    case "SF": // Start-to-Finish: predecessor start → successor end
                        fromX = predPos.left;
                        fromY = predCenterY;
                        toX = successorPos.right;
                        toY = succCenterY;
                        break;
                    default:
                        continue;
                }
                // Draw right-angle connector path (professional Gantt style)
                const path = this.createConnectorPath(fromX, fromY, toX, toY, dep.type, rowHeight);
                const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
                pathEl.setAttribute("d", path);
                pathEl.setAttribute("class", "planner-dep-arrow-line");
                pathEl.setAttribute("marker-end", "url(#dep-arrowhead)");
                svg.appendChild(pathEl);
                hasArrows = true;
            }
        }
        if (hasArrows) {
            rightCol.style.position = "relative";
            rightCol.appendChild(svg);
        }
    }
    /**
     * Create an SVG path string for a right-angle connector between two points.
     * Uses L-shaped routing like MS Project: horizontal → vertical → horizontal.
     */
    createConnectorPath(fromX, fromY, toX, toY, depType, rowHeight) {
        const gap = 8; // horizontal gap out from bar edges
        // For FS/FF (coming from right side of bar) route right then down/up then to target
        // For SS/SF (coming from left side of bar) route left then down/up then to target
        if (depType === "FS") {
            // Connector: right from pred end → down/up → right to succ start
            const midX = fromX + gap;
            if (toX > midX) {
                // Simple case: successor is to the right
                return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
            }
            else {
                // Successor starts before predecessor ends — route around
                const detourY = fromY < toY
                    ? Math.max(fromY, toY) + rowHeight * 0.6
                    : Math.min(fromY, toY) - rowHeight * 0.6;
                return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${detourY} L ${toX - gap} ${detourY} L ${toX - gap} ${toY} L ${toX} ${toY}`;
            }
        }
        if (depType === "SS") {
            // Connector: left from pred start → down/up → right to succ start
            const midX = Math.min(fromX, toX) - gap;
            return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
        }
        if (depType === "FF") {
            // Connector: right from pred end → down/up → left to succ end
            const midX = Math.max(fromX, toX) + gap;
            return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
        }
        if (depType === "SF") {
            // Connector: left from pred start → down/up → left to succ end
            const midX = fromX - gap;
            if (toX < midX) {
                return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
            }
            else {
                const detourY = fromY < toY
                    ? Math.max(fromY, toY) + rowHeight * 0.6
                    : Math.min(fromY, toY) - rowHeight * 0.6;
                return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${detourY} L ${toX + gap} ${detourY} L ${toX + gap} ${toY} L ${toX} ${toY}`;
            }
        }
        // Fallback: straight line
        return `M ${fromX} ${fromY} L ${toX} ${toY}`;
    }
    attachResizerHandlers(resizer, layout) {
        // Clean up listeners from previous render to prevent accumulation
        if (this.activeResizerCleanup) {
            this.activeResizerCleanup();
            this.activeResizerCleanup = null;
        }
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        const onMouseDown = (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = this.leftColumnWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        };
        const onMouseMove = (e) => {
            if (!isResizing)
                return;
            const delta = e.clientX - startX;
            const newWidth = Math.max(200, Math.min(600, startWidth + delta)); // Min 200px, max 600px
            this.leftColumnWidth = newWidth;
            layout.style.gridTemplateColumns = `${newWidth}px 1fr`;
            resizer.style.left = `${newWidth}px`;
        };
        const onMouseUp = async () => {
            if (!isResizing)
                return;
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Save to plugin settings
            this.plugin.settings.ganttLeftColumnWidth = this.leftColumnWidth;
            await this.plugin.saveSettings();
        };
        resizer.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        // Store cleanup so it can be called on next render or view close
        const cleanup = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        this.activeResizerCleanup = cleanup;
        this.register(() => cleanup());
    }
}

const VIEW_TYPE_DASHBOARD = "project-planner-dashboard-view";
class DashboardView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.unsubscribe = null;
        this.showAllProjects = false;
        this.savedScrollTop = null;
        this.activeModal = null;
        this.activeOverlay = null;
        this.renderVersion = 0;
        this.plugin = plugin;
    }
    getViewType() {
        return VIEW_TYPE_DASHBOARD;
    }
    getDisplayText() {
        return "Dashboard";
    }
    getIcon() {
        return "layout-dashboard";
    }
    async onOpen() {
        await this.plugin.taskStore.ensureLoaded();
        this.unsubscribe = this.plugin.taskStore.subscribe(() => this.render());
        this.render();
    }
    async onClose() {
        this.dismissModal();
        this.containerEl.empty();
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }
    /** Remove modal + overlay from document.body if present. */
    dismissModal() {
        if (this.activeModal && this.activeModal.parentNode) {
            this.activeModal.parentNode.removeChild(this.activeModal);
        }
        if (this.activeOverlay && this.activeOverlay.parentNode) {
            this.activeOverlay.parentNode.removeChild(this.activeOverlay);
        }
        this.activeModal = null;
        this.activeOverlay = null;
    }
    calculateProjectStats(projectId, projectName, tasks) {
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => t.status === "Completed").length;
        const inProgressTasks = tasks.filter(t => t.status === "In Progress").length;
        const blockedTasks = tasks.filter(t => t.status === "Blocked").length;
        const notStartedTasks = tasks.filter(t => t.status === "Not Started").length;
        const highPriorityTasks = tasks.filter(t => t.priority === "High" && t.status !== "Completed").length;
        const criticalPriorityTasks = tasks.filter(t => t.priority === "Critical" && t.status !== "Completed").length;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const today = now.getTime();
        const weekFromNow = today + 7 * 24 * 60 * 60 * 1000;
        const overdueTasks = tasks.filter(t => {
            if (!t.dueDate || t.status === "Completed")
                return false;
            const dueDate = new Date(t.dueDate).getTime();
            return dueDate < today;
        }).length;
        const dueTodayTasks = tasks.filter(t => {
            if (!t.dueDate || t.status === "Completed")
                return false;
            const dueDate = new Date(t.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate.getTime() === today;
        }).length;
        const dueThisWeekTasks = tasks.filter(t => {
            if (!t.dueDate || t.status === "Completed")
                return false;
            const dueDate = new Date(t.dueDate).getTime();
            return dueDate >= today && dueDate <= weekFromNow;
        }).length;
        const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        const tasksWithDependencies = tasks.filter(t => t.dependencies && t.dependencies.length > 0).length;
        // Effort metrics — exclude parent tasks to avoid double-counting rolled-up values
        const parentIds = new Set(tasks.filter(t => t.parentId).map(t => t.parentId));
        const leafTasks = tasks.filter(t => !parentIds.has(t.id));
        const totalEffortCompleted = leafTasks.reduce((sum, t) => sum + (t.effortCompleted ?? 0), 0);
        const totalEffortRemaining = leafTasks.reduce((sum, t) => sum + (t.effortRemaining ?? 0), 0);
        const totalEffort = totalEffortCompleted + totalEffortRemaining;
        const averagePercentComplete = leafTasks.length > 0
            ? Math.round(leafTasks.reduce((sum, t) => sum + (t.percentComplete ?? 0), 0) / leafTasks.length)
            : 0;
        // Cost metrics
        const project = this.plugin.settings.projects?.find(p => p.id === projectId);
        const costSummary = getProjectCostSummary(tasks, project);
        return {
            projectId,
            projectName,
            totalTasks,
            completedTasks,
            inProgressTasks,
            blockedTasks,
            notStartedTasks,
            highPriorityTasks,
            criticalPriorityTasks,
            overdueTasks,
            dueTodayTasks,
            dueThisWeekTasks,
            completionPercentage,
            tasksWithDependencies,
            totalEffortCompleted,
            totalEffortRemaining,
            totalEffort,
            averagePercentComplete,
            budgetTotal: costSummary.budgetTotal,
            totalEstimatedCost: costSummary.totalEstimated,
            totalActualCost: costSummary.totalActual,
            budgetRemaining: costSummary.budgetRemaining,
            budgetUsedPercent: costSummary.budgetUsedPercent,
            overBudgetTaskCount: costSummary.overBudgetTasks.length,
        };
    }
    renderKPICard(container, title, value, icon, color, onClick) {
        const card = container.createDiv("dashboard-kpi-card");
        if (color)
            card.style.borderLeftColor = color;
        // Make card clickable if onClick is provided
        if (onClick) {
            card.style.cursor = "pointer";
            card.addClass("dashboard-kpi-card-clickable");
            card.onclick = onClick;
        }
        const iconEl = card.createDiv("dashboard-kpi-icon");
        obsidian.setIcon(iconEl, icon);
        if (color)
            iconEl.style.color = color;
        const content = card.createDiv("dashboard-kpi-content");
        content.createDiv({ text: title, cls: "dashboard-kpi-title" });
        content.createDiv({ text: String(value), cls: "dashboard-kpi-value" });
    }
    renderProgressBar(container, percentage) {
        const barContainer = container.createDiv("dashboard-progress-container");
        const bar = barContainer.createDiv("dashboard-progress-bar");
        const fill = bar.createDiv("dashboard-progress-fill");
        fill.style.width = `${percentage}%`;
        if (percentage < 30)
            fill.style.backgroundColor = "#d70022";
        else if (percentage < 70)
            fill.style.backgroundColor = "#f59e0b";
        else
            fill.style.backgroundColor = "#2f9e44";
        const label = barContainer.createDiv("dashboard-progress-label");
        label.textContent = `${percentage}%`;
    }
    showTaskListModal(title, tasks) {
        // Dismiss any existing modal first
        this.dismissModal();
        const modal = document.createElement("div");
        modal.className = "dashboard-task-modal";
        const overlay = document.createElement("div");
        overlay.className = "dashboard-task-modal-overlay";
        overlay.onclick = () => this.dismissModal();
        // Track so we can clean up on view close
        this.activeModal = modal;
        this.activeOverlay = overlay;
        // Escape key dismisses the modal
        const onKeyDown = (e) => {
            if (e.key === "Escape") {
                this.dismissModal();
                document.removeEventListener("keydown", onKeyDown);
            }
        };
        document.addEventListener("keydown", onKeyDown);
        const content = modal.createDiv("dashboard-task-modal-content");
        // Header
        const header = content.createDiv("dashboard-task-modal-header");
        header.createEl("h3", { text: title });
        const closeBtn = header.createEl("button", {
            cls: "dashboard-task-modal-close"
        });
        const closeIcon = closeBtn.createSpan({ cls: "dashboard-task-modal-close-icon" });
        obsidian.setIcon(closeIcon, "x");
        closeBtn.onclick = () => this.dismissModal();
        // Task list
        const taskList = content.createDiv("dashboard-task-modal-list");
        if (tasks.length === 0) {
            taskList.createDiv({ text: "No tasks found", cls: "dashboard-task-modal-empty" });
        }
        else {
            tasks.forEach(task => {
                const taskItem = taskList.createDiv("dashboard-task-modal-item");
                // Checkbox
                const checkbox = taskItem.createEl("input", {
                    type: "checkbox",
                    cls: "dashboard-task-modal-checkbox"
                });
                checkbox.checked = task.completed;
                checkbox.onclick = async (e) => {
                    e.stopPropagation();
                    const isDone = checkbox.checked;
                    await this.plugin.taskStore.updateTask(task.id, {
                        completed: isDone,
                        status: isDone ? "Completed" : "Not Started"
                    });
                    // Update UI
                    task.completed = isDone;
                    task.status = isDone ? "Completed" : "Not Started";
                    if (isDone) {
                        titleEl.addClass("dashboard-task-modal-completed");
                    }
                    else {
                        titleEl.removeClass("dashboard-task-modal-completed");
                    }
                    statusBadge.textContent = task.status;
                    statusBadge.style.background = this.getStatusColor(task.status);
                };
                // Task title
                const titleEl = taskItem.createDiv({
                    text: task.title,
                    cls: "dashboard-task-modal-title"
                });
                if (task.completed) {
                    titleEl.addClass("dashboard-task-modal-completed");
                }
                // Task metadata
                const meta = taskItem.createDiv("dashboard-task-modal-meta");
                // Status badge (using same style as Grid/Board views)
                const statusBadge = meta.createSpan({
                    text: task.status,
                    cls: "status-pill"
                });
                statusBadge.style.backgroundColor = this.getStatusColor(task.status);
                if (task.priority) {
                    const priorityPill = meta.createSpan({
                        text: task.priority,
                        cls: "priority-pill"
                    });
                    priorityPill.style.backgroundColor = this.getPriorityColor(task.priority);
                }
                if (task.dueDate) {
                    meta.createSpan({
                        text: `Due: ${task.dueDate}`,
                        cls: "dashboard-task-modal-due"
                    });
                }
                // Click to open task detail
                taskItem.onclick = () => {
                    this.dismissModal();
                    this.plugin.openTaskDetail(task);
                };
            });
        }
        document.body.appendChild(overlay);
        document.body.appendChild(modal);
    }
    getPriorityColor(priority) {
        switch (priority) {
            case "Critical": return "#d70022";
            case "High": return "#f59e0b";
            case "Medium": return "#0a84ff";
            case "Low": return "#6366f1";
            default: return "#6366f1";
        }
    }
    getStatusColor(status) {
        const settings = this.plugin.settings;
        const statusObj = settings.availableStatuses?.find((s) => s.name === status);
        if (statusObj)
            return statusObj.color;
        // Fallback colors
        switch (status) {
            case "Completed": return "#2f9e44";
            case "In Progress": return "#0a84ff";
            case "Blocked": return "#d70022";
            case "Not Started": return "#6c757d";
            default: return "#6c757d";
        }
    }
    renderProjectDashboard(container, stats, allTasks) {
        const projectCard = container.createDiv("dashboard-project-card");
        // Header
        const header = projectCard.createDiv("dashboard-project-header");
        const titleSection = header.createDiv("dashboard-project-title-section");
        titleSection.createEl("h2", { text: stats.projectName });
        // Project metadata (dates)
        const settings = this.plugin.settings;
        const activeProject = settings.projects?.find((p) => p.id === stats.projectId);
        if (activeProject) {
            const metadata = titleSection.createDiv("dashboard-project-metadata");
            if (activeProject.createdDate) {
                const createdDate = new Date(activeProject.createdDate);
                metadata.createSpan({
                    text: `Created: ${createdDate.toLocaleDateString()}`,
                    cls: "dashboard-project-meta-item"
                });
            }
            if (activeProject.lastUpdatedDate) {
                const updatedDate = new Date(activeProject.lastUpdatedDate);
                metadata.createSpan({
                    text: `Last Updated: ${updatedDate.toLocaleDateString()}`,
                    cls: "dashboard-project-meta-item"
                });
            }
        }
        // KPI Grid
        const kpiGrid = projectCard.createDiv("dashboard-kpi-grid");
        this.renderKPICard(kpiGrid, "Total Tasks", stats.totalTasks, "list", "#6366f1", () => this.showTaskListModal("All Tasks", allTasks));
        this.renderKPICard(kpiGrid, "Completed", stats.completedTasks, "check-circle", "#2f9e44", () => this.showTaskListModal("Completed Tasks", allTasks.filter(t => t.status === "Completed")));
        this.renderKPICard(kpiGrid, "In Progress", stats.inProgressTasks, "loader", "#0a84ff", () => this.showTaskListModal("In Progress Tasks", allTasks.filter(t => t.status === "In Progress")));
        this.renderKPICard(kpiGrid, "Blocked", stats.blockedTasks, "alert-circle", "#d70022", () => this.showTaskListModal("Blocked Tasks", allTasks.filter(t => t.status === "Blocked")));
        // Progress section
        const progressSection = projectCard.createDiv("dashboard-section");
        progressSection.createEl("h3", { text: "Completion Progress" });
        this.renderProgressBar(progressSection, stats.completionPercentage);
        // Priority & Due dates section
        const alertsGrid = projectCard.createDiv("dashboard-kpi-grid");
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const today = now.getTime();
        const weekFromNow = today + 7 * 24 * 60 * 60 * 1000;
        const overdueTasks = allTasks.filter(t => {
            if (!t.dueDate || t.status === "Completed")
                return false;
            const dueDate = new Date(t.dueDate).getTime();
            return dueDate < today;
        });
        const dueTodayTasks = allTasks.filter(t => {
            if (!t.dueDate || t.status === "Completed")
                return false;
            const dueDate = new Date(t.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate.getTime() === today;
        });
        const dueThisWeekTasks = allTasks.filter(t => {
            if (!t.dueDate || t.status === "Completed")
                return false;
            const dueDate = new Date(t.dueDate).getTime();
            return dueDate >= today && dueDate <= weekFromNow;
        });
        const criticalTasks = allTasks.filter(t => t.priority === "Critical" && t.status !== "Completed");
        this.renderKPICard(alertsGrid, "Overdue", stats.overdueTasks, "alert-triangle", "#d70022", () => this.showTaskListModal("Overdue Tasks", overdueTasks));
        this.renderKPICard(alertsGrid, "Due Today", stats.dueTodayTasks, "calendar", "#f59e0b", () => this.showTaskListModal("Due Today", dueTodayTasks));
        this.renderKPICard(alertsGrid, "Due This Week", stats.dueThisWeekTasks, "calendar-days", "#0a84ff", () => this.showTaskListModal("Due This Week", dueThisWeekTasks));
        this.renderKPICard(alertsGrid, "Critical Priority", stats.criticalPriorityTasks, "flame", "#d70022", () => this.showTaskListModal("Critical Priority Tasks", criticalTasks));
        // Additional stats
        const statsGrid = projectCard.createDiv("dashboard-kpi-grid");
        const highPriorityTasks = allTasks.filter(t => t.priority === "High" && t.status !== "Completed");
        const dependencyTasks = allTasks.filter(t => t.dependencies && t.dependencies.length > 0 && t.status !== "Completed");
        const notStartedTasks = allTasks.filter(t => t.status === "Not Started");
        this.renderKPICard(statsGrid, "High Priority", stats.highPriorityTasks, "arrow-up", "#f59e0b", () => this.showTaskListModal("High Priority Tasks", highPriorityTasks));
        this.renderKPICard(statsGrid, "Has Dependencies", stats.tasksWithDependencies, "git-branch", "#6366f1", () => this.showTaskListModal("Tasks with Dependencies", dependencyTasks));
        this.renderKPICard(statsGrid, "Not Started", stats.notStartedTasks, "circle", "#6c757d", () => this.showTaskListModal("Not Started Tasks", notStartedTasks));
        // Effort section (only show if any tasks have effort data)
        if (stats.totalEffort > 0) {
            const effortSection = projectCard.createDiv("dashboard-section");
            effortSection.createEl("h3", { text: "Effort Summary" });
            // Effort progress bar
            const effortPercent = stats.totalEffort > 0
                ? Math.round((stats.totalEffortCompleted / stats.totalEffort) * 100)
                : 0;
            this.renderProgressBar(effortSection, effortPercent);
            const effortGrid = projectCard.createDiv("dashboard-kpi-grid");
            this.renderKPICard(effortGrid, "Effort Done", `${stats.totalEffortCompleted}h`, "check-circle", "#2f9e44");
            this.renderKPICard(effortGrid, "Effort Left", `${stats.totalEffortRemaining}h`, "clock", "#f59e0b");
            this.renderKPICard(effortGrid, "Total Effort", `${stats.totalEffort}h`, "bar-chart-2", "#6366f1");
            this.renderKPICard(effortGrid, "Avg % Complete", `${stats.averagePercentComplete}%`, "percent", "#0a84ff");
        }
        // Cost / Budget section (show if any tasks have cost data or budget is set)
        const hasCostData = stats.totalEstimatedCost > 0 || stats.totalActualCost > 0 || stats.budgetTotal > 0;
        if (hasCostData) {
            const activeProj = this.plugin.settings.projects?.find(p => p.id === stats.projectId);
            const currency = activeProj?.currencySymbol || "$";
            const costSection = projectCard.createDiv("dashboard-section");
            costSection.createEl("h3", { text: "Budget & Cost" });
            // Budget progress bar (if budget is set)
            if (stats.budgetTotal > 0) {
                this.renderBudgetProgressBar(costSection, stats.budgetUsedPercent, currency, stats.totalActualCost, stats.budgetTotal);
            }
            const costGrid = projectCard.createDiv("dashboard-kpi-grid");
            if (stats.budgetTotal > 0) {
                this.renderKPICard(costGrid, "Budget", formatCurrency(stats.budgetTotal, currency), "wallet", "#6366f1");
            }
            this.renderKPICard(costGrid, "Estimated", formatCurrency(stats.totalEstimatedCost, currency), "calculator", "#0a84ff");
            this.renderKPICard(costGrid, "Actual", formatCurrency(stats.totalActualCost, currency), "receipt", "#2f9e44");
            if (stats.budgetTotal > 0) {
                const remainingColor = stats.budgetRemaining < 0 ? "#d70022" : "#2f9e44";
                this.renderKPICard(costGrid, "Remaining", formatCurrency(stats.budgetRemaining, currency), "piggy-bank", remainingColor);
            }
            if (stats.overBudgetTaskCount > 0) {
                const overBudgetTasks = allTasks.filter(t => {
                    if (!t.costType)
                        return false;
                    const est = t.costType === "hourly"
                        ? ((t.effortCompleted ?? 0) + (t.effortRemaining ?? 0)) * (t.hourlyRate ?? activeProj?.defaultHourlyRate ?? 0)
                        : (t.costEstimate ?? 0);
                    const act = t.costType === "hourly"
                        ? (t.effortCompleted ?? 0) * (t.hourlyRate ?? activeProj?.defaultHourlyRate ?? 0)
                        : (t.costActual ?? 0);
                    return est > 0 && act > est;
                });
                this.renderKPICard(costGrid, "Over Budget", stats.overBudgetTaskCount, "alert-triangle", "#d70022", () => this.showTaskListModal("Over-Budget Tasks", overBudgetTasks));
            }
            // "View Cost Report" button
            const reportBtn = costSection.createEl("button", {
                text: "View Cost Report",
                cls: "dashboard-cost-report-btn"
            });
            reportBtn.onclick = () => this.showCostReportModal(stats.projectId, allTasks);
        }
    }
    renderBudgetProgressBar(container, percentage, currency, actual, total) {
        const barContainer = container.createDiv("dashboard-progress-container dashboard-budget-bar");
        const bar = barContainer.createDiv("dashboard-progress-bar");
        const fill = bar.createDiv("dashboard-progress-fill");
        const clamped = Math.min(100, Math.max(0, percentage));
        fill.style.width = `${clamped}%`;
        // Color thresholds: green < 75%, yellow 75-90%, red > 90%
        if (percentage > 90)
            fill.style.backgroundColor = "#d70022";
        else if (percentage > 75)
            fill.style.backgroundColor = "#f59e0b";
        else
            fill.style.backgroundColor = "#2f9e44";
        const label = barContainer.createDiv("dashboard-progress-label");
        label.textContent = `${formatCurrency(actual, currency)} / ${formatCurrency(total, currency)} (${percentage}%)`;
    }
    showCostReportModal(projectId, tasks) {
        this.dismissModal();
        const project = this.plugin.settings.projects?.find(p => p.id === projectId);
        const currency = project?.currencySymbol || "$";
        const buckets = project?.buckets || [];
        const modal = document.createElement("div");
        modal.className = "dashboard-task-modal dashboard-cost-report-modal";
        const overlay = document.createElement("div");
        overlay.className = "dashboard-task-modal-overlay";
        overlay.onclick = () => this.dismissModal();
        this.activeModal = modal;
        this.activeOverlay = overlay;
        const onKeyDown = (e) => {
            if (e.key === "Escape") {
                this.dismissModal();
                document.removeEventListener("keydown", onKeyDown);
            }
        };
        document.addEventListener("keydown", onKeyDown);
        const content = modal.createDiv("dashboard-task-modal-content dashboard-cost-report-content");
        // Header
        const header = content.createDiv("dashboard-task-modal-header");
        header.createEl("h3", { text: "Cost Report" });
        const closeBtn = header.createEl("button", { cls: "dashboard-task-modal-close" });
        const closeIcon = closeBtn.createSpan({ cls: "dashboard-task-modal-close-icon" });
        obsidian.setIcon(closeIcon, "x");
        closeBtn.onclick = () => this.dismissModal();
        // Tab bar
        const tabBar = content.createDiv("dashboard-cost-report-tabs");
        const tabBody = content.createDiv("dashboard-cost-report-body");
        let activeTab = "bucket";
        const renderTab = (tab) => {
            activeTab = tab;
            tabBar.querySelectorAll(".dashboard-cost-tab").forEach(el => el.removeClass("active"));
            tabBar.querySelector(`[data-tab="${tab}"]`)?.addClass("active");
            tabBody.empty();
            if (tab === "overbudget") {
                this.renderOverBudgetList(tabBody, tasks, project, currency);
            }
            else {
                const groupFn = tab === "bucket"
                    ? (t) => {
                        const b = buckets.find(bk => bk.id === t.bucketId);
                        return b ? b.name : "Unassigned";
                    }
                    : tab === "status"
                        ? (t) => t.status || "No Status"
                        : (t) => t.priority || "No Priority";
                const rows = getCostBreakdown(tasks, groupFn, project);
                this.renderCostBreakdownTable(tabBody, rows, currency);
            }
        };
        const tabs = [
            { key: "bucket", label: "By Bucket" },
            { key: "status", label: "By Status" },
            { key: "priority", label: "By Priority" },
            { key: "overbudget", label: "Over Budget" },
        ];
        tabs.forEach(t => {
            const btn = tabBar.createEl("button", {
                text: t.label,
                cls: "dashboard-cost-tab",
                attr: { "data-tab": t.key },
            });
            if (t.key === activeTab)
                btn.addClass("active");
            btn.onclick = () => renderTab(t.key);
        });
        renderTab(activeTab);
        document.body.appendChild(overlay);
        document.body.appendChild(modal);
    }
    renderCostBreakdownTable(container, rows, currency) {
        if (rows.length === 0) {
            container.createDiv({ text: "No cost data available.", cls: "dashboard-task-modal-empty" });
            return;
        }
        const table = container.createEl("table", { cls: "dashboard-cost-table" });
        const thead = table.createEl("thead");
        const headerRow = thead.createEl("tr");
        ["Group", "Tasks", "Estimated", "Actual", "Variance"].forEach(h => headerRow.createEl("th", { text: h }));
        const tbody = table.createEl("tbody");
        let totalEst = 0, totalAct = 0, totalVar = 0, totalCount = 0;
        rows.forEach(row => {
            const tr = tbody.createEl("tr");
            tr.createEl("td", { text: row.label });
            tr.createEl("td", { text: String(row.taskCount), cls: "dashboard-cost-num" });
            tr.createEl("td", { text: formatCurrency(row.estimated, currency), cls: "dashboard-cost-num" });
            tr.createEl("td", { text: formatCurrency(row.actual, currency), cls: "dashboard-cost-num" });
            const varCell = tr.createEl("td", { cls: "dashboard-cost-num" });
            varCell.textContent = formatCurrency(row.variance, currency);
            if (row.variance < 0)
                varCell.classList.add("planner-cost-over-budget");
            else if (row.variance > 0)
                varCell.classList.add("planner-cost-under-budget");
            totalEst += row.estimated;
            totalAct += row.actual;
            totalVar += row.variance;
            totalCount += row.taskCount;
        });
        // Totals row
        const tfoot = table.createEl("tfoot");
        const footRow = tfoot.createEl("tr");
        footRow.createEl("td", { text: "Total", cls: "dashboard-cost-total-label" });
        footRow.createEl("td", { text: String(totalCount), cls: "dashboard-cost-num" });
        footRow.createEl("td", { text: formatCurrency(totalEst, currency), cls: "dashboard-cost-num" });
        footRow.createEl("td", { text: formatCurrency(totalAct, currency), cls: "dashboard-cost-num" });
        const totalVarCell = footRow.createEl("td", { cls: "dashboard-cost-num" });
        totalVarCell.textContent = formatCurrency(totalVar, currency);
        if (totalVar < 0)
            totalVarCell.classList.add("planner-cost-over-budget");
        else if (totalVar > 0)
            totalVarCell.classList.add("planner-cost-under-budget");
    }
    renderOverBudgetList(container, tasks, project, currency) {
        const overBudget = tasks.filter(t => {
            if (!t.costType)
                return false;
            const rate = t.hourlyRate ?? project?.defaultHourlyRate ?? 0;
            const est = t.costType === "hourly"
                ? ((t.effortCompleted ?? 0) + (t.effortRemaining ?? 0)) * rate
                : (t.costEstimate ?? 0);
            const act = t.costType === "hourly"
                ? (t.effortCompleted ?? 0) * rate
                : (t.costActual ?? 0);
            return est > 0 && act > est;
        });
        if (overBudget.length === 0) {
            container.createDiv({ text: "No tasks are over budget.", cls: "dashboard-task-modal-empty" });
            return;
        }
        overBudget.forEach(task => {
            const item = container.createDiv("dashboard-task-modal-item");
            item.createDiv({ text: task.title, cls: "dashboard-task-modal-title" });
            const meta = item.createDiv("dashboard-task-modal-meta");
            const rate = task.hourlyRate ?? project?.defaultHourlyRate ?? 0;
            const est = task.costType === "hourly"
                ? ((task.effortCompleted ?? 0) + (task.effortRemaining ?? 0)) * rate
                : (task.costEstimate ?? 0);
            const act = task.costType === "hourly"
                ? (task.effortCompleted ?? 0) * rate
                : (task.costActual ?? 0);
            const diff = act - est;
            meta.createSpan({ text: `Est: ${formatCurrency(est, currency)}`, cls: "dashboard-cost-meta" });
            meta.createSpan({ text: `Act: ${formatCurrency(act, currency)}`, cls: "dashboard-cost-meta" });
            meta.createSpan({ text: `Over: ${formatCurrency(diff, currency)}`, cls: "dashboard-cost-meta planner-cost-over-budget" });
            item.onclick = () => {
                this.dismissModal();
                this.plugin.openTaskDetail(task);
            };
        });
    }
    render() {
        const container = this.containerEl;
        const thisRender = ++this.renderVersion;
        // Save scroll position before clearing
        const existingWrapper = container.querySelector('.dashboard-wrapper');
        if (existingWrapper && this.savedScrollTop === null) {
            this.savedScrollTop = existingWrapper.scrollTop;
        }
        container.empty();
        const wrapper = container.createDiv("dashboard-wrapper");
        // Header
        renderPlannerHeader(wrapper, this.plugin, {
            active: "dashboard",
            onProjectChange: async () => {
                await this.plugin.taskStore.load();
                // No explicit render() — TaskStore.load() → emit() already re-renders via subscription
            }
        });
        // View mode toggle
        const toolbar = wrapper.createDiv("dashboard-toolbar");
        const toggleContainer = toolbar.createDiv("dashboard-toggle");
        toggleContainer.createSpan({ text: "Show All Projects", cls: "dashboard-toggle-label" });
        const toggleSwitch = toggleContainer.createEl("input", { type: "checkbox", cls: "dashboard-toggle-switch" });
        toggleSwitch.checked = this.showAllProjects;
        toggleSwitch.onchange = () => {
            this.showAllProjects = toggleSwitch.checked;
            this.render();
        };
        // Content
        const content = wrapper.createDiv("dashboard-content");
        // Restore scroll position after DOM is rebuilt
        if (this.savedScrollTop !== null) {
            const scrollPos = this.savedScrollTop;
            this.savedScrollTop = null;
            requestAnimationFrame(() => {
                if (thisRender !== this.renderVersion)
                    return;
                wrapper.scrollTop = scrollPos;
            });
        }
        const settings = this.plugin.settings;
        const projects = settings.projects || [];
        const activeProjectId = settings.activeProjectId;
        if (this.showAllProjects) {
            // Show all projects
            if (projects.length === 0) {
                content.createEl("div", { text: "No projects found.", cls: "dashboard-empty" });
                return;
            }
            projects.forEach((project) => {
                // Load tasks for this project
                const projectTasks = this.plugin.taskStore.getAllForProject?.(project.id) || [];
                const stats = this.calculateProjectStats(project.id, project.name, projectTasks);
                this.renderProjectDashboard(content, stats, projectTasks);
            });
        }
        else {
            // Show active project only
            const activeProject = projects.find((p) => p.id === activeProjectId);
            if (!activeProject) {
                content.createEl("div", { text: "No active project selected.", cls: "dashboard-empty" });
                return;
            }
            const tasks = this.plugin.taskStore.getAll();
            const stats = this.calculateProjectStats(activeProject.id, activeProject.name, tasks);
            this.renderProjectDashboard(content, stats, tasks);
        }
    }
}

const VIEW_TYPE_MY_DAY = "project-planner-my-day-view";
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
function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}
function getTodayDate$1() {
    return toDateStr(new Date());
}
/** Get the Monday-through-Sunday dates for the week containing `anchor`. */
function getWeekDates(anchor) {
    const d = new Date(anchor);
    const dayOfWeek = d.getDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    const week = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        week.push(day);
    }
    return week;
}
const PRIORITY_WEIGHT = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Low: 3,
};
function sortTasks(items) {
    return [...items].sort((a, b) => {
        if (a.task.completed !== b.task.completed)
            return a.task.completed ? 1 : -1;
        const wa = PRIORITY_WEIGHT[a.task.priority || "Medium"] ?? 2;
        const wb = PRIORITY_WEIGHT[b.task.priority || "Medium"] ?? 2;
        return wa - wb;
    });
}
class MyDayView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.unsubscribe = null;
        // View mode
        this.viewMode = "today";
        // Week navigation anchor (always the displayed week's reference date)
        this.weekAnchor = new Date();
        // Task picker panel
        this.pickerOpen = false;
        this.pickerSearch = "";
        // Scroll position preservation
        this.savedScrollTop = null;
        this.savedScrollLeft = null;
        this.renderVersion = 0;
        // Filters (shared across both modes)
        this.currentFilters = {
            priority: "All",
            search: "",
            showCompleted: false,
        };
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
    getTasksForDate(dateStr) {
        const settings = this.plugin.settings;
        const projects = settings.projects || [];
        const result = [];
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
    getMyDayTasks() {
        return this.getTasksForDate(getTodayDate$1());
    }
    /** Tasks across all 7 days of the displayed week, keyed by YYYY-MM-DD. */
    getWeekTaskMap() {
        const weekDates = getWeekDates(this.weekAnchor);
        const dateStrings = weekDates.map(toDateStr);
        const dateSet = new Set(dateStrings);
        const settings = this.plugin.settings;
        const projects = settings.projects || [];
        const map = new Map();
        for (const ds of dateStrings)
            map.set(ds, []);
        for (const project of projects) {
            const tasks = this.taskStore.getAllForProject(project.id) || [];
            for (const task of tasks) {
                if (task.dueDate && dateSet.has(task.dueDate)) {
                    map.get(task.dueDate).push({
                        task,
                        projectId: project.id,
                        projectName: project.name,
                    });
                }
            }
        }
        return map;
    }
    applyFilters(items) {
        return items.filter(({ task }) => {
            if (!this.currentFilters.showCompleted && task.completed)
                return false;
            if (this.currentFilters.priority !== "All" && task.priority !== this.currentFilters.priority) {
                return false;
            }
            if (this.currentFilters.search) {
                const q = this.currentFilters.search.toLowerCase();
                if (!task.title.toLowerCase().includes(q))
                    return false;
            }
            return true;
        });
    }
    // ---------------------------------------------------------------------------
    // Date formatting
    // ---------------------------------------------------------------------------
    formatDate(dateStr) {
        if (!dateStr)
            return "—";
        const parts = dateStr.split("-");
        if (parts.length !== 3)
            return dateStr;
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
        const scrollTarget = container.querySelector(".myday-content") ||
            container.querySelector(".myday-week-scroll");
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
        }
        else {
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
    renderHeader(wrapper) {
        const header = wrapper.createDiv("myday-header");
        // Left: icon + title + date
        const titleSection = header.createDiv("myday-header-title");
        const iconEl = titleSection.createDiv("myday-header-icon");
        obsidian.setIcon(iconEl, "sun");
        const titleText = titleSection.createDiv("myday-header-text");
        const now = new Date();
        titleText.createDiv({ text: "My Tasks", cls: "myday-title" });
        titleText.createDiv({
            text: `${DAY_NAMES[now.getDay()]}, ${MONTH_NAMES[now.getMonth()]} ${now.getDate()}`,
            cls: "myday-date-subtitle",
        });
        // Center: Today / Week segmented toggle
        const modeToggle = header.createDiv("myday-mode-toggle");
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
        // Right: view switcher
        const viewSwitcher = header.createDiv("planner-view-switcher");
        const dashBtn = viewSwitcher.createEl("button", { cls: "planner-view-btn", title: "Dashboard" });
        obsidian.setIcon(dashBtn, "layout-dashboard");
        dashBtn.onclick = async () => await this.plugin.activateDashboardView();
        const gridBtn = viewSwitcher.createEl("button", { cls: "planner-view-btn", title: "Grid" });
        obsidian.setIcon(gridBtn, "table");
        gridBtn.onclick = async () => await this.plugin.activateView();
        const boardBtn = viewSwitcher.createEl("button", { cls: "planner-view-btn", title: "Board" });
        obsidian.setIcon(boardBtn, "layout-list");
        boardBtn.onclick = async () => await this.plugin.activateBoardView();
        const ganttBtn = viewSwitcher.createEl("button", { cls: "planner-view-btn", title: "Timeline" });
        obsidian.setIcon(ganttBtn, "calendar-range");
        ganttBtn.onclick = async () => await this.plugin.activateGanttView();
        const graphBtn = viewSwitcher.createEl("button", { cls: "planner-view-btn", title: "Graph" });
        obsidian.setIcon(graphBtn, "git-fork");
        graphBtn.onclick = async () => await this.plugin.openDependencyGraph();
        const myDayBtn = viewSwitcher.createEl("button", {
            cls: "planner-view-btn planner-view-btn-active",
            title: "My Tasks",
        });
        obsidian.setIcon(myDayBtn, "sun");
    }
    // ---------------------------------------------------------------------------
    // Toolbar
    // ---------------------------------------------------------------------------
    renderToolbar(wrapper) {
        const toolbar = wrapper.createDiv("myday-toolbar");
        // Priority filter
        const priorityGroup = toolbar.createDiv("planner-filter-group");
        priorityGroup.createSpan({ cls: "planner-filter-label", text: "Priority:" });
        const prioritySelect = priorityGroup.createEl("select", { cls: "planner-filter-select" });
        ["All", "Low", "Medium", "High", "Critical"].forEach((p) => {
            const opt = prioritySelect.createEl("option", { text: p, value: p });
            if (p === this.currentFilters.priority)
                opt.selected = true;
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
        obsidian.setIcon(addIcon, this.pickerOpen ? "x" : "plus-circle");
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
            obsidian.setIcon(prevBtn, "chevron-left");
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
            obsidian.setIcon(nextBtn, "chevron-right");
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
    renderTodayContent(wrapper, thisRender) {
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
    renderTodayEmpty(content, totalCount) {
        const emptyState = content.createDiv("myday-empty");
        const emptyIcon = emptyState.createDiv("myday-empty-icon");
        obsidian.setIcon(emptyIcon, "sun");
        if (totalCount === 0) {
            emptyState.createDiv({ text: "No tasks due today", cls: "myday-empty-title" });
            emptyState.createDiv({
                text: "Tasks with today's date as their due date will appear here.",
                cls: "myday-empty-subtitle",
            });
        }
        else {
            emptyState.createDiv({ text: "All tasks filtered out", cls: "myday-empty-title" });
            emptyState.createDiv({
                text: `${totalCount} task(s) due today are hidden by your current filters.`,
                cls: "myday-empty-subtitle",
            });
        }
    }
    renderSummaryBar(content, allItems, filtered) {
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
    renderWeekContent(wrapper, thisRender) {
        const weekDates = getWeekDates(this.weekAnchor);
        const taskMap = this.getWeekTaskMap();
        const todayStr = getTodayDate$1();
        // Week header with date range
        const weekDatesStr = weekDates.map(toDateStr);
        const firstDate = weekDates[0];
        const lastDate = weekDates[6];
        const rangeLabel = firstDate.getMonth() === lastDate.getMonth()
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
            const column = columnsContainer.createDiv(`myday-week-col${isToday ? " myday-week-col-today" : ""}`);
            // Column header
            const colHeader = column.createDiv("myday-week-col-header");
            colHeader.createDiv({
                text: DAY_NAMES_SHORT[date.getDay()],
                cls: "myday-week-col-day",
            });
            colHeader.createDiv({
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
    renderWeekCard(container, item) {
        const { task, projectName } = item;
        const card = container.createDiv(`myday-week-card${task.completed ? " myday-week-card-completed" : ""}`);
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
    getAllPickerTasks() {
        const settings = this.plugin.settings;
        const projects = settings.projects || [];
        const today = getTodayDate$1();
        const result = [];
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
    renderPickerPanel(body) {
        const panel = body.createDiv("myday-picker");
        // Panel header
        const panelHeader = panel.createDiv("myday-picker-header");
        panelHeader.createDiv({ text: "Add Tasks to My Day", cls: "myday-picker-title" });
        const closeBtn = panelHeader.createEl("button", { cls: "myday-picker-close", title: "Close" });
        obsidian.setIcon(closeBtn, "x");
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
    renderPickerList(panel) {
        // Remove old list if re-rendering (from search)
        const existing = panel.querySelector(".myday-picker-list");
        if (existing)
            existing.remove();
        const list = panel.createDiv("myday-picker-list");
        const groups = this.getAllPickerTasks();
        const query = this.pickerSearch.toLowerCase();
        let totalShown = 0;
        for (const group of groups) {
            const matchingTasks = query
                ? group.tasks.filter((t) => t.title.toLowerCase().includes(query))
                : group.tasks;
            if (matchingTasks.length === 0)
                continue;
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
                }
                else {
                    meta.createSpan({ text: "No due date", cls: "myday-picker-row-date myday-picker-row-nodate" });
                }
                // Add button
                const addBtn = row.createEl("button", {
                    cls: "myday-picker-add-btn",
                    title: "Set due date to today",
                });
                const btnIcon = addBtn.createSpan();
                obsidian.setIcon(btnIcon, "plus");
                addBtn.createSpan({ text: "Add" });
                addBtn.onclick = async () => {
                    await this.taskStore.updateTask(task.id, { dueDate: getTodayDate$1() });
                };
            }
        }
        if (totalShown === 0) {
            const empty = list.createDiv("myday-picker-empty");
            if (query) {
                empty.textContent = "No tasks matching your search.";
            }
            else {
                empty.textContent = "All tasks are either completed or already due today.";
            }
        }
    }
    // ===========================================================================
    // Shared helpers
    // ===========================================================================
    restoreScroll(el, thisRender) {
        if (this.savedScrollTop !== null || this.savedScrollLeft !== null) {
            const top = this.savedScrollTop;
            const left = this.savedScrollLeft;
            requestAnimationFrame(() => {
                if (this.renderVersion !== thisRender)
                    return;
                if (top !== null)
                    el.scrollTop = top;
                if (left !== null)
                    el.scrollLeft = left;
                this.savedScrollTop = null;
                this.savedScrollLeft = null;
            });
        }
    }
    // ---------------------------------------------------------------------------
    // Today-mode table
    // ---------------------------------------------------------------------------
    renderTable(content, items) {
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
    renderRow(tbody, item) {
        const { task, projectName } = item;
        const row = tbody.createEl("tr", { cls: "myday-row" });
        if (task.completed)
            row.classList.add("myday-row-completed");
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
        if (task.completed)
            titleSpan.classList.add("myday-task-completed");
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
    createStatusPill(container, status) {
        const settings = this.plugin.settings;
        const statusDef = settings.availableStatuses?.find((s) => s.name === status);
        const color = statusDef?.color || "var(--text-muted)";
        const pill = container.createSpan({ text: status, cls: "planner-status-pill" });
        pill.style.setProperty("--status-color", color);
    }
    createPriorityPill(container, priority) {
        const settings = this.plugin.settings;
        const priorityDef = settings.availablePriorities?.find((p) => p.name === priority);
        const color = priorityDef?.color || "var(--text-muted)";
        const pill = container.createSpan({ text: priority, cls: "planner-priority-pill" });
        pill.style.setProperty("--priority-color", color);
    }
    // ---------------------------------------------------------------------------
    // Context menu
    // ---------------------------------------------------------------------------
    showRowMenu(item, evt) {
        const menu = new obsidian.Menu();
        const { task, projectId, projectName } = item;
        menu.addItem((i) => i
            .setTitle("Open details")
            .setIcon("pencil")
            .onClick(() => this.plugin.openTaskDetail(task)));
        menu.addItem((i) => i
            .setTitle(task.completed ? "Mark incomplete" : "Mark complete")
            .setIcon(task.completed ? "circle" : "check-circle")
            .onClick(async () => {
            const isDone = !task.completed;
            await this.taskStore.updateTask(task.id, {
                completed: isDone,
                status: isDone ? "Completed" : "Not Started",
            });
        }));
        menu.addItem((i) => i
            .setTitle("Remove from My Day")
            .setIcon("calendar-minus")
            .onClick(async () => {
            await this.taskStore.updateTask(task.id, { dueDate: "" });
        }));
        menu.addSeparator();
        menu.addItem((i) => i
            .setTitle(`Project: ${projectName}`)
            .setIcon("folder")
            .setDisabled(true));
        menu.showAtMouseEvent(evt);
    }
}

// Helper to get today's date in YYYY-MM-DD format
function getTodayDate() {
    const now = new Date();
    return now.toISOString().slice(0, 10);
}
// Helper to parse YYYY-MM-DD date string without timezone issues
function parseDate(dateStr) {
    const parts = dateStr.split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN))
        return new Date(NaN);
    const [y, m, d] = parts;
    return new Date(y, m - 1, d);
}
// Helper to format a Date to YYYY-MM-DD
function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
// Helper to add days to a date string, returning a new YYYY-MM-DD string
function addDays(dateStr, days) {
    const date = parseDate(dateStr);
    date.setDate(date.getDate() + days);
    return toISODate(date);
}
class TaskStore {
    constructor(plugin) {
        this.tasks = [];
        this.tasksByProject = {};
        this.taskIndex = new Map();
        this.listeners = new Set();
        this.loaded = false;
        /** Cached non-task data from data.json, loaded once and kept in sync */
        this.cachedRawData = null;
        this.plugin = plugin;
    }
    get activeProjectId() {
        return this.plugin.settings.activeProjectId;
    }
    // ---------------------------------------------------------------------------
    // LOADING WITH FULL MIGRATION + NON-DESTRUCTIVE LOGIC
    // ---------------------------------------------------------------------------
    async load() {
        const raw = ((await this.plugin.loadData()) || {});
        // Cache the raw data to avoid re-reading from disk on every save
        this.cachedRawData = raw;
        // Always try to load existing multiproject data
        this.tasksByProject = raw.tasksByProject ?? {};
        const projectId = this.activeProjectId;
        // MIGRATION: If legacy tasks exist and no multiproject data yet
        if ((!this.tasksByProject || Object.keys(this.tasksByProject).length === 0) &&
            Array.isArray(raw.tasks) &&
            raw.tasks.length > 0) {
            // Create tasksByProject
            this.tasksByProject = {
                [projectId]: raw.tasks
            };
            // Save migrated structure safely
            raw.tasksByProject = this.tasksByProject;
            delete raw.tasks; // optional: remove legacy field to avoid confusion
            await this.plugin.saveData(raw);
        }
        // Ensure this project has a valid bucket
        if (!this.tasksByProject[projectId]) {
            this.tasksByProject[projectId] = [];
            raw.tasksByProject = this.tasksByProject;
            await this.plugin.saveData(raw);
        }
        // Set the working tasks reference
        this.tasks = this.tasksByProject[projectId];
        this.rebuildIndex();
        this.loaded = true;
        this.emit();
    }
    /** Rebuild the O(1) lookup index from the current tasks array. */
    rebuildIndex() {
        this.taskIndex.clear();
        for (const t of this.tasks) {
            this.taskIndex.set(t.id, t);
        }
    }
    // ---------------------------------------------------------------------------
    // NON-DESTRUCTIVE SAVE (MERGES INTO EXISTING DATA)
    // ---------------------------------------------------------------------------
    /**
     * Persist current task data to disk AND notify all view subscribers.
     * Use this for simple, single-step operations (addTask, setOrder, etc.).
     */
    async save() {
        await this.saveQuietly();
        this.emit();
    }
    /**
     * Persist current task data to disk WITHOUT notifying views.
     * Used by multi-step operations (updateTask, deleteTask, makeSubtask,
     * promoteSubtask) that need to cascade / roll-up before emitting once
     * at the very end to avoid triggering N full DOM rebuilds per action.
     */
    async saveQuietly() {
        const projectId = this.activeProjectId;
        if (!projectId)
            return;
        // Update current project bucket
        this.tasksByProject[projectId] = this.tasks;
        // Use cached data instead of re-reading from disk on every save.
        // Falls back to loadData() if cache is missing (e.g., external modification).
        const raw = this.cachedRawData ?? ((await this.plugin.loadData()) || {});
        raw.tasksByProject = this.tasksByProject;
        // Always sync settings from the authoritative in-memory object.
        // Without this, the cache can hold stale settings (e.g., missing newly
        // created Board buckets) and overwrite them on the next task save.
        raw.settings = this.plugin.settings;
        this.cachedRawData = raw;
        await this.plugin.saveData(raw);
    }
    // ---------------------------------------------------------------------------
    // PUBLIC API
    // ---------------------------------------------------------------------------
    getAll() {
        return this.tasks;
    }
    getAllForProject(projectId) {
        return this.tasksByProject[projectId] || [];
    }
    isLoaded() {
        return this.loaded;
    }
    /** Expose cached raw data so plugin.saveSettings() can merge safely */
    getCachedRawData() {
        return this.cachedRawData;
    }
    async ensureLoaded() {
        if (!this.loaded) {
            await this.load();
        }
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    emit() {
        for (const l of this.listeners) {
            try {
                l();
            }
            catch { }
        }
    }
    // Public method to manually trigger view updates (e.g., after settings change)
    refresh() {
        this.emit();
    }
    async addTask(title) {
        const today = getTodayDate();
        const task = {
            id: crypto.randomUUID(),
            title,
            status: "Not Started",
            priority: "Medium",
            completed: false,
            parentId: null,
            collapsed: false,
            createdDate: today,
            lastModifiedDate: today,
            startDate: today, // Set start date to today by default
        };
        this.tasks.push(task);
        this.taskIndex.set(task.id, task);
        this.updateProjectTimestamp();
        await this.save();
        // Sync to markdown if enabled
        if (this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
            try {
                await this.plugin.taskSync.syncTaskToMarkdown(task, this.activeProjectId);
            }
            catch (error) {
                console.error("Failed to sync task to markdown:", error);
            }
        }
        return task;
    }
    /**
     * Create a new task and insert it at a specific index in one atomic
     * operation. Only emits once after the task is in its final position,
     * preventing intermediate renders that flash the task at the wrong spot.
     */
    async addTaskAtIndex(title, index, overrides) {
        const today = getTodayDate();
        const task = {
            id: crypto.randomUUID(),
            title,
            status: "Not Started",
            priority: "Medium",
            completed: false,
            parentId: null,
            collapsed: false,
            createdDate: today,
            lastModifiedDate: today,
            startDate: today,
        };
        if (overrides)
            Object.assign(task, overrides);
        // Insert directly at the requested position
        const clampedIndex = Math.max(0, Math.min(index, this.tasks.length));
        this.tasks.splice(clampedIndex, 0, task);
        this.taskIndex.set(task.id, task);
        this.updateProjectTimestamp();
        await this.save(); // save + emit once
        // Sync to markdown if enabled
        if (this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
            try {
                await this.plugin.taskSync.syncTaskToMarkdown(task, this.activeProjectId);
            }
            catch (error) {
                console.error("Failed to sync task to markdown:", error);
            }
        }
        return task;
    }
    async addTaskFromObject(task) {
        // Check if task already exists
        const existing = this.tasks.find(t => t.id === task.id);
        if (existing) {
            // Merge incoming task into existing — only overwrite properties that are
            // explicitly present on the incoming task object.  This prevents stale
            // markdown sync-back from wiping in-memory fields (e.g. bucketId) that
            // were never written to the markdown file.
            for (const key of Object.keys(task)) {
                if (task[key] !== undefined) {
                    // Safe dynamic assignment — both sides share the same key
                    existing[key] = task[key];
                }
            }
        }
        else {
            // Set timestamps if not already set
            if (!task.createdDate)
                task.createdDate = getTodayDate();
            if (!task.lastModifiedDate)
                task.lastModifiedDate = getTodayDate();
            this.tasks.push(task);
            this.taskIndex.set(task.id, task);
        }
        this.updateProjectTimestamp();
        await this.save();
    }
    async addTaskToProject(task, projectId) {
        // Ensure project bucket exists
        if (!this.tasksByProject[projectId]) {
            this.tasksByProject[projectId] = [];
        }
        // Check if task already exists in this project
        const projectTasks = this.tasksByProject[projectId];
        const existing = projectTasks.find(t => t.id === task.id);
        if (existing) {
            // Update instead of adding duplicate
            Object.assign(existing, task);
            existing.lastModifiedDate = getTodayDate();
        }
        else {
            // Set timestamps if not already set
            if (!task.createdDate)
                task.createdDate = getTodayDate();
            if (!task.lastModifiedDate)
                task.lastModifiedDate = getTodayDate();
            projectTasks.push(task);
            this.taskIndex.set(task.id, task);
        }
        // Update the project bucket
        this.tasksByProject[projectId] = projectTasks;
        // Update project timestamp
        const project = this.plugin.settings.projects.find(p => p.id === projectId);
        if (project) {
            project.lastUpdatedDate = new Date().toISOString();
        }
        // Save and emit changes
        const raw = this.cachedRawData ?? ((await this.plugin.loadData()) || {});
        raw.tasksByProject = this.tasksByProject;
        this.cachedRawData = raw;
        await this.plugin.saveData(raw);
        // If this is the active project, refresh the working tasks
        if (projectId === this.activeProjectId) {
            this.tasks = this.tasksByProject[projectId];
        }
        this.emit();
    }
    async updateTask(id, partial) {
        let task = this.tasks.find((t) => t.id === id);
        let crossProjectId = null;
        // If not in the active project, search all projects (needed by MyDayView
        // which aggregates tasks across every project).
        if (!task) {
            for (const [projId, projTasks] of Object.entries(this.tasksByProject)) {
                task = projTasks.find((t) => t.id === id);
                if (task) {
                    crossProjectId = projId;
                    break;
                }
            }
        }
        if (!task)
            return;
        // Track old title for file rename detection
        const oldTitle = task.title;
        const titleChanged = partial.title !== undefined && partial.title !== oldTitle;
        // Bidirectional sync: status takes precedence
        if (partial.status !== undefined) {
            partial.completed = partial.status === "Completed";
        }
        else if (partial.completed !== undefined) {
            partial.status = partial.completed ? "Completed" : task.status || "Not Started";
        }
        // Effort sync: Microsoft Planner style
        // - When completed hours change, remaining auto-decreases from total
        // - When remaining changes directly, total adjusts
        // - When task is marked Completed, remaining → 0, completed = total
        const oldCompleted = task.effortCompleted ?? 0;
        const oldRemaining = task.effortRemaining ?? 0;
        const oldTotal = oldCompleted + oldRemaining;
        if (partial.status === "Completed" || partial.completed === true) {
            // Move all remaining into completed
            if (oldTotal > 0) {
                partial.effortCompleted = oldTotal;
                partial.effortRemaining = 0;
            }
        }
        else if (partial.effortCompleted !== undefined && partial.effortRemaining === undefined) {
            // User changed completed hours only → auto-adjust remaining from total
            partial.effortRemaining = Math.max(0, oldTotal - partial.effortCompleted);
        }
        // Auto-calculate percentComplete from effort values
        const finalCompleted = partial.effortCompleted ?? task.effortCompleted ?? 0;
        const finalRemaining = partial.effortRemaining ?? task.effortRemaining ?? 0;
        const totalEffortCalc = finalCompleted + finalRemaining;
        if (totalEffortCalc > 0) {
            partial.percentComplete = Math.round((finalCompleted / totalEffortCalc) * 100);
            // Auto-sync status based on calculated percent
            if (partial.percentComplete === 100 && (partial.status ?? task.status) !== "Completed") {
                partial.status = "Completed";
                partial.completed = true;
            }
            else if (partial.percentComplete < 100 && (partial.status ?? task.status) === "Completed") {
                partial.status = "In Progress";
                partial.completed = false;
            }
        }
        else {
            // No effort data — keep percentComplete as-is (or 0)
            if (partial.effortCompleted !== undefined || partial.effortRemaining !== undefined) {
                partial.percentComplete = 0;
            }
        }
        // Track old dates for dependency scheduling cascade
        const oldStartDate = task.startDate;
        const oldDueDate = task.dueDate;
        // Set last modified timestamp
        partial.lastModifiedDate = getTodayDate();
        // Object.assign mutates the task in-place. For cross-project tasks
        // this correctly modifies the reference inside tasksByProject[crossProjectId].
        Object.assign(task, partial);
        this.updateProjectTimestamp();
        // Persist without emitting — cascade/rollup may trigger additional saves.
        // We emit exactly once at the very end to avoid N full DOM rebuilds.
        await this.saveQuietly();
        // Resolve the project ID the task actually belongs to
        const effectiveProjectId = crossProjectId ?? this.activeProjectId;
        // Sync to markdown if enabled
        if (this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
            try {
                // If title changed, delete old file and create new one
                if (titleChanged) {
                    await this.plugin.taskSync.handleTaskRename(task, oldTitle, effectiveProjectId);
                }
                else {
                    await this.plugin.taskSync.syncTaskToMarkdown(task, effectiveProjectId);
                }
            }
            catch (error) {
                console.error("Failed to sync task to markdown:", error);
            }
        }
        // Cascade & roll-up only apply within the active project's task array.
        // Cross-project updates skip these — the task's dependents and parent
        // live in its own project and will cascade when that project is active.
        if (!crossProjectId) {
            // Dependency-driven auto-scheduling: cascade date changes to dependent tasks
            if (this.plugin.settings.enableDependencyScheduling) {
                const datesChanged = (partial.startDate !== undefined && task.startDate !== oldStartDate) ||
                    (partial.dueDate !== undefined && task.dueDate !== oldDueDate);
                if (datesChanged) {
                    await this.cascadeDependencyDates(task.id, new Set());
                }
            }
            // Parent task roll-up: recalculate parent's dates, effort, and % complete
            if (this.plugin.settings.enableParentRollUp && task.parentId) {
                await this.rollUpParentFields(task.parentId);
            }
        }
        // Single emit after ALL work is done — views render once with final data
        this.emit();
    }
    // ---------------------------------------------------------------------------
    // Parent Task Roll-Up (MS Project style)
    // ---------------------------------------------------------------------------
    /**
     * Recalculate a parent task's dates, effort, and % complete from its
     * direct children. Cascades upward if the parent itself has a parent.
     *
     * - **Dates**: startDate = earliest child start; dueDate = latest child due
     * - **Effort**: effortCompleted = Σ children completed; effortRemaining = Σ children remaining
     * - **% Complete**: duration-weighted average: Σ(childDuration × child%) / Σ(childDuration)
     *   If no children have durations, uses equal weighting.
     */
    async rollUpParentFields(parentId) {
        const parent = this.tasks.find(t => t.id === parentId);
        if (!parent)
            return;
        const children = this.tasks.filter(t => t.parentId === parentId);
        if (children.length === 0)
            return;
        // --- Date roll-up: earliest start, latest due ---
        let earliestStart;
        let latestDue;
        for (const child of children) {
            if (child.startDate) {
                if (!earliestStart || child.startDate < earliestStart) {
                    earliestStart = child.startDate;
                }
            }
            if (child.dueDate) {
                if (!latestDue || child.dueDate > latestDue) {
                    latestDue = child.dueDate;
                }
            }
        }
        // --- Effort roll-up: sum of children ---
        let totalCompleted = 0;
        let totalRemaining = 0;
        for (const child of children) {
            totalCompleted += child.effortCompleted ?? 0;
            totalRemaining += child.effortRemaining ?? 0;
        }
        // --- Cost roll-up: sum of children's estimated and actual costs ---
        const project = this.plugin.settings.projects?.find(p => p.id === this.activeProjectId);
        let totalCostEstimate = 0;
        let totalCostActual = 0;
        for (const child of children) {
            totalCostEstimate += getTaskEstimatedCost(child, project);
            totalCostActual += getTaskActualCost(child, project);
        }
        const anyCostData = totalCostEstimate > 0 || totalCostActual > 0;
        // --- % Complete roll-up: duration-weighted average ---
        let weightedPct = 0;
        let totalWeight = 0;
        for (const child of children) {
            let duration = 1; // default equal weight
            if (child.startDate && child.dueDate) {
                const s = parseDate(child.startDate);
                const e = parseDate(child.dueDate);
                const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000));
                duration = days;
            }
            const childPct = child.percentComplete ?? 0;
            weightedPct += duration * childPct;
            totalWeight += duration;
        }
        const rolledPct = totalWeight > 0 ? Math.round(weightedPct / totalWeight) : 0;
        // --- Determine if the parent's status should sync with rolled-up % ---
        const totalEffort = totalCompleted + totalRemaining;
        let newStatus;
        let newCompleted;
        if (rolledPct === 100) {
            newStatus = "Completed";
            newCompleted = true;
        }
        else if (rolledPct > 0 && parent.status === "Completed") {
            // Was marked complete but children say otherwise
            newStatus = "In Progress";
            newCompleted = false;
        }
        // --- Apply changes only if something actually changed ---
        const changes = {};
        let changed = false;
        if (earliestStart !== undefined && earliestStart !== parent.startDate) {
            changes.startDate = earliestStart;
            changed = true;
        }
        if (latestDue !== undefined && latestDue !== parent.dueDate) {
            changes.dueDate = latestDue;
            changed = true;
        }
        if (totalEffort > 0) {
            if (totalCompleted !== (parent.effortCompleted ?? 0)) {
                changes.effortCompleted = totalCompleted;
                changed = true;
            }
            if (totalRemaining !== (parent.effortRemaining ?? 0)) {
                changes.effortRemaining = totalRemaining;
                changed = true;
            }
        }
        if (rolledPct !== (parent.percentComplete ?? 0)) {
            changes.percentComplete = rolledPct;
            changed = true;
        }
        // Cost roll-up
        if (anyCostData) {
            if (totalCostEstimate !== (parent.costEstimate ?? 0)) {
                changes.costEstimate = totalCostEstimate;
                changed = true;
            }
            if (totalCostActual !== (parent.costActual ?? 0)) {
                changes.costActual = totalCostActual;
                changed = true;
            }
            // Mark parent as fixed cost type so rolled values display correctly
            if (parent.costType !== "fixed") {
                changes.costType = "fixed";
                changed = true;
            }
        }
        if (newStatus !== undefined && newStatus !== parent.status) {
            changes.status = newStatus;
            changes.completed = newCompleted;
            changed = true;
        }
        if (!changed)
            return;
        changes.lastModifiedDate = getTodayDate();
        Object.assign(parent, changes);
        // Sync parent to markdown if enabled
        if (this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
            try {
                await this.plugin.taskSync.syncTaskToMarkdown(parent, this.activeProjectId);
            }
            catch (error) {
                console.error("Failed to sync rolled-up parent to markdown:", error);
            }
        }
        // Save the updated parent (quiet — caller will emit once at the end)
        this.updateProjectTimestamp();
        await this.saveQuietly();
        // Cascade upward: if this parent also has a parent, roll up again
        if (parent.parentId) {
            await this.rollUpParentFields(parent.parentId);
        }
    }
    // ---------------------------------------------------------------------------
    // Dependency-Driven Auto-Scheduling (MS Project / GanttProject style)
    // ---------------------------------------------------------------------------
    /**
     * Find all tasks that depend on `predecessorId` and shift their dates
     * according to each dependency type. Cascades recursively to downstream
     * dependents. Uses a `visited` Set to prevent infinite loops from
     * circular dependencies.
     */
    async cascadeDependencyDates(predecessorId, visited) {
        if (visited.has(predecessorId))
            return; // Circular dependency guard
        visited.add(predecessorId);
        const predecessor = this.tasks.find(t => t.id === predecessorId);
        if (!predecessor)
            return;
        // Find all tasks that list this task as a predecessor
        const dependents = this.tasks.filter(t => t.dependencies?.some(d => d.predecessorId === predecessorId));
        for (const dependent of dependents) {
            const dep = dependent.dependencies.find(d => d.predecessorId === predecessorId);
            const updates = this.calculateScheduledDates(predecessor, dependent, dep.type);
            if (!updates)
                continue; // No changes needed
            // Check if dates actually changed to avoid unnecessary saves
            const startChanged = updates.startDate !== undefined && updates.startDate !== dependent.startDate;
            const dueChanged = updates.dueDate !== undefined && updates.dueDate !== dependent.dueDate;
            if (!startChanged && !dueChanged)
                continue;
            // Apply the date changes
            const partial = { lastModifiedDate: getTodayDate() };
            if (startChanged)
                partial.startDate = updates.startDate;
            if (dueChanged)
                partial.dueDate = updates.dueDate;
            Object.assign(dependent, partial);
            // Sync to markdown if enabled
            if (this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
                try {
                    await this.plugin.taskSync.syncTaskToMarkdown(dependent, this.activeProjectId);
                }
                catch (error) {
                    console.error("Failed to sync cascaded task to markdown:", error);
                }
            }
            // Recurse: this dependent's dates changed, so cascade to its own dependents
            await this.cascadeDependencyDates(dependent.id, visited);
        }
        // Save once after all cascades from this level (quiet — caller emits)
        this.updateProjectTimestamp();
        await this.saveQuietly();
    }
    /**
     * Calculate what the dependent task's start/due dates should be based on
     * the predecessor's dates, the dependency type, and the dependent task's
     * current duration (preserves task duration when shifting).
     *
     * Returns { startDate, dueDate } partial, or null if no shift is needed
     * (e.g., predecessor has no dates set).
     */
    calculateScheduledDates(predecessor, dependent, depType) {
        // Compute the dependent's current duration in days (to preserve when shifting)
        let durationDays = 0;
        if (dependent.startDate && dependent.dueDate) {
            const s = parseDate(dependent.startDate);
            const e = parseDate(dependent.dueDate);
            durationDays = Math.max(0, Math.round((e.getTime() - s.getTime()) / (86400000)));
        }
        switch (depType) {
            case "FS": {
                // Finish-to-Start: dependent starts the day after predecessor finishes
                if (!predecessor.dueDate)
                    return null;
                const newStart = addDays(predecessor.dueDate, 1);
                // Only shift forward (don't pull tasks earlier than they already are)
                if (dependent.startDate && newStart <= dependent.startDate)
                    return null;
                const newDue = durationDays > 0 ? addDays(newStart, durationDays) : undefined;
                return { startDate: newStart, dueDate: newDue ?? dependent.dueDate };
            }
            case "SS": {
                // Start-to-Start: dependent starts when predecessor starts
                if (!predecessor.startDate)
                    return null;
                const newStart = predecessor.startDate;
                if (dependent.startDate && newStart <= dependent.startDate)
                    return null;
                const newDue = durationDays > 0 ? addDays(newStart, durationDays) : undefined;
                return { startDate: newStart, dueDate: newDue ?? dependent.dueDate };
            }
            case "FF": {
                // Finish-to-Finish: dependent finishes when predecessor finishes
                if (!predecessor.dueDate)
                    return null;
                const newDue = predecessor.dueDate;
                if (dependent.dueDate && newDue <= dependent.dueDate)
                    return null;
                const newStart = durationDays > 0 ? addDays(newDue, -durationDays) : undefined;
                return { startDate: newStart ?? dependent.startDate, dueDate: newDue };
            }
            case "SF": {
                // Start-to-Finish: dependent finishes when predecessor starts
                if (!predecessor.startDate)
                    return null;
                const newDue = predecessor.startDate;
                if (dependent.dueDate && newDue <= dependent.dueDate)
                    return null;
                const newStart = durationDays > 0 ? addDays(newDue, -durationDays) : undefined;
                return { startDate: newStart ?? dependent.startDate, dueDate: newDue };
            }
            default:
                return null;
        }
    }
    async deleteTask(id) {
        // Get task before deleting for sync purposes
        const task = this.tasks.find(t => t.id === id);
        const deletedParentId = task?.parentId;
        // Find children of the task being deleted
        const children = this.tasks.filter(t => t.parentId === id);
        // Promote children to top-level tasks (orphan handling)
        for (const child of children) {
            child.parentId = null;
        }
        // Remove the task itself
        this.tasks = this.tasks.filter(t => t.id !== id);
        this.taskIndex.delete(id);
        this.updateProjectTimestamp();
        await this.saveQuietly();
        // Delete markdown note if enabled
        if (task && this.plugin.settings.enableMarkdownSync && this.plugin.settings.autoCreateTaskNotes) {
            const project = this.plugin.settings.projects.find(p => p.id === this.activeProjectId);
            if (project) {
                await this.plugin.taskSync.deleteTaskMarkdown(task, project.name);
            }
        }
        // Roll up parent after child deletion
        if (this.plugin.settings.enableParentRollUp && deletedParentId) {
            await this.rollUpParentFields(deletedParentId);
        }
        // Single emit after all work is done
        this.emit();
    }
    async setOrder(ids) {
        const idToTask = new Map(this.tasks.map((t) => [t.id, t]));
        this.tasks = ids
            .map((id) => idToTask.get(id))
            .filter((t) => !!t);
        this.rebuildIndex();
        await this.save();
    }
    async toggleCollapsed(id) {
        const task = this.tasks.find((t) => t.id === id);
        if (!task)
            return;
        task.collapsed = !task.collapsed;
        await this.save();
    }
    async makeSubtask(taskId, parentId) {
        const task = this.tasks.find((t) => t.id === taskId);
        if (!task)
            return;
        const oldParentId = task.parentId;
        task.parentId = parentId;
        await this.saveQuietly();
        // Roll up both new and old parent
        if (this.plugin.settings.enableParentRollUp) {
            await this.rollUpParentFields(parentId);
            if (oldParentId)
                await this.rollUpParentFields(oldParentId);
        }
        // Single emit after all work is done
        this.emit();
    }
    getTaskById(id) {
        return this.taskIndex.get(id);
    }
    getTasks() {
        return this.tasks;
    }
    async promoteSubtask(taskId) {
        const task = this.tasks.find((t) => t.id === taskId);
        if (!task)
            return;
        const oldParentId = task.parentId;
        task.parentId = null;
        await this.saveQuietly();
        // Roll up old parent after losing a child
        if (this.plugin.settings.enableParentRollUp && oldParentId) {
            await this.rollUpParentFields(oldParentId);
        }
        // Single emit after all work is done
        this.emit();
    }
    updateProjectTimestamp() {
        const activeProject = this.plugin.settings.projects.find(p => p.id === this.plugin.settings.activeProjectId);
        if (activeProject) {
            activeProject.lastUpdatedDate = new Date().toISOString();
        }
    }
}

/**
 * Handles bidirectional synchronization between plugin JSON data and vault markdown notes.
 * Tasks are stored as markdown files with YAML frontmatter in {ProjectName}/Tasks/{TaskTitle}.md
 */
class TaskSync {
    constructor(app, plugin) {
        this.syncInProgress = new Set(); // Prevent infinite loops
        this.app = app;
        this.plugin = plugin;
    }
    /**
     * Convert a PlannerTask to YAML frontmatter + markdown content
     */
    taskToMarkdown(task, projectName) {
        const yaml = {
            id: task.id,
            title: task.title,
            status: task.status,
            completed: task.completed,
        };
        // Optional fields
        if (task.parentId)
            yaml.parentId = task.parentId;
        if (task.priority)
            yaml.priority = task.priority;
        if (task.bucketId)
            yaml.bucketId = task.bucketId;
        if (task.startDate)
            yaml.startDate = task.startDate;
        if (task.dueDate)
            yaml.dueDate = task.dueDate;
        if (task.createdDate)
            yaml.createdDate = task.createdDate;
        if (task.lastModifiedDate)
            yaml.lastModifiedDate = task.lastModifiedDate;
        if (task.tags && task.tags.length > 0)
            yaml.tags = task.tags;
        if (task.collapsed !== undefined)
            yaml.collapsed = task.collapsed;
        // Effort tracking
        if (task.effortCompleted != null && task.effortCompleted > 0)
            yaml.effortCompleted = task.effortCompleted;
        if (task.effortRemaining != null && task.effortRemaining > 0)
            yaml.effortRemaining = task.effortRemaining;
        if (task.percentComplete != null && task.percentComplete > 0)
            yaml.percentComplete = task.percentComplete;
        // Dependencies
        if (task.dependencies && task.dependencies.length > 0) {
            yaml.dependencies = task.dependencies.map(d => `${d.type}:${d.predecessorId}`);
        }
        // Build content
        let content = `---\n`;
        for (const [key, value] of Object.entries(yaml)) {
            if (Array.isArray(value)) {
                content += `${key}:\n`;
                value.forEach(v => content += `  - ${v}\n`);
            }
            else {
                content += `${key}: ${value}\n`;
            }
        }
        content += `---\n\n`;
        // Description
        if (task.description) {
            content += `${task.description}\n\n`;
        }
        // Subtasks
        if (task.subtasks && task.subtasks.length > 0) {
            content += `## Subtasks\n\n`;
            task.subtasks.forEach(st => {
                const checkbox = st.completed ? '[x]' : '[ ]';
                content += `- ${checkbox} ${st.title}\n`;
            });
            content += `\n`;
        }
        // Dependencies (as links)
        if (task.dependencies && task.dependencies.length > 0) {
            content += `## Dependencies\n\n`;
            task.dependencies.forEach(dep => {
                const depTask = this.plugin.taskStore.getTaskById(dep.predecessorId);
                if (depTask) {
                    content += `- ${dep.type}: [[${depTask.title}]]\n`;
                }
            });
            content += `\n`;
        }
        // Links
        if (task.links && task.links.length > 0) {
            content += `## Links\n\n`;
            task.links.forEach(link => {
                if (link.type === "obsidian") {
                    content += `- [[${link.url}]]\n`;
                }
                else {
                    content += `- [${link.url}](${link.url})\n`;
                }
            });
            content += `\n`;
        }
        // Footer
        content += `---\n*Task from Project: ${projectName}*\n`;
        return content;
    }
    /**
     * Convert YAML frontmatter + markdown to a PlannerTask
     */
    async markdownToTask(file, projectId) {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter)
            return null;
        const fm = cache.frontmatter;
        // Required fields
        if (!fm.id || !fm.title)
            return null;
        const task = {
            id: fm.id,
            title: fm.title,
            status: fm.status || "Not Started",
            completed: fm.completed === true,
        };
        // Optional fields
        if (fm.parentId)
            task.parentId = fm.parentId;
        if (fm.priority)
            task.priority = fm.priority;
        if (fm.bucketId)
            task.bucketId = fm.bucketId;
        if (fm.startDate)
            task.startDate = fm.startDate;
        if (fm.dueDate)
            task.dueDate = fm.dueDate;
        if (fm.createdDate)
            task.createdDate = fm.createdDate;
        if (fm.lastModifiedDate)
            task.lastModifiedDate = fm.lastModifiedDate;
        if (fm.tags)
            task.tags = Array.isArray(fm.tags) ? fm.tags : [fm.tags];
        if (fm.collapsed !== undefined)
            task.collapsed = fm.collapsed;
        // Effort tracking
        if (fm.effortCompleted != null)
            task.effortCompleted = Number(fm.effortCompleted) || 0;
        if (fm.effortRemaining != null)
            task.effortRemaining = Number(fm.effortRemaining) || 0;
        if (fm.percentComplete != null)
            task.percentComplete = Number(fm.percentComplete) || 0;
        // Dependencies
        if (fm.dependencies && Array.isArray(fm.dependencies)) {
            task.dependencies = fm.dependencies.map((d) => {
                const [type, predecessorId] = d.split(':');
                return {
                    type: type,
                    predecessorId,
                };
            });
        }
        // Read file content to parse description, subtasks, and links
        try {
            const content = await this.app.vault.read(file);
            const parsed = this.parseMarkdownContent(content);
            if (parsed.description)
                task.description = parsed.description;
            if (parsed.subtasks && parsed.subtasks.length > 0)
                task.subtasks = parsed.subtasks;
            if (parsed.links && parsed.links.length > 0)
                task.links = parsed.links;
        }
        catch (error) {
            console.error('Error reading task file:', error);
        }
        return task;
    }
    /**
     * Parse markdown content to extract description, subtasks, and links
     */
    parseMarkdownContent(content) {
        const result = {};
        // Split content by frontmatter
        const parts = content.split('---');
        if (parts.length < 3)
            return result;
        // Get content after frontmatter
        let bodyContent = parts.slice(2).join('---').trim();
        // Extract description (content before first ## heading)
        const firstHeadingMatch = bodyContent.match(/^##\s/m);
        if (firstHeadingMatch) {
            const descriptionEnd = firstHeadingMatch.index || 0;
            result.description = bodyContent.substring(0, descriptionEnd).trim();
            bodyContent = bodyContent.substring(descriptionEnd);
        }
        else {
            // No headings found, check if there's content before the footer
            const footerMatch = bodyContent.match(/\n---\n\*Task from Project:/);
            if (footerMatch) {
                result.description = bodyContent.substring(0, footerMatch.index).trim();
            }
            else {
                result.description = bodyContent.trim();
            }
            return result; // No sections to parse
        }
        // Parse subtasks section
        const subtasksMatch = bodyContent.match(/##\s+Subtasks\s*\n([\s\S]*?)(?=\n##|\n---|\n*$)/);
        if (subtasksMatch) {
            const subtasksText = subtasksMatch[1];
            const subtaskLines = subtasksText.split('\n').filter(line => line.trim().startsWith('-'));
            const parsedSubtasks = [];
            subtaskLines.forEach(line => {
                const checkboxMatch = line.match(/- \[([ x])\]\s*(.+)/);
                if (checkboxMatch) {
                    parsedSubtasks.push({
                        id: crypto.randomUUID(),
                        title: checkboxMatch[2].trim(),
                        completed: checkboxMatch[1] === 'x',
                    });
                }
            });
            result.subtasks = parsedSubtasks;
        }
        // Parse links section
        const linksMatch = bodyContent.match(/##\s+Links\s*\n([\s\S]*?)(?=\n##|\n---|\n*$)/);
        if (linksMatch) {
            const linksText = linksMatch[1];
            const linkLines = linksText.split('\n').filter(line => line.trim().startsWith('-'));
            const parsedLinks = [];
            linkLines.forEach(line => {
                // Obsidian internal link: - [[Link]]
                const obsidianMatch = line.match(/- \[\[([^\]]+)\]\]/);
                if (obsidianMatch) {
                    parsedLinks.push({
                        id: crypto.randomUUID(),
                        title: obsidianMatch[1],
                        url: obsidianMatch[1],
                        type: 'obsidian',
                    });
                    return;
                }
                // External link: - [url](url) or - [title](url)
                const externalMatch = line.match(/- \[([^\]]+)\]\(([^\)]+)\)/);
                if (externalMatch) {
                    parsedLinks.push({
                        id: crypto.randomUUID(),
                        title: externalMatch[1],
                        url: externalMatch[2],
                        type: 'external',
                    });
                }
            });
            result.links = parsedLinks;
        }
        return result;
    }
    /**
     * Get the file path for a task's markdown note
     */
    getTaskFilePath(task, projectName) {
        // Sanitize title for filename
        const safeName = task.title.replace(/[\\/:*?"<>|]/g, '-');
        const basePath = this.plugin.settings.projectsBasePath;
        if (basePath) {
            return `${basePath}/${projectName}/Tasks/${safeName}.md`;
        }
        return `${projectName}/Tasks/${safeName}.md`;
    }
    /**
     * Handle task rename by deleting old file and creating new one
     */
    async handleTaskRename(task, oldTitle, projectId) {
        const project = this.plugin.settings.projects.find(p => p.id === projectId);
        if (!project)
            return;
        // Get old file path using old title
        const oldTask = { ...task, title: oldTitle };
        const oldFilePath = this.getTaskFilePath(oldTask, project.name);
        // Delete old file if it exists
        const oldFile = this.app.vault.getAbstractFileByPath(oldFilePath);
        if (oldFile instanceof obsidian.TFile) {
            try {
                await this.app.vault.delete(oldFile);
                console.log(`[TaskSync] Deleted old task file: ${oldFilePath}`);
            }
            catch (error) {
                console.error(`[TaskSync] Failed to delete old file: ${oldFilePath}`, error);
            }
        }
        // Create new file with updated title
        await this.syncTaskToMarkdown(task, projectId);
    }
    /**
     * Sync a task from JSON to markdown (create or update the note)
     * Forward sync (task→markdown) is always allowed — the syncInProgress
     * guard only blocks reverse sync (markdown→task) to prevent infinite loops.
     */
    async syncTaskToMarkdown(task, projectId) {
        const project = this.plugin.settings.projects.find(p => p.id === projectId);
        if (!project)
            return;
        const filePath = this.getTaskFilePath(task, project.name);
        // Mark forward sync in progress so reverse sync (md→task) is blocked.
        // Always allow forward writes — reset timer if already set.
        this.syncInProgress.add(task.id);
        try {
            const content = this.taskToMarkdown(task, project.name);
            const existingFile = this.app.vault.getAbstractFileByPath(filePath);
            if (existingFile instanceof obsidian.TFile) {
                await this.app.vault.modify(existingFile, content);
            }
            else {
                // Ensure parent folders exist
                const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
                const folder = this.app.vault.getAbstractFileByPath(folderPath);
                if (!folder) {
                    try {
                        await this.app.vault.createFolder(folderPath);
                    }
                    catch {
                        // Folder may already exist from a concurrent sync
                    }
                }
                await this.app.vault.create(filePath, content);
            }
        }
        finally {
            // Keep guard up for 1s to block the reverse metadata-cache event
            setTimeout(() => this.syncInProgress.delete(task.id), 1000);
        }
    }
    /**
     * Sync a task from markdown to JSON (update the plugin data)
     */
    async syncMarkdownToTask(file, projectId) {
        const task = await this.markdownToTask(file, projectId);
        if (!task)
            return;
        // Prevent infinite loop
        if (this.syncInProgress.has(task.id)) {
            return;
        }
        this.syncInProgress.add(task.id);
        try {
            const existingTask = this.plugin.taskStore.getTaskById(task.id);
            if (existingTask) {
                // Check if title changed in markdown - if so, rename the file
                const titleChanged = existingTask.title !== task.title;
                // Update existing task (always update to ensure markdown is source of truth)
                // Don't use updateTask as it triggers lastModifiedDate change
                // Instead use addTaskFromObject which handles merging
                await this.plugin.taskStore.addTaskFromObject(task);
                // If title changed, rename the markdown file to match new title
                if (titleChanged) {
                    const project = this.plugin.settings.projects.find(p => p.id === projectId);
                    if (project) {
                        const newFilePath = this.getTaskFilePath(task, project.name);
                        // Only rename if the file path actually changed
                        if (file.path !== newFilePath) {
                            try {
                                await this.app.fileManager.renameFile(file, newFilePath);
                                console.log(`[TaskSync] Renamed task file from ${file.path} to ${newFilePath}`);
                            }
                            catch (error) {
                                console.error(`[TaskSync] Failed to rename file:`, error);
                            }
                        }
                    }
                }
            }
            else {
                // Task doesn't exist in JSON - new task created via markdown
                await this.plugin.taskStore.addTaskFromObject(task);
            }
        }
        finally {
            // Longer timeout for Obsidian Sync delays
            setTimeout(() => this.syncInProgress.delete(task.id), 1000);
        }
    }
    /**
     * Delete a task's markdown note
     */
    async deleteTaskMarkdown(task, projectName) {
        const filePath = this.getTaskFilePath(task, projectName);
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof obsidian.TFile) {
            await this.app.vault.delete(file);
        }
    }
    /**
     * Watch for changes to markdown files in project folders
     */
    watchProjectFolder(projectId, projectName) {
        const basePath = this.plugin.settings.projectsBasePath;
        const folderPath = basePath ? `${basePath}/${projectName}/Tasks` : `${projectName}/Tasks`;
        // Track task IDs by file path so we can delete tasks after the file
        // (and its metadata cache) are gone. Obsidian clears the cache on
        // deletion, so reading it inside the 'delete' handler always returns null.
        const taskIdByPath = new Map();
        // Watch for metadata cache changes (most reliable for YAML frontmatter changes)
        this.plugin.registerEvent(this.app.metadataCache.on('changed', async (file) => {
            if (file instanceof obsidian.TFile && file.path.startsWith(folderPath) && file.extension === 'md') {
                // Keep our path→ID map up to date on every cache refresh
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache?.frontmatter?.id) {
                    taskIdByPath.set(file.path, cache.frontmatter.id);
                }
                await this.syncMarkdownToTask(file, projectId);
            }
        }));
        // Watch for file deletions — use the pre-built path→ID map
        this.plugin.registerEvent(this.app.vault.on('delete', async (file) => {
            if (file instanceof obsidian.TFile && file.path.startsWith(folderPath) && file.extension === 'md') {
                const taskId = taskIdByPath.get(file.path);
                if (taskId) {
                    taskIdByPath.delete(file.path);
                    await this.plugin.taskStore.deleteTask(taskId);
                }
            }
        }));
        // Watch for new files (manual task creation)
        this.plugin.registerEvent(this.app.vault.on('create', async (file) => {
            if (file instanceof obsidian.TFile && file.path.startsWith(folderPath) && file.extension === 'md') {
                // Wait for metadata cache to populate
                setTimeout(async () => {
                    await this.syncMarkdownToTask(file, projectId);
                }, 1000);
            }
        }));
    }
    /**
     * Perform initial sync - scan project folder and sync all markdown files
     */
    async initialSync(projectId, projectName) {
        const project = this.plugin.settings.projects.find(p => p.id === projectId);
        if (!project)
            return;
        // Check if we've synced recently (within last 5 minutes) to avoid repeated syncs
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        if (project.lastSyncTimestamp && (now - project.lastSyncTimestamp) < fiveMinutes) {
            return;
        }
        const basePath = this.plugin.settings.projectsBasePath;
        const folderPath = basePath ? `${basePath}/${projectName}/Tasks` : `${projectName}/Tasks`;
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            return;
        }
        const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folderPath));
        // Batch process files to avoid overwhelming the system
        for (let i = 0; i < files.length; i++) {
            await this.syncMarkdownToTask(files[i], projectId);
            // Small delay between files to prevent race conditions
            if (i < files.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        // Update last sync timestamp
        project.lastSyncTimestamp = Date.now();
        await this.plugin.saveSettings();
    }
}

/**
 * Scans daily notes and other markdown files for tagged tasks
 * and automatically imports them into the appropriate project.
 *
 * Supports tag patterns like:
 * - #planner (uses default project)
 * - #planner/ProjectName (adds to specific project)
 * - Custom patterns defined in settings
 */
class DailyNoteTaskScanner {
    constructor(app, plugin) {
        this.processedTasks = new Set(); // Track task IDs to avoid duplicates
        this.scanTimeout = null;
        this.pendingScans = new Set(); // Track files pending scan
        // Map: "filePath:lineNumber" -> taskId to track task locations (persisted to settings)
        this.taskLocationMap = new Map();
        this.app = app;
        this.plugin = plugin;
        this.loadTaskLocationMap();
    }
    /**
     * Load taskLocationMap from persisted settings
     */
    loadTaskLocationMap() {
        const saved = this.plugin.settings.dailyNoteTaskLocations;
        if (saved) {
            this.taskLocationMap = new Map(Object.entries(saved));
        }
    }
    /**
     * Save taskLocationMap to persisted settings
     */
    async saveTaskLocationMap() {
        this.plugin.settings.dailyNoteTaskLocations = Object.fromEntries(this.taskLocationMap);
        await this.plugin.saveSettings();
    }
    /**
     * Generate a stable ID for a task from a daily note.
     * Uses the persisted taskLocationMap to return the same ID for a known
     * file+line, falling back to crypto.randomUUID() for genuinely new tasks.
     */
    generateStableTaskId(file, taskContent, locationKey) {
        // If we already have a persisted ID for this location, reuse it
        if (locationKey && this.taskLocationMap.has(locationKey)) {
            return this.taskLocationMap.get(locationKey);
        }
        // New task — assign a proper UUID
        return `daily-task-${crypto.randomUUID()}`;
    }
    /**
     * Find existing task by content similarity to avoid duplicates
     */
    findDuplicateTaskByContent(title) {
        // Get all tasks from TaskStore (across all projects)
        const allTasks = this.plugin.taskStore.getAll();
        const normalizedTitle = title.trim().toLowerCase();
        // Find tasks with matching title that were imported from daily notes
        // Note: Since TaskStore.getAll() returns tasks from active project only,
        // we can assume any daily-task- ID found is in the current project
        const duplicates = allTasks.filter(t => {
            if (!t.id.startsWith('daily-task-'))
                return false;
            if (t.title.trim().toLowerCase() !== normalizedTitle)
                return false;
            return true;
        });
        return duplicates.length > 0 ? duplicates[0] : null;
    }
    /**
     * Extract project name from a tag pattern
     * Examples:
     * - "#planner/Project Planner" -> "Project Planner"
     * - "#planner/Project-Planner" -> "Project Planner"
     * - "#planner" -> null (use default)
     */
    extractProjectFromTag(tag) {
        const basePattern = this.plugin.settings.dailyNoteTagPattern.replace('#', '');
        // Match format: #planner/Project-Name (hyphens for spaces)
        // Captures non-whitespace characters after the slash (tag ends at whitespace)
        const regex = new RegExp(`#${basePattern}/([^\\s#]+)`, 'i');
        const match = tag.match(regex);
        if (!match)
            return null;
        // Clean up the project name and replace hyphens with spaces
        let projectName = match[1].trim();
        projectName = projectName.replace(/-/g, ' ');
        return projectName;
    }
    /**
     * Find the project ID by name or use default
     */
    findProjectId(projectName) {
        if (projectName) {
            const project = this.plugin.settings.projects.find(p => p.name.toLowerCase() === projectName.toLowerCase());
            return project?.id || null;
        }
        return this.plugin.settings.dailyNoteDefaultProject || null;
    }
    /**
     * Check if a line contains a task with the tag pattern
     */
    isTaggedTask(line) {
        const basePattern = this.plugin.settings.dailyNoteTagPattern.replace('#', '');
        // Match task lines: - [ ] or - [x] or - [X]
        const taskRegex = /^[\s]*-\s+\[([ xX])\]\s+(.+)/;
        const tagRegex = new RegExp(`#${basePattern}(?:/[^\\s#]+)?`, 'i');
        return taskRegex.test(line) && tagRegex.test(line);
    }
    /**
     * Parse a tagged task line into a PlannerTask object
     */
    async parseTaskLine(line, file, lineNumber) {
        const taskRegex = /^[\s]*-\s+\[([ xX])\]\s+(.+)/;
        const match = line.match(taskRegex);
        if (!match)
            return null;
        const isCompleted = match[1].toLowerCase() === 'x';
        const taskContent = match[2].trim();
        // Extract tags
        const basePattern = this.plugin.settings.dailyNoteTagPattern.replace('#', '');
        const tagRegex = new RegExp(`#${basePattern}(?:/([^\\s#]+))?`, 'gi');
        const tags = [];
        let tagMatch;
        while ((tagMatch = tagRegex.exec(taskContent)) !== null) {
            if (tagMatch[1]) {
                tagMatch[1];
            }
            tags.push(tagMatch[0]);
        }
        // Remove tags from title
        let title = taskContent;
        tags.forEach(tag => {
            title = title.replace(tag, '').trim();
        });
        // Extract priority from text (e.g., "!!!" or "🔴" or "(high)")
        let priority;
        const priorityPatterns = [
            { pattern: /!!!/g, value: "Critical" },
            { pattern: /!!/g, value: "High" },
            { pattern: /!/g, value: "Medium" },
            { pattern: /\(critical\)/gi, value: "Critical" },
            { pattern: /\(high\)/gi, value: "High" },
            { pattern: /\(medium\)/gi, value: "Medium" },
            { pattern: /\(low\)/gi, value: "Low" },
        ];
        for (const { pattern, value } of priorityPatterns) {
            if (pattern.test(title)) {
                priority = value;
                title = title.replace(pattern, '').trim();
                break;
            }
        }
        // Extract due date from text (e.g., "📅 2026-01-15" or "due: 2026-01-15")
        let dueDate;
        const dueDatePatterns = [
            /📅\s*(\d{4}-\d{2}-\d{2})/,
            /due:\s*(\d{4}-\d{2}-\d{2})/i,
            /@(\d{4}-\d{2}-\d{2})/,
        ];
        for (const pattern of dueDatePatterns) {
            const dateMatch = title.match(pattern);
            if (dateMatch) {
                dueDate = dateMatch[1];
                title = title.replace(pattern, '').trim();
                break;
            }
        }
        // Extract additional tags (excluding planner tag)
        const additionalTagRegex = /#([^\s#]+)/g;
        const additionalTags = [];
        let additionalTagMatch;
        while ((additionalTagMatch = additionalTagRegex.exec(taskContent)) !== null) {
            const tag = additionalTagMatch[1];
            if (!tag.startsWith(basePattern)) {
                // Find matching tag in settings
                const matchedTag = this.plugin.settings.availableTags.find(t => t.name.toLowerCase() === tag.toLowerCase());
                if (matchedTag) {
                    additionalTags.push(matchedTag.id);
                }
            }
        }
        // Generate location key for tracking (file path + line number)
        const locationKey = `${file.path}:${lineNumber}`;
        // Check if we already have a task at this location
        let taskId = this.taskLocationMap.get(locationKey);
        let isNewTask = !taskId;
        // If no existing task at this location, try to find by content similarity
        if (!taskId) {
            // Check for duplicate by title before generating a new ID
            const duplicate = this.findDuplicateTaskByContent(title);
            if (duplicate) {
                taskId = duplicate.id;
                isNewTask = false;
            }
            else {
                taskId = this.generateStableTaskId(file, title, locationKey);
                isNewTask = true;
            }
            // Always update location map for future lookups
            this.taskLocationMap.set(locationKey, taskId);
        }
        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().slice(0, 10);
        // Create the task object with source tracking
        const task = {
            id: taskId,
            title: title,
            completed: isCompleted,
            status: isCompleted ? "Completed" : "Not Started",
            description: `Imported from: [[${file.basename}]]\nLine: ${lineNumber + 1}`,
        };
        // Set timestamps
        if (isNewTask) {
            task.createdDate = today;
        }
        task.lastModifiedDate = today;
        if (priority)
            task.priority = priority;
        if (dueDate)
            task.dueDate = dueDate;
        if (additionalTags.length > 0)
            task.tags = additionalTags;
        // Add link back to the source note
        task.links = [{
                id: crypto.randomUUID(),
                title: file.basename,
                url: file.path,
                type: "obsidian",
            }];
        return { task, locationKey };
    }
    /**
     * Schedule a debounced scan of a file
     */
    scheduleScan(file) {
        this.pendingScans.add(file.path);
        if (this.scanTimeout) {
            clearTimeout(this.scanTimeout);
        }
        this.scanTimeout = setTimeout(async () => {
            const paths = Array.from(this.pendingScans);
            this.pendingScans.clear();
            for (const path of paths) {
                const fileToScan = this.app.vault.getAbstractFileByPath(path);
                if (fileToScan instanceof obsidian.TFile) {
                    await this.scanFile(fileToScan);
                }
            }
        }, 1000); // Wait 1 second after last change
    }
    /**
     * Scan a single file for tagged tasks
     */
    async scanFile(file) {
        if (file.extension !== 'md')
            return;
        // Check if file is in scan folders (if specified)
        if (this.plugin.settings.dailyNoteScanFolders.length > 0) {
            const shouldScan = this.plugin.settings.dailyNoteScanFolders.some(folder => file.path.startsWith(folder));
            if (!shouldScan)
                return;
        }
        const content = await this.app.vault.read(file);
        const lines = content.split('\n');
        const currentFileTasks = new Set(); // Track task IDs in this file
        // File-local dedup: prevents duplicate lines within the same file from
        // being processed twice, while still allowing re-scans of modified files.
        const locallyProcessed = new Set();
        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber];
            if (this.isTaggedTask(line)) {
                const result = await this.parseTaskLine(line, file, lineNumber);
                if (result) {
                    const { task, locationKey } = result;
                    // Track that we found a task at this location
                    currentFileTasks.add(locationKey);
                    // Check if task already processed in this file or batch
                    if (locallyProcessed.has(task.id)) {
                        continue;
                    }
                    // Extract project name from tag
                    const projectName = this.extractProjectFromTag(line);
                    const projectId = this.findProjectId(projectName);
                    if (!projectId) {
                        console.warn(`[DailyNoteScanner] No project found for task: ${task.title}. Project name from tag: ${projectName || 'none (using default)'}`);
                        console.warn(`[DailyNoteScanner] Available projects:`, this.plugin.settings.projects.map(p => p.name));
                        console.warn(`[DailyNoteScanner] Default project ID:`, this.plugin.settings.dailyNoteDefaultProject);
                        continue;
                    }
                    // Check if task already exists by ID
                    const existingTask = this.plugin.taskStore.getTaskById(task.id);
                    if (!existingTask) {
                        // Double-check for content-based duplicates before adding
                        const contentDuplicate = this.findDuplicateTaskByContent(task.title);
                        if (contentDuplicate) {
                            console.log(`[DailyNoteScanner] Found duplicate by content, updating existing task: ${task.title}`);
                            // Update the existing duplicate instead of creating new task
                            await this.plugin.taskStore.updateTask(contentDuplicate.id, task);
                            // Update location map to point to existing task
                            this.taskLocationMap.set(locationKey, contentDuplicate.id);
                            locallyProcessed.add(contentDuplicate.id);
                            this.processedTasks.add(contentDuplicate.id);
                        }
                        else {
                            // No duplicates found, add new task
                            await this.plugin.taskStore.addTaskToProject(task, projectId);
                            locallyProcessed.add(task.id);
                            this.processedTasks.add(task.id);
                        }
                    }
                    else {
                        // Update existing task (content may have changed)
                        await this.plugin.taskStore.updateTask(task.id, task);
                        locallyProcessed.add(task.id);
                        this.processedTasks.add(task.id);
                    }
                }
            }
        }
        // Clean up location map entries for tasks that were removed from this file
        const allKeysForFile = Array.from(this.taskLocationMap.keys()).filter(key => key.startsWith(`${file.path}:`));
        let removedCount = 0;
        for (const key of allKeysForFile) {
            if (!currentFileTasks.has(key)) {
                // Task was removed from this location
                this.taskLocationMap.get(key);
                this.taskLocationMap.delete(key);
                removedCount++;
                // Optionally: Delete task from TaskStore if it no longer exists in any file
                // (only if we're confident about this - could be handled by user manually)
                // await this.plugin.taskStore.deleteTask(removedTaskId);
            }
        }
        // Save location map if any changes were made
        if (removedCount > 0 || currentFileTasks.size > 0) {
            await this.saveTaskLocationMap();
        }
    }
    /**
     * Scan all notes in the vault for tagged tasks
     */
    async scanAllNotes() {
        this.processedTasks.clear();
        const files = this.app.vault.getMarkdownFiles();
        let tasksFound = 0;
        for (const file of files) {
            const beforeCount = this.processedTasks.size;
            await this.scanFile(file);
            const afterCount = this.processedTasks.size;
            tasksFound += (afterCount - beforeCount);
        }
        new obsidian.Notice(`Imported ${tasksFound} tasks from daily notes`);
    }
    /**
     * Watch for changes to files and scan them
     */
    setupWatchers() {
        // Watch for file modifications
        this.plugin.registerEvent(this.app.vault.on('modify', (file) => {
            if (file instanceof obsidian.TFile) {
                this.scheduleScan(file);
            }
        }));
        // Watch for new files
        this.plugin.registerEvent(this.app.vault.on('create', (file) => {
            if (file instanceof obsidian.TFile) {
                this.scheduleScan(file);
            }
        }));
        // Watch for file deletions to clean up location map
        this.plugin.registerEvent(this.app.vault.on('delete', (file) => {
            if (file instanceof obsidian.TFile) {
                this.handleFileDelete(file);
            }
        }));
        // Watch for file renames to update location map
        this.plugin.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof obsidian.TFile) {
                this.handleFileRename(file, oldPath);
            }
        }));
    }
    /**
     * Handle file deletion - clean up location map
     */
    async handleFileDelete(file) {
        const keysToDelete = Array.from(this.taskLocationMap.keys())
            .filter(key => key.startsWith(`${file.path}:`));
        if (keysToDelete.length > 0) {
            keysToDelete.forEach(key => this.taskLocationMap.delete(key));
            await this.saveTaskLocationMap();
            console.log(`[DailyNoteScanner] Cleaned up ${keysToDelete.length} location entries for deleted file: ${file.path}`);
        }
    }
    /**
     * Handle file rename - update location map with new paths
     */
    async handleFileRename(file, oldPath) {
        const oldKeys = Array.from(this.taskLocationMap.keys())
            .filter(key => key.startsWith(`${oldPath}:`));
        if (oldKeys.length > 0) {
            const updates = [];
            // Create new keys with updated file path
            oldKeys.forEach(oldKey => {
                const taskId = this.taskLocationMap.get(oldKey);
                if (taskId) {
                    // Extract line number from old key (split on last colon to handle paths containing ':')
                    const lastColon = oldKey.lastIndexOf(':');
                    const lineNumber = lastColon !== -1 ? oldKey.substring(lastColon + 1) : oldKey;
                    const newKey = `${file.path}:${lineNumber}`;
                    updates.push([oldKey, newKey]);
                }
            });
            // Apply updates
            updates.forEach(([oldKey, newKey]) => {
                const taskId = this.taskLocationMap.get(oldKey);
                if (taskId) {
                    this.taskLocationMap.delete(oldKey);
                    this.taskLocationMap.set(newKey, taskId);
                }
            });
            await this.saveTaskLocationMap();
            console.log(`[DailyNoteScanner] Updated ${updates.length} location entries for renamed file: ${oldPath} → ${file.path}`);
        }
    }
    /**
     * Perform a quick scan and provide user feedback
     */
    async quickScan() {
        new obsidian.Notice('Scanning for tagged tasks...');
        await this.scanAllNotes();
    }
}

// Internal plugin view type
const VIEW_TYPE_PLANNER = "project-planner-view";
class ProjectPlannerPlugin extends obsidian.Plugin {
    constructor() {
        super(...arguments);
        this.inlineStyleEl = null;
    }
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
        // Ribbon icons (conditionally added based on settings)
        if (this.settings.showRibbonIconGrid) {
            this.addRibbonIcon("calendar-check", "Open Project Planner", async () => {
                await this.activateView();
            });
        }
        if (this.settings.showRibbonIconDashboard) {
            this.addRibbonIcon("layout-dashboard", "Open Dashboard", async () => {
                await this.activateDashboardView();
            });
        }
        if (this.settings.showRibbonIconBoard) {
            this.addRibbonIcon("layout-grid", "Open Board View", async () => {
                await this.activateBoardView();
            });
        }
        if (this.settings.showRibbonIconGraph) {
            this.addRibbonIcon("git-fork", "Open Dependency Graph", async () => {
                await this.openDependencyGraph();
            });
        }
        // Add ribbon icon for daily note scanning (if enabled in both settings)
        if (this.settings.enableDailyNoteSync && this.settings.showRibbonIconDailyNoteScan) {
            this.addRibbonIcon("scan", "Scan Daily Notes for Tasks", async () => {
                await this.dailyNoteScanner.quickScan();
            });
        }
        // Register main GridView
        this.registerView(VIEW_TYPE_PLANNER, (leaf) => new GridView(leaf, this));
        // Register Board View
        this.registerView(VIEW_TYPE_BOARD, (leaf) => new BoardView(leaf, this));
        // Register right-side Task Detail Panel
        this.registerView(VIEW_TYPE_TASK_DETAIL, (leaf) => new TaskDetailView(leaf, this));
        // Register Dependency Graph View
        this.registerView(VIEW_TYPE_DEPENDENCY_GRAPH, (leaf) => new DependencyGraphView(leaf, this));
        // Register Gantt View (Timeline)
        this.registerView(VIEW_TYPE_GANTT, (leaf) => new GanttView(leaf, this));
        // Register Dashboard View
        this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));
        // Register My Tasks View
        this.registerView(VIEW_TYPE_MY_DAY, (leaf) => new MyDayView(leaf, this));
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
        // Command: Open My Tasks
        this.addCommand({
            id: "open-my-day-view",
            name: "Open My Tasks",
            callback: async () => await this.activateMyDayView(),
        });
        // Command: Scan Daily Notes
        this.addCommand({
            id: "scan-daily-notes",
            name: "Scan Daily Notes for Tagged Tasks",
            callback: async () => {
                if (this.settings.enableDailyNoteSync) {
                    await this.dailyNoteScanner.quickScan();
                }
                else {
                    new obsidian.Notice('Daily note scanning is disabled. Enable it in settings.');
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
    migrateProjectTimestamps() {
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
    async ensureStylesheetLoaded() {
        const head = document.head;
        const hasLink = Array.from(head.querySelectorAll('link[rel="stylesheet"]'))
            .some((l) => l.href.includes(this.manifest.id) && l.href.endsWith("styles.css"));
        if (hasLink)
            return;
        try {
            // Attempt to read stylesheet directly from vault (plugin is inside .obsidian/plugins)
            const cssPath = `.obsidian/plugins/${this.manifest.id}/styles.css`;
            const adapter = this.app.vault.adapter;
            if (adapter instanceof obsidian.FileSystemAdapter) {
                const css = await adapter.read(cssPath);
                if (css && typeof css === 'string') {
                    const styleEl = document.createElement('style');
                    styleEl.id = `${this.manifest.id}-inline-style`;
                    styleEl.textContent = css;
                    head.appendChild(styleEl);
                    this.inlineStyleEl = styleEl;
                    console.info("Project Planner: injected stylesheet inline as fallback.");
                }
            }
        }
        catch (e) {
            console.warn("Project Planner: could not auto-inject stylesheet", e);
        }
    }
    // ---------------------------------------------------------------------------
    // ---------------------------------------------------------------------------
    // Shared view opener — reduces duplication across view activation methods
    // ---------------------------------------------------------------------------
    async openViewByType(viewType, forceNewTab = false) {
        const openInNewTab = forceNewTab || this.settings?.openViewsInNewTab === true;
        let leaf;
        if (openInNewTab) {
            leaf = this.app.workspace.getLeaf('tab');
        }
        else {
            leaf = this.app.workspace.getMostRecentLeaf() ?? this.app.workspace.getLeaf(true);
        }
        await leaf.setViewState({
            type: viewType,
            active: true,
        });
        this.app.workspace.revealLeaf(leaf);
        return leaf;
    }
    // ---------------------------------------------------------------------------
    // Open MAIN planner view (center workspace)
    // ---------------------------------------------------------------------------
    async activateView(forceNewTab = false) {
        return this.openViewByType(VIEW_TYPE_PLANNER, forceNewTab);
    }
    // ---------------------------------------------------------------------------
    // Open BOARD view (center workspace)
    // ---------------------------------------------------------------------------
    async activateBoardView(forceNewTab = false) {
        return this.openViewByType(VIEW_TYPE_BOARD, forceNewTab);
    }
    // ---------------------------------------------------------------------------
    // Open DASHBOARD view (center workspace)
    // ---------------------------------------------------------------------------
    async activateDashboardView(forceNewTab = false) {
        return this.openViewByType(VIEW_TYPE_DASHBOARD, forceNewTab);
    }
    // ---------------------------------------------------------------------------
    // Open GANTT view (center workspace)
    // ---------------------------------------------------------------------------
    async activateGanttView(forceNewTab = false) {
        return this.openViewByType(VIEW_TYPE_GANTT, forceNewTab);
    }
    // ---------------------------------------------------------------------------
    // Open MY TASKS view (center workspace)
    // ---------------------------------------------------------------------------
    async activateMyDayView(forceNewTab = false) {
        return this.openViewByType(VIEW_TYPE_MY_DAY, forceNewTab);
    }
    // ---------------------------------------------------------------------------
    // Open Task Detail Panel (RIGHT-SIDE split)
    // ---------------------------------------------------------------------------
    async openTaskDetail(task) {
        const { workspace } = this.app;
        // Reuse existing detail view if possible
        let detailLeaf = workspace.getLeavesOfType(VIEW_TYPE_TASK_DETAIL)[0];
        // Otherwise create a right-hand split
        if (!detailLeaf) {
            const rightLeaf = workspace.getRightLeaf
                ? workspace.getRightLeaf(false)
                : null;
            detailLeaf = rightLeaf ?? workspace.getLeaf(true);
        }
        await detailLeaf.setViewState({
            type: VIEW_TYPE_TASK_DETAIL,
            active: true,
        });
        const view = detailLeaf.view;
        if (view && 'setTask' in view && typeof view.setTask === 'function') {
            view.setTask(task);
        }
        workspace.revealLeaf(detailLeaf);
    }
    // ---------------------------------------------------------------------------
    // Shared Task Update API — used by GridView, BoardView + TaskDetailView
    // ---------------------------------------------------------------------------
    async updateTask(id, fields) {
        await this.taskStore.updateTask(id, fields);
        // Markdown sync is already handled inside taskStore.updateTask() — no
        // need to sync again here.  The duplicate sync could trigger extra vault
        // watcher events and unnecessary re-renders.
    }
    // ---------------------------------------------------------------------------
    // Task Sync Methods
    // ---------------------------------------------------------------------------
    async initializeTaskSync() {
        const activeProject = this.settings.projects.find(p => p.id === this.settings.activeProjectId);
        if (!activeProject)
            return;
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
        const activeProject = this.settings.projects.find(p => p.id === this.settings.activeProjectId);
        if (!activeProject)
            return;
        const tasks = this.taskStore.getTasks();
        for (const task of tasks) {
            await this.taskSync.syncTaskToMarkdown(task, activeProject.id);
        }
    }
    // ---------------------------------------------------------------------------
    // Settings (non-destructive merge, supports migration)
    // ---------------------------------------------------------------------------
    async loadSettings() {
        const raw = ((await this.loadData()) || {});
        // Load settings if nested, otherwise fall back to legacy root
        const storedSettings = raw.settings ??
            raw; // legacy root-level settings
        this.settings = Object.assign({}, DEFAULT_SETTINGS, storedSettings);
        // Ensure we have at least one project
        if (!this.settings.projects || this.settings.projects.length === 0) {
            const defaultProjectId = crypto.randomUUID();
            this.settings.projects = [{ id: defaultProjectId, name: "My Project" }];
            this.settings.activeProjectId = defaultProjectId;
        }
        // Ensure activeProjectId is valid
        if (!this.settings.activeProjectId ||
            !this.settings.projects.some((p) => p.id === this.settings.activeProjectId)) {
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
        // Use TaskStore's cached data when available to avoid overwriting
        // in-flight task changes with a stale disk read (race condition).
        let raw;
        if (this.taskStore?.getCachedRawData()) {
            raw = this.taskStore.getCachedRawData();
        }
        else {
            raw = ((await this.loadData()) || {});
        }
        // Save ONLY under .settings — Preserve ALL other keys (tasksByProject, etc.)
        raw.settings = this.settings;
        await this.saveData(raw);
    }
    setActiveProject(projectId) {
        const found = this.settings.projects.find((p) => p.id === projectId);
        if (!found)
            return;
        this.settings.activeProjectId = projectId;
        void this.saveSettings();
    }
    // ---------------------------------------------------------------------------
    // Open Dependency Graph View
    // ---------------------------------------------------------------------------
    async openDependencyGraph() {
        await this.openViewByType(VIEW_TYPE_DEPENDENCY_GRAPH);
    }
    // ---------------------------------------------------------------------------
    // Open Task by ID (from URI link)
    // ---------------------------------------------------------------------------
    async openTaskById(taskId, projectId) {
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
        const task = this.taskStore.getAll().find((t) => t.id === taskId);
        if (task) {
            await this.openTaskDetail(task);
        }
        else {
            console.warn(`Task with ID ${taskId} not found`);
        }
    }
    // ---------------------------------------------------------------------------
    // Create Task Notes
    // ---------------------------------------------------------------------------
    async createTaskNotes() {
        await this.taskStore.ensureLoaded();
        const tasks = this.taskStore.getAll();
        const activeProject = this.settings.projects.find(p => p.id === this.settings.activeProjectId);
        if (!activeProject)
            return;
        const basePath = this.settings.projectsBasePath;
        const folderPath = basePath
            ? `${basePath}/${activeProject.name}/Tasks`
            : `${activeProject.name}/Tasks`;
        // Ensure folder exists
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            try {
                await this.app.vault.createFolder(folderPath);
            }
            catch {
                // Folder may already exist from a concurrent call
            }
        }
        for (const task of tasks) {
            const fileName = `${folderPath}/${task.title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
            try {
                const existingFile = this.app.vault.getAbstractFileByPath(fileName);
                let content = `# ${task.title}\n\n`;
                content += `**Status**: ${task.status}\n`;
                if (task.priority)
                    content += `**Priority**: ${task.priority}\n`;
                if (task.startDate)
                    content += `**Start Date**: ${task.startDate}\n`;
                if (task.dueDate)
                    content += `**Due Date**: ${task.dueDate}\n`;
                content += `\n---\n\n`;
                if (task.description)
                    content += `${task.description}\n\n`;
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
                        }
                        else {
                            content += `- [${link.url}](${link.url})\n`;
                        }
                    });
                    content += `\n`;
                }
                content += `\n---\n*Task from Project: ${activeProject.name}*\n`;
                if (existingFile instanceof obsidian.TFile) {
                    await this.app.vault.modify(existingFile, content);
                }
                else {
                    await this.app.vault.create(fileName, content);
                }
            }
            catch (error) {
                console.error(`Failed to create/update task note: ${fileName}`, error);
                new obsidian.Notice(`Failed to create task note: ${task.title}`);
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

module.exports = ProjectPlannerPlugin;
//# sourceMappingURL=main.js.map
