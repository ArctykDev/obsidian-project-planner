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
    totalEffortCompleted: number;
    totalEffortRemaining: number;
    totalEffort: number;
    averagePercentComplete: number;
}

export class DashboardView extends ItemView {
    private plugin: ProjectPlannerPlugin;
    private unsubscribe: (() => void) | null = null;
    private showAllProjects: boolean = false;
    private savedScrollTop: number | null = null;

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
    }

    private calculateProjectStats(projectId: string, projectName: string, tasks: PlannerTask[]): ProjectStats {
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

        // Effort metrics — exclude parent tasks to avoid double-counting rolled-up values
        const parentIds = new Set(tasks.filter(t => t.parentId).map(t => t.parentId!));
        const leafTasks = tasks.filter(t => !parentIds.has(t.id));
        const totalEffortCompleted = leafTasks.reduce((sum, t) => sum + (t.effortCompleted ?? 0), 0);
        const totalEffortRemaining = leafTasks.reduce((sum, t) => sum + (t.effortRemaining ?? 0), 0);
        const totalEffort = totalEffortCompleted + totalEffortRemaining;
        const averagePercentComplete = leafTasks.length > 0
            ? Math.round(leafTasks.reduce((sum, t) => sum + (t.percentComplete ?? 0), 0) / leafTasks.length)
            : 0;

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
            averagePercentComplete
        };
    }

    private renderKPICard(
        container: HTMLElement,
        title: string,
        value: string | number,
        icon: string,
        color?: string,
        onClick?: () => void
    ) {
        const card = container.createDiv("dashboard-kpi-card");
        if (color) card.style.borderLeftColor = color;

        // Make card clickable if onClick is provided
        if (onClick) {
            card.style.cursor = "pointer";
            card.addClass("dashboard-kpi-card-clickable");
            card.onclick = onClick;
        }

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

    private showTaskListModal(title: string, tasks: PlannerTask[]) {
        const modal = document.createElement("div");
        modal.className = "dashboard-task-modal";

        const overlay = document.createElement("div");
        overlay.className = "dashboard-task-modal-overlay";
        overlay.onclick = () => {
            document.body.removeChild(modal);
            document.body.removeChild(overlay);
        };

        const content = modal.createDiv("dashboard-task-modal-content");

        // Header
        const header = content.createDiv("dashboard-task-modal-header");
        header.createEl("h3", { text: title });

        const closeBtn = header.createEl("button", {
            cls: "dashboard-task-modal-close"
        });
        const closeIcon = closeBtn.createSpan({ cls: "dashboard-task-modal-close-icon" });
        setIcon(closeIcon, "x");

        closeBtn.onclick = () => {
            document.body.removeChild(modal);
            document.body.removeChild(overlay);
        };

        // Task list
        const taskList = content.createDiv("dashboard-task-modal-list");

        if (tasks.length === 0) {
            taskList.createDiv({ text: "No tasks found", cls: "dashboard-task-modal-empty" });
        } else {
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
                    } else {
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
                    document.body.removeChild(modal);
                    document.body.removeChild(overlay);
                    this.plugin.openTaskDetail(task);
                };
            });
        }

        document.body.appendChild(overlay);
        document.body.appendChild(modal);
    }

    private getPriorityColor(priority: string): string {
        switch (priority) {
            case "Critical": return "#d70022";
            case "High": return "#f59e0b";
            case "Medium": return "#0a84ff";
            case "Low": return "#6366f1";
            default: return "#6366f1";
        }
    }

    private getStatusColor(status: string): string {
        const settings = this.plugin.settings;
        const statusObj = settings.availableStatuses?.find((s) => s.name === status);
        if (statusObj) return statusObj.color;
        
        // Fallback colors
        switch (status) {
            case "Completed": return "#2f9e44";
            case "In Progress": return "#0a84ff";
            case "Blocked": return "#d70022";
            case "Not Started": return "#6c757d";
            default: return "#6c757d";
        }
    }

    private renderProjectDashboard(container: HTMLElement, stats: ProjectStats, allTasks: PlannerTask[]) {
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

        this.renderKPICard(
            kpiGrid, "Total Tasks", stats.totalTasks, "list", "#6366f1",
            () => this.showTaskListModal("All Tasks", allTasks)
        );
        this.renderKPICard(
            kpiGrid, "Completed", stats.completedTasks, "check-circle", "#2f9e44",
            () => this.showTaskListModal("Completed Tasks", allTasks.filter(t => t.status === "Completed"))
        );
        this.renderKPICard(
            kpiGrid, "In Progress", stats.inProgressTasks, "loader", "#0a84ff",
            () => this.showTaskListModal("In Progress Tasks", allTasks.filter(t => t.status === "In Progress"))
        );
        this.renderKPICard(
            kpiGrid, "Blocked", stats.blockedTasks, "alert-circle", "#d70022",
            () => this.showTaskListModal("Blocked Tasks", allTasks.filter(t => t.status === "Blocked"))
        );

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
            if (!t.dueDate || t.status === "Completed") return false;
            const dueDate = new Date(t.dueDate).getTime();
            return dueDate < today;
        });

        const dueTodayTasks = allTasks.filter(t => {
            if (!t.dueDate || t.status === "Completed") return false;
            const dueDate = new Date(t.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate.getTime() === today;
        });

        const dueThisWeekTasks = allTasks.filter(t => {
            if (!t.dueDate || t.status === "Completed") return false;
            const dueDate = new Date(t.dueDate).getTime();
            return dueDate >= today && dueDate <= weekFromNow;
        });

        const criticalTasks = allTasks.filter(t => t.priority === "Critical" && t.status !== "Completed");

        this.renderKPICard(
            alertsGrid, "Overdue", stats.overdueTasks, "alert-triangle", "#d70022",
            () => this.showTaskListModal("Overdue Tasks", overdueTasks)
        );
        this.renderKPICard(
            alertsGrid, "Due Today", stats.dueTodayTasks, "calendar", "#f59e0b",
            () => this.showTaskListModal("Due Today", dueTodayTasks)
        );
        this.renderKPICard(
            alertsGrid, "Due This Week", stats.dueThisWeekTasks, "calendar-days", "#0a84ff",
            () => this.showTaskListModal("Due This Week", dueThisWeekTasks)
        );
        this.renderKPICard(
            alertsGrid, "Critical Priority", stats.criticalPriorityTasks, "flame", "#d70022",
            () => this.showTaskListModal("Critical Priority Tasks", criticalTasks)
        );

        // Additional stats
        const statsGrid = projectCard.createDiv("dashboard-kpi-grid");

        const highPriorityTasks = allTasks.filter(t => t.priority === "High" && t.status !== "Completed");
        const dependencyTasks = allTasks.filter(t => t.dependencies && t.dependencies.length > 0 && t.status !== "Completed");
        const notStartedTasks = allTasks.filter(t => t.status === "Not Started");

        this.renderKPICard(
            statsGrid, "High Priority", stats.highPriorityTasks, "arrow-up", "#f59e0b",
            () => this.showTaskListModal("High Priority Tasks", highPriorityTasks)
        );
        this.renderKPICard(
            statsGrid, "Has Dependencies", stats.tasksWithDependencies, "git-branch", "#6366f1",
            () => this.showTaskListModal("Tasks with Dependencies", dependencyTasks)
        );
        this.renderKPICard(
            statsGrid, "Not Started", stats.notStartedTasks, "circle", "#6c757d",
            () => this.showTaskListModal("Not Started Tasks", notStartedTasks)
        );

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

            this.renderKPICard(
                effortGrid, "Effort Done", `${stats.totalEffortCompleted}h`, "check-circle", "#2f9e44"
            );
            this.renderKPICard(
                effortGrid, "Effort Left", `${stats.totalEffortRemaining}h`, "clock", "#f59e0b"
            );
            this.renderKPICard(
                effortGrid, "Total Effort", `${stats.totalEffort}h`, "bar-chart-2", "#6366f1"
            );
            this.renderKPICard(
                effortGrid, "Avg % Complete", `${stats.averagePercentComplete}%`, "percent", "#0a84ff"
            );
        }
    }

    render() {
        const container = this.containerEl;

        // Save scroll position before clearing
        const existingWrapper = container.querySelector('.dashboard-wrapper') as HTMLElement;
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

        const toggleLabel = toggleContainer.createSpan({ text: "Show All Projects", cls: "dashboard-toggle-label" });
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
        } else {
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
