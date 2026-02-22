import type ProjectPlannerPlugin from "../main";
import { App, setIcon } from "obsidian";

type ActiveView = "grid" | "board" | "graph" | "gantt" | "dashboard";

export interface HeaderOptions {
    active: ActiveView;
    onProjectChange?: () => Promise<void> | void;
    buildExtraActions?: (actionsEl: HTMLElement) => void;
}

export function renderPlannerHeader(
    parent: HTMLElement,
    plugin: ProjectPlannerPlugin,
    options: HeaderOptions
): { headerEl: HTMLElement; actionsEl: HTMLElement } {
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
    } else {
        for (const p of projects) {
            const opt = projectSelect.createEl("option", { text: p.name, value: p.id });
            if (p.id === activeProjectId) opt.selected = true;
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
    setIcon(dashboardViewBtn, "layout-dashboard");
    dashboardViewBtn.onclick = async () => await plugin.activateDashboardView();

    const gridViewBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "grid" ? " planner-view-btn-active" : ""}`,
        title: "Grid",
    });
    setIcon(gridViewBtn, "table");
    gridViewBtn.onclick = async () => await plugin.activateView();

    const boardViewBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "board" ? " planner-view-btn-active" : ""}`,
        title: "Board",
    });
    setIcon(boardViewBtn, "layout-list");
    boardViewBtn.onclick = async () => await plugin.activateBoardView();

    const ganttViewBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "gantt" ? " planner-view-btn-active" : ""}`,
        title: "Timeline",
    });
    setIcon(ganttViewBtn, "calendar-range");
    ganttViewBtn.onclick = async () => await plugin.activateGanttView();

    const graphViewBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "graph" ? " planner-view-btn-active" : ""}`,
        title: "Graph",
    });
    setIcon(graphViewBtn, "git-fork");
    graphViewBtn.onclick = async () => await plugin.openDependencyGraph();

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
        setIcon(settingsBtn, "settings");
    } catch (_) {
        // Fallback: simple unicode cog
        settingsBtn.textContent = "⚙";
    }
    settingsBtn.onclick = () => {
        // Obsidian's settings modal API is not part of the public typings
        const app = plugin.app as App & { setting?: { open(): void; openTabById(id: string): void } };
        app.setting?.open();
        app.setting?.openTabById(plugin.manifest.id);
    };

    return { headerEl: header, actionsEl: headerActions };
}
