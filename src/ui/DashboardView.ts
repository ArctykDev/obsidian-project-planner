import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type ProjectPlannerPlugin from "../main";
import type { PlannerTask } from "../types";
import { renderPlannerHeader } from "./Header";

export const VIEW_TYPE_DASHBOARD = "project-planner-dashboard-view";

interface ProjectStats {
    projectId: string;
    projectName: string;
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    blockedTasks: number;
    notStartedTasks: number;
    highPriorityTasks: number;
    criticalPriorityTasks: number;
    overdueTasks: number;
    dueTodayTasks: number;
    dueThisWeekTasks: number;
    completionPercentage: number;
    tasksWithDependencies: number;
}

export class DashboardView extends ItemView {
    private plugin: ProjectPlannerPlugin;
    private unsubscribe: (() => void) | null = null;
    private showAllProjects: boolean = false;

    constructor(leaf: WorkspaceLeaf, plugin: ProjectPlannerPlugin) {
        super(leaf);
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
        await (this.plugin as any).taskStore.ensureLoaded();
        this.unsubscribe = (this.plugin as any).taskStore.subscribe(() => this.render());
        this.render();
    }

    async onClose() {
        this.containerEl.empty();
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    private calculateProjectStats(projectId: string, projectName: string, tasks: PlannerTask[]): ProjectStats {
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => t.status === "Completed").length;
        const inProgressTasks = tasks.filter(t => t.status === "In Progress").length;
        const blockedTasks = tasks.filter(t => t.status === "Blocked").length;
        const notStartedTasks = tasks.filter(t => t.status === "Not Started").length;
        const highPriorityTasks = tasks.filter(t => t.priority === "High").length;
        const criticalPriorityTasks = tasks.filter(t => t.priority === "Critical").length;

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const today = now.getTime();
        const weekFromNow = today + 7 * 24 * 60 * 60 * 1000;

        const overdueTasks = tasks.filter(t => {
            if (!t.dueDate || t.status === "Completed") return false;
            const dueDate = new Date(t.dueDate).getTime();
            return dueDate < today;
        }).length;

        const dueTodayTasks = tasks.filter(t => {
            if (!t.dueDate || t.status === "Completed") return false;
            const dueDate = new Date(t.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate.getTime() === today;
        }).length;

        const dueThisWeekTasks = tasks.filter(t => {
            if (!t.dueDate || t.status === "Completed") return false;
            const dueDate = new Date(t.dueDate).getTime();
            return dueDate >= today && dueDate <= weekFromNow;
        }).length;

        const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        const tasksWithDependencies = tasks.filter(t => t.dependencies && t.dependencies.length > 0).length;

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
            tasksWithDependencies
        };
    }

    private renderKPICard(container: HTMLElement, title: string, value: string | number, icon: string, color?: string) {
        const card = container.createDiv("dashboard-kpi-card");
        if (color) card.style.borderLeftColor = color;

        const iconEl = card.createDiv("dashboard-kpi-icon");
        setIcon(iconEl, icon);
        if (color) iconEl.style.color = color;

        const content = card.createDiv("dashboard-kpi-content");
        content.createDiv({ text: title, cls: "dashboard-kpi-title" });
        content.createDiv({ text: String(value), cls: "dashboard-kpi-value" });
    }

    private renderProgressBar(container: HTMLElement, percentage: number) {
        const barContainer = container.createDiv("dashboard-progress-container");
        const bar = barContainer.createDiv("dashboard-progress-bar");
        const fill = bar.createDiv("dashboard-progress-fill");
        fill.style.width = `${percentage}%`;

        if (percentage < 30) fill.style.backgroundColor = "#d70022";
        else if (percentage < 70) fill.style.backgroundColor = "#f59e0b";
        else fill.style.backgroundColor = "#2f9e44";

        const label = barContainer.createDiv("dashboard-progress-label");
        label.textContent = `${percentage}%`;
    }

    private renderProjectDashboard(container: HTMLElement, stats: ProjectStats) {
        const projectCard = container.createDiv("dashboard-project-card");

        // Header
        const header = projectCard.createDiv("dashboard-project-header");
        header.createEl("h2", { text: stats.projectName });

        const openBtn = header.createEl("button", { text: "Open Hub", cls: "dashboard-action-btn" });
        openBtn.onclick = async () => {
            await (this.plugin as any).hubManager.openOrCreateProjectHub(stats.projectName);
        };

        // KPI Grid
        const kpiGrid = projectCard.createDiv("dashboard-kpi-grid");

        this.renderKPICard(kpiGrid, "Total Tasks", stats.totalTasks, "list", "#6366f1");
        this.renderKPICard(kpiGrid, "Completed", stats.completedTasks, "check-circle", "#2f9e44");
        this.renderKPICard(kpiGrid, "In Progress", stats.inProgressTasks, "loader", "#0a84ff");
        this.renderKPICard(kpiGrid, "Blocked", stats.blockedTasks, "alert-circle", "#d70022");

        // Progress section
        const progressSection = projectCard.createDiv("dashboard-section");
        progressSection.createEl("h3", { text: "Completion Progress" });
        this.renderProgressBar(progressSection, stats.completionPercentage);

        // Priority & Due dates section
        const alertsGrid = projectCard.createDiv("dashboard-kpi-grid");

        this.renderKPICard(alertsGrid, "Overdue", stats.overdueTasks, "alert-triangle", "#d70022");
        this.renderKPICard(alertsGrid, "Due Today", stats.dueTodayTasks, "calendar", "#f59e0b");
        this.renderKPICard(alertsGrid, "Due This Week", stats.dueThisWeekTasks, "calendar-days", "#0a84ff");
        this.renderKPICard(alertsGrid, "Critical Priority", stats.criticalPriorityTasks, "flame", "#d70022");

        // Additional stats
        const statsGrid = projectCard.createDiv("dashboard-stats-grid");

        const statItem1 = statsGrid.createDiv("dashboard-stat-item");
        statItem1.createDiv({ text: "High Priority Tasks", cls: "dashboard-stat-label" });
        statItem1.createDiv({ text: String(stats.highPriorityTasks), cls: "dashboard-stat-value" });

        const statItem2 = statsGrid.createDiv("dashboard-stat-item");
        statItem2.createDiv({ text: "Tasks with Dependencies", cls: "dashboard-stat-label" });
        statItem2.createDiv({ text: String(stats.tasksWithDependencies), cls: "dashboard-stat-value" });

        const statItem3 = statsGrid.createDiv("dashboard-stat-item");
        statItem3.createDiv({ text: "Not Started", cls: "dashboard-stat-label" });
        statItem3.createDiv({ text: String(stats.notStartedTasks), cls: "dashboard-stat-value" });
    }

    render() {
        const container = this.containerEl;
        container.empty();

        const wrapper = container.createDiv("dashboard-wrapper");

        // Header
        renderPlannerHeader(wrapper, this.plugin, {
            active: "dashboard",
            onProjectChange: async () => {
                await (this.plugin as any).taskStore.load();
                this.render();
            }
        });

        // View mode toggle
        const toolbar = wrapper.createDiv("dashboard-toolbar");
        const toggleContainer = toolbar.createDiv("dashboard-toggle");

        const toggleLabel = toggleContainer.createSpan({ text: "Show All Projects", cls: "dashboard-toggle-label" });
        const toggleSwitch = toggleContainer.createEl("input", { type: "checkbox", cls: "dashboard-toggle-switch" });
        toggleSwitch.checked = this.showAllProjects;
        toggleSwitch.onchange = () => {
            this.showAllProjects = toggleSwitch.checked;
            this.render();
        };

        // Content
        const content = wrapper.createDiv("dashboard-content");

        const settings = (this.plugin as any).settings || {};
        const projects = settings.projects || [];
        const activeProjectId = settings.activeProjectId;

        if (this.showAllProjects) {
            // Show all projects
            if (projects.length === 0) {
                content.createEl("div", { text: "No projects found.", cls: "dashboard-empty" });
                return;
            }

            projects.forEach((project: any) => {
                // Load tasks for this project
                const projectTasks = (this.plugin as any).taskStore.getAllForProject?.(project.id) || [];
                const stats = this.calculateProjectStats(project.id, project.name, projectTasks);
                this.renderProjectDashboard(content, stats);
            });
        } else {
            // Show active project only
            const activeProject = projects.find((p: any) => p.id === activeProjectId);
            if (!activeProject) {
                content.createEl("div", { text: "No active project selected.", cls: "dashboard-empty" });
                return;
            }

            const tasks = (this.plugin as any).taskStore.getAll();
            const stats = this.calculateProjectStats(activeProject.id, activeProject.name, tasks);
            this.renderProjectDashboard(content, stats);
        }
    }
}
