import { ItemView, WorkspaceLeaf, setIcon, Modal } from "obsidian";
import type ProjectPlannerPlugin from "../main";
import type { PlannerTask } from "../types";
import type { PlannerProject } from "../settings";
import { renderPlannerHeader } from "./Header";
import { getProjectCostSummary, formatCurrency, getCostBreakdown } from "../utils/costUtils";

export const VIEW_TYPE_DASHBOARD = "project-planner-dashboard-view";

// ---------------------------------------------------------------------------
// Modal: task list
// ---------------------------------------------------------------------------
class TaskListModal extends Modal {
    constructor(
        private readonly plugin: ProjectPlannerPlugin,
        private readonly modalTitle: string,
        private readonly tasks: PlannerTask[],
    ) {
        super(plugin.app);
    }

    onOpen() {
        this.contentEl.addClass("dashboard-task-modal-content");

        const header = this.contentEl.createDiv("dashboard-task-modal-header");
        header.createEl("h3", { text: this.modalTitle });
        const closeBtn = header.createEl("button", { cls: "dashboard-task-modal-close" });
        const closeIcon = closeBtn.createSpan({ cls: "dashboard-task-modal-close-icon" });
        setIcon(closeIcon, "x");
        closeBtn.onclick = () => this.close();

        const taskList = this.contentEl.createDiv("dashboard-task-modal-list");

        if (this.tasks.length === 0) {
            taskList.createDiv({ text: "No tasks found", cls: "dashboard-task-modal-empty" });
            return;
        }

        this.tasks.forEach(task => {
            const taskItem = taskList.createDiv("dashboard-task-modal-item");

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
                task.completed = isDone;
                task.status = isDone ? "Completed" : "Not Started";
                isDone
                    ? titleEl.addClass("dashboard-task-modal-completed")
                    : titleEl.removeClass("dashboard-task-modal-completed");
                statusBadge.textContent = task.status;
                statusBadge.style.backgroundColor = this.getStatusColor(task.status);
            };

            const titleEl = taskItem.createDiv({
                text: task.title,
                cls: "dashboard-task-modal-title"
            });
            if (task.completed) titleEl.addClass("dashboard-task-modal-completed");

            const meta = taskItem.createDiv("dashboard-task-modal-meta");
            const statusBadge = meta.createSpan({ text: task.status, cls: "status-pill" });
            statusBadge.style.backgroundColor = this.getStatusColor(task.status);

            if (task.priority) {
                const priorityPill = meta.createSpan({ text: task.priority, cls: "priority-pill" });
                priorityPill.style.backgroundColor = this.getPriorityColor(task.priority);
            }
            if (task.dueDate) {
                meta.createSpan({ text: `Due: ${task.dueDate}`, cls: "dashboard-task-modal-due" });
            }

            taskItem.onclick = () => {
                this.close();
                this.plugin.openTaskDetail(task);
            };
        });
    }

    onClose() { this.contentEl.empty(); }

    private getStatusColor(status: string): string {
        const obj = this.plugin.settings.availableStatuses?.find(s => s.name === status);
        if (obj) return obj.color;
        switch (status) {
            case "Completed": return "#2f9e44";
            case "In Progress": return "#0a84ff";
            case "Blocked": return "#d70022";
            default: return "#6c757d";
        }
    }

    private getPriorityColor(priority: string): string {
        const obj = this.plugin.settings.availablePriorities?.find(p => p.name === priority);
        if (obj) return obj.color;
        switch (priority) {
            case "Critical": return "#d70022";
            case "High": return "#f59e0b";
            case "Medium": return "#0a84ff";
            default: return "#6366f1";
        }
    }
}

// ---------------------------------------------------------------------------
// Modal: cost report
// ---------------------------------------------------------------------------
class CostReportModal extends Modal {
    constructor(
        private readonly plugin: ProjectPlannerPlugin,
        private readonly projectId: string,
        private readonly tasks: PlannerTask[],
    ) {
        super(plugin.app);
    }

    onOpen() {
        this.contentEl.addClass("dashboard-task-modal-content", "dashboard-cost-report-content");

        const project = this.plugin.settings.projects?.find(p => p.id === this.projectId);
        const currency = project?.currencySymbol || "$";
        const buckets = project?.buckets || [];

        const header = this.contentEl.createDiv("dashboard-task-modal-header");
        header.createEl("h3", { text: "Cost Report" });
        const closeBtn = header.createEl("button", { cls: "dashboard-task-modal-close" });
        const closeIcon = closeBtn.createSpan({ cls: "dashboard-task-modal-close-icon" });
        setIcon(closeIcon, "x");
        closeBtn.onclick = () => this.close();

        const tabBar = this.contentEl.createDiv("dashboard-cost-report-tabs");
        const tabBody = this.contentEl.createDiv("dashboard-cost-report-body");

        type TabKey = "bucket" | "status" | "priority" | "overbudget";
        let activeTab: TabKey = "bucket";

        const renderTab = (tab: TabKey) => {
            activeTab = tab;
            tabBar.querySelectorAll(".dashboard-cost-tab").forEach(el => el.removeClass("active"));
            tabBar.querySelector(`[data-tab="${tab}"]`)?.addClass("active");
            tabBody.empty();

            if (tab === "overbudget") {
                this.renderOverBudgetList(tabBody, this.tasks, project, currency);
            } else {
                const groupFn =
                    tab === "bucket"
                        ? (t: PlannerTask) => { const b = buckets.find(bk => bk.id === t.bucketId); return b ? b.name : "Unassigned"; }
                    : tab === "status"
                        ? (t: PlannerTask) => t.status || "No Status"
                        : (t: PlannerTask) => t.priority || "No Priority";
                const rows = getCostBreakdown(this.tasks, groupFn, project);
                this.renderCostBreakdownTable(tabBody, rows, currency);
            }
        };

        const tabs: { key: TabKey; label: string }[] = [
            { key: "bucket", label: "By Bucket" },
            { key: "status", label: "By Status" },
            { key: "priority", label: "By Priority" },
            { key: "overbudget", label: "Over Budget" },
        ];
        tabs.forEach(t => {
            const btn = tabBar.createEl("button", { text: t.label, cls: "dashboard-cost-tab", attr: { "data-tab": t.key } });
            if (t.key === activeTab) btn.addClass("active");
            btn.onclick = () => renderTab(t.key);
        });

        renderTab(activeTab);
    }

    onClose() { this.contentEl.empty(); }

    private renderCostBreakdownTable(
        container: HTMLElement,
        rows: { label: string; estimated: number; actual: number; variance: number; taskCount: number }[],
        currency: string
    ) {
        if (rows.length === 0) {
            container.createDiv({ text: "No cost data available.", cls: "dashboard-task-modal-empty" });
            return;
        }
        const table = container.createEl("table", { cls: "dashboard-cost-table" });
        const headerRow = table.createEl("thead").createEl("tr");
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
            if (row.variance < 0) varCell.classList.add("planner-cost-over-budget");
            else if (row.variance > 0) varCell.classList.add("planner-cost-under-budget");
            totalEst += row.estimated; totalAct += row.actual; totalVar += row.variance; totalCount += row.taskCount;
        });
        const footRow = table.createEl("tfoot").createEl("tr");
        footRow.createEl("td", { text: "Total", cls: "dashboard-cost-total-label" });
        footRow.createEl("td", { text: String(totalCount), cls: "dashboard-cost-num" });
        footRow.createEl("td", { text: formatCurrency(totalEst, currency), cls: "dashboard-cost-num" });
        footRow.createEl("td", { text: formatCurrency(totalAct, currency), cls: "dashboard-cost-num" });
        const totalVarCell = footRow.createEl("td", { cls: "dashboard-cost-num" });
        totalVarCell.textContent = formatCurrency(totalVar, currency);
        if (totalVar < 0) totalVarCell.classList.add("planner-cost-over-budget");
        else if (totalVar > 0) totalVarCell.classList.add("planner-cost-under-budget");
    }

    private renderOverBudgetList(
        container: HTMLElement,
        tasks: PlannerTask[],
        project: { defaultHourlyRate?: number; currencySymbol?: string } | undefined,
        currency: string
    ) {
        const overBudget = tasks.filter(t => {
            if (!t.costType) return false;
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
            container.createDiv({ text: "No over-budget tasks.", cls: "dashboard-task-modal-empty" });
            return;
        }
        overBudget.forEach(t => {
            const row = container.createDiv("dashboard-task-modal-item");
            row.createDiv({ text: t.title, cls: "dashboard-task-modal-title" });
            const rate = t.hourlyRate ?? project?.defaultHourlyRate ?? 0;
            const est = t.costType === "hourly"
                ? ((t.effortCompleted ?? 0) + (t.effortRemaining ?? 0)) * rate
                : (t.costEstimate ?? 0);
            const act = t.costType === "hourly"
                ? (t.effortCompleted ?? 0) * rate
                : (t.costActual ?? 0);
            const meta = row.createDiv("dashboard-task-modal-meta");
            meta.createSpan({ text: `Est: ${formatCurrency(est, currency)}` });
            meta.createSpan({ text: `Actual: ${formatCurrency(act, currency)}`, cls: "planner-cost-over-budget" });
        });
    }
}

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
    // Cost tracking
    budgetTotal: number;
    totalEstimatedCost: number;
    totalActualCost: number;
    budgetRemaining: number;
    budgetUsedPercent: number;
    overBudgetTaskCount: number;
}

export class DashboardView extends ItemView {
    private plugin: ProjectPlannerPlugin;
    private unsubscribe: (() => void) | null = null;
    private showAllProjects: boolean = false;
    private savedScrollTop: number | null = null;
    private renderVersion = 0;

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
            const [y, m, d] = t.dueDate.split("-").map(Number);
            return new Date(y, m - 1, d).getTime() < today;
        }).length;

        const dueTodayTasks = tasks.filter(t => {
            if (!t.dueDate || t.status === "Completed") return false;
            const [y, m, d] = t.dueDate.split("-").map(Number);
            return new Date(y, m - 1, d).getTime() === today;
        }).length;

        const dueThisWeekTasks = tasks.filter(t => {
            if (!t.dueDate || t.status === "Completed") return false;
            const [y, m, d] = t.dueDate.split("-").map(Number);
            const dueDate = new Date(y, m - 1, d).getTime();
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
        new TaskListModal(this.plugin, title, tasks).open();
    }

    private getPriorityColor(priority: string): string {
        const priorityObj = this.plugin.settings.availablePriorities?.find((p) => p.name === priority);
        if (priorityObj) return priorityObj.color;
        switch (priority) {
            case "Critical": return "#d70022";
            case "High": return "#f59e0b";
            case "Medium": return "#0a84ff";
            case "Low": return "#6366f1";
            default: return "#6366f1";
        }
    }

    private getStatusColor(status: string): string {
        const statusObj = this.plugin.settings.availableStatuses?.find((s) => s.name === status);
        if (statusObj) return statusObj.color;
        switch (status) {
            case "Completed": return "#2f9e44";
            case "In Progress": return "#0a84ff";
            case "Blocked": return "#d70022";
            case "Not Started": return "#6c757d";
            default: return "#6c757d";
        }
    }

    private renderProjectDashboard(container: HTMLElement, stats: ProjectStats, allTasks: PlannerTask[], showDragHandle = false): HTMLElement {
        const projectCard = container.createDiv("dashboard-project-card");

        // Header
        const header = projectCard.createDiv("dashboard-project-header");
        if (showDragHandle) {
            const grip = header.createDiv({ cls: "dashboard-card-drag-handle" });
            setIcon(grip, "grip-vertical");
            projectCard.style.cursor = "grab";
        }
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
            const [y, m, d] = t.dueDate.split("-").map(Number);
            return new Date(y, m - 1, d).getTime() < today;
        });

        const dueTodayTasks = allTasks.filter(t => {
            if (!t.dueDate || t.status === "Completed") return false;
            const [y, m, d] = t.dueDate.split("-").map(Number);
            return new Date(y, m - 1, d).getTime() === today;
        });

        const dueThisWeekTasks = allTasks.filter(t => {
            if (!t.dueDate || t.status === "Completed") return false;
            const [y, m, d] = t.dueDate.split("-").map(Number);
            const dueDate = new Date(y, m - 1, d).getTime();
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
                this.renderKPICard(
                    costGrid, "Budget", formatCurrency(stats.budgetTotal, currency), "wallet", "#6366f1"
                );
            }
            this.renderKPICard(
                costGrid, "Estimated", formatCurrency(stats.totalEstimatedCost, currency), "calculator", "#0a84ff"
            );
            this.renderKPICard(
                costGrid, "Actual", formatCurrency(stats.totalActualCost, currency), "receipt", "#2f9e44"
            );
            if (stats.budgetTotal > 0) {
                const remainingColor = stats.budgetRemaining < 0 ? "#d70022" : "#2f9e44";
                this.renderKPICard(
                    costGrid, "Remaining", formatCurrency(stats.budgetRemaining, currency), "piggy-bank", remainingColor
                );
            }
            if (stats.overBudgetTaskCount > 0) {
                const overBudgetTasks = allTasks.filter(t => {
                    if (!t.costType) return false;
                    const est = t.costType === "hourly"
                        ? ((t.effortCompleted ?? 0) + (t.effortRemaining ?? 0)) * (t.hourlyRate ?? activeProj?.defaultHourlyRate ?? 0)
                        : (t.costEstimate ?? 0);
                    const act = t.costType === "hourly"
                        ? (t.effortCompleted ?? 0) * (t.hourlyRate ?? activeProj?.defaultHourlyRate ?? 0)
                        : (t.costActual ?? 0);
                    return est > 0 && act > est;
                });
                this.renderKPICard(
                    costGrid, "Over Budget", stats.overBudgetTaskCount, "alert-triangle", "#d70022",
                    () => this.showTaskListModal("Over-Budget Tasks", overBudgetTasks)
                );
            }

            // "View Cost Report" button
            const reportBtn = costSection.createEl("button", {
                text: "View Cost Report",
                cls: "dashboard-cost-report-btn"
            });
            reportBtn.onclick = () => this.showCostReportModal(stats.projectId, allTasks);
        }

        return projectCard;
    }

    private renderBudgetProgressBar(
        container: HTMLElement,
        percentage: number,
        currency: string,
        actual: number,
        total: number
    ) {
        const barContainer = container.createDiv("dashboard-progress-container dashboard-budget-bar");
        const bar = barContainer.createDiv("dashboard-progress-bar");
        const fill = bar.createDiv("dashboard-progress-fill");
        const clamped = Math.min(100, Math.max(0, percentage));
        fill.style.width = `${clamped}%`;

        // Color thresholds: green < 75%, yellow 75-90%, red > 90%
        if (percentage > 90) fill.style.backgroundColor = "#d70022";
        else if (percentage > 75) fill.style.backgroundColor = "#f59e0b";
        else fill.style.backgroundColor = "#2f9e44";

        const label = barContainer.createDiv("dashboard-progress-label");
        label.textContent = `${formatCurrency(actual, currency)} / ${formatCurrency(total, currency)} (${percentage}%)`;
    }

    private showCostReportModal(projectId: string, tasks: PlannerTask[]) {
        new CostReportModal(this.plugin, projectId, tasks).open();
    }

    render() {
        const container = this.containerEl;
        const thisRender = ++this.renderVersion;

        // Save scroll position before clearing
        const existingWrapper = container.querySelector('.planner-dashboard-wrapper') as HTMLElement;
        if (existingWrapper && this.savedScrollTop === null) {
            this.savedScrollTop = existingWrapper.scrollTop;
        }

        container.empty();

        const wrapper = container.createDiv("planner-dashboard-wrapper");

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
                if (thisRender !== this.renderVersion) return;
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

            const orderedProjects = this.getSortedProjects(projects);
            let draggedProjectId: string | null = null;

            orderedProjects.forEach((project) => {
                const projectTasks = this.plugin.taskStore.getAllForProject?.(project.id) || [];
                const stats = this.calculateProjectStats(project.id, project.name, projectTasks);
                const card = this.renderProjectDashboard(content, stats, projectTasks, true);

                card.draggable = true;

                card.ondragstart = (e) => {
                    draggedProjectId = project.id;
                    card.classList.add("dashboard-project-card-dragging");
                    e.dataTransfer!.effectAllowed = "move";
                    e.dataTransfer!.setData("text/plain", project.id);
                };
                card.ondragend = () => {
                    draggedProjectId = null;
                    card.classList.remove("dashboard-project-card-dragging");
                    content.querySelectorAll(".dashboard-project-card-dragover").forEach(el =>
                        el.classList.remove("dashboard-project-card-dragover")
                    );
                };
                card.ondragover = (e) => {
                    if (!draggedProjectId || draggedProjectId === project.id) return;
                    e.preventDefault();
                    e.dataTransfer!.dropEffect = "move";
                    card.classList.add("dashboard-project-card-dragover");
                };
                card.ondragleave = (e) => {
                    const rect = card.getBoundingClientRect();
                    if (e.clientX < rect.left || e.clientX >= rect.right ||
                        e.clientY < rect.top  || e.clientY >= rect.bottom) {
                        card.classList.remove("dashboard-project-card-dragover");
                    }
                };
                card.ondrop = async (e) => {
                    if (!draggedProjectId || draggedProjectId === project.id) return;
                    e.preventDefault();
                    card.classList.remove("dashboard-project-card-dragover");

                    const currentOrder = this.getProjectOrder(projects);
                    const fromIdx = currentOrder.indexOf(draggedProjectId);
                    const toIdx   = currentOrder.indexOf(project.id);
                    if (fromIdx === -1 || toIdx === -1) return;

                    currentOrder.splice(fromIdx, 1);
                    currentOrder.splice(fromIdx < toIdx ? toIdx - 1 : toIdx, 0, draggedProjectId);

                    this.plugin.settings.dashboardProjectOrder = currentOrder;
                    await this.plugin.saveSettings();
                    this.render();
                };
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

    private getSortedProjects(projects: PlannerProject[]): PlannerProject[] {
        const order = this.plugin.settings.dashboardProjectOrder || [];
        if (order.length === 0) return projects;
        return [...projects].sort((a, b) => {
            const ia = order.indexOf(a.id);
            const ib = order.indexOf(b.id);
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
    }

    private getProjectOrder(projects: PlannerProject[]): string[] {
        const saved = this.plugin.settings.dashboardProjectOrder || [];
        const ids = projects.map(p => p.id);
        const result = saved.filter(id => ids.includes(id));
        for (const id of ids) {
            if (!result.includes(id)) result.push(id);
        }
        return result;
    }
}
