import type ProjectPlannerPlugin from "../main";
import { setIcon } from "obsidian";

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

    const settings: any = (plugin as any).settings || {};
    const projects = (settings.projects as { id: string; name: string }[]) || [];
    let activeProjectId = settings.activeProjectId as string | undefined;

    if (!activeProjectId && projects.length > 0) {
        activeProjectId = projects[0].id;
        settings.activeProjectId = activeProjectId;
        (plugin as any).settings = settings;
        if (typeof (plugin as any).saveSettings === "function") {
            void (plugin as any).saveSettings();
        }
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
            (plugin as any).settings = settings;
            if (typeof (plugin as any).saveSettings === "function") {
                await (plugin as any).saveSettings();
            }
            if ((plugin as any).taskStore) {
                await (plugin as any).taskStore.load();
            }
            if (typeof options.onProjectChange === "function") {
                await options.onProjectChange();
            }
        };
    }

    // View switcher
    const viewSwitcher = header.createDiv("planner-view-switcher");

    const dashboardViewBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "dashboard" ? " planner-view-btn-active" : ""}`,
        text: "Dashboard",
    });
    dashboardViewBtn.onclick = async () => await (plugin as any).activateDashboardView();

    const gridViewBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "grid" ? " planner-view-btn-active" : ""}`,
        text: "Grid",
    });
    gridViewBtn.onclick = async () => await (plugin as any).activateView();

    const boardViewBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "board" ? " planner-view-btn-active" : ""}`,
        text: "Board",
    });
    boardViewBtn.onclick = async () => await (plugin as any).activateBoardView();

    const ganttViewBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "gantt" ? " planner-view-btn-active" : ""}`,
        text: "Timeline",
    });
    ganttViewBtn.onclick = async () => await (plugin as any).activateGanttView();

    const graphViewBtn = viewSwitcher.createEl("button", {
        cls: `planner-view-btn${options.active === "graph" ? " planner-view-btn-active" : ""}`,
        text: "Graph",
    });
    graphViewBtn.onclick = async () => await (plugin as any).openDependencyGraph();

    // Header actions (Add task, extra, Project Hub, Settings)
    const headerActions = header.createDiv("planner-header-actions");

    const addBtn = headerActions.createEl("button", {
        cls: "planner-add-btn",
        text: "Add Task",
    });
    addBtn.onclick = async () => {
        await (plugin as any).taskStore.addTask("New Task");
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
        (plugin.app as any).setting.open();
        (plugin.app as any).setting.openTabById(plugin.manifest.id);
    };

    return { headerEl: header, actionsEl: headerActions };
}
