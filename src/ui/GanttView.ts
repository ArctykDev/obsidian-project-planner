import { ItemView, WorkspaceLeaf, Menu, setIcon } from "obsidian";
import type ProjectPlannerPlugin from "../main";
import type { PlannerTask } from "../types";
import { renderPlannerHeader } from "./Header";

export const VIEW_TYPE_GANTT = "project-planner-gantt-view";

export class GanttView extends ItemView {
    private plugin: ProjectPlannerPlugin;
    private unsubscribe: (() => void) | null = null;
    private readonly dayMs = 24 * 60 * 60 * 1000;

    // Drag and drop state
    private currentDragId: string | null = null;
    private dragTargetTaskId: string | null = null;
    private dragInsertAfter: boolean = false;

    // Filters
    private currentFilters = {
        status: "All",
        priority: "All",
        search: ""
    };

    // Zoom level
    private zoomLevel: "day" | "week" | "month" = "day";

    constructor(leaf: WorkspaceLeaf, plugin: ProjectPlannerPlugin) {
        super(leaf);
        this.plugin = plugin;
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
    }

    private getTaskRange(task: PlannerTask, todayMs: number): { start: number; end: number } {
        let start = task.startDate ? new Date(task.startDate).getTime() : null;
        let end = task.dueDate ? new Date(task.dueDate).getTime() : null;

        if (start === null && end !== null) start = end;
        if (end === null && start !== null) end = start;

        if (start === null && end === null) {
            start = todayMs;
            end = todayMs + this.dayMs; // one-day default span
        }

        if (end! < start!) {
            end = start;
        }

        return { start: start!, end: end! };
    }

    private toISODate(ms: number): string {
        return new Date(ms).toISOString().split("T")[0];
    }

    private async updateTaskDates(taskId: string, startMs: number, endMs: number) {
        await (this.plugin as any).taskStore.updateTask(taskId, {
            startDate: this.toISODate(startMs),
            dueDate: this.toISODate(endMs)
        });
    }

    private async updateTaskTitle(taskId: string, title: string) {
        await (this.plugin as any).taskStore.updateTask(taskId, { title });
    }

    private async handleDrop(dragId: string, targetId: string, insertAfter: boolean) {
        const tasks = (this.plugin as any).taskStore.getAll();
        const dragTask = tasks.find((t: PlannerTask) => t.id === dragId);
        const targetTask = tasks.find((t: PlannerTask) => t.id === targetId);

        if (!dragTask || !targetTask) return;
        if (dragTask.id === targetTask.id) return;

        const ids = tasks.map((t: PlannerTask) => t.id);

        // Parent drag: move parent + children as block
        if (!dragTask.parentId) {
            const blockIds: string[] = [dragTask.id];
            for (const t of tasks) {
                if (t.parentId === dragTask.id) blockIds.push(t.id);
            }

            if (blockIds.includes(targetTask.id)) return;

            const targetRootId = targetTask.parentId || targetTask.id;
            if (blockIds.includes(targetRootId)) return;

            const firstIdx = ids.indexOf(blockIds[0]);
            if (firstIdx === -1) return;
            ids.splice(firstIdx, blockIds.length);

            let targetRootIndex = ids.indexOf(targetRootId);
            if (targetRootIndex === -1) targetRootIndex = ids.length;

            if (insertAfter && targetRootIndex < ids.length) {
                let endIndex = targetRootIndex;
                for (let i = targetRootIndex + 1; i < ids.length; i++) {
                    const t = tasks.find((task: PlannerTask) => task.id === ids[i]);
                    if (t && t.parentId === targetRootId) {
                        endIndex = i;
                    } else {
                        break;
                    }
                }
                targetRootIndex = endIndex + 1;
            }

            ids.splice(targetRootIndex, 0, ...blockIds);
            await (this.plugin as any).taskStore.setOrder(ids);
            this.render();
            return;
        }

        // Child drag: simple reorder
        const fromIndex = ids.indexOf(dragId);
        if (fromIndex === -1) return;
        ids.splice(fromIndex, 1);

        let insertIndex = ids.indexOf(targetId);
        if (insertIndex === -1) {
            insertIndex = ids.length;
        } else if (insertAfter) {
            insertIndex += 1;
        }

        ids.splice(insertIndex, 0, dragId);
        await (this.plugin as any).taskStore.setOrder(ids);
        this.render();
    }

    private matchesFilters(task: PlannerTask): boolean {
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

    private showTaskMenu(evt: MouseEvent, task: PlannerTask) {
        evt.preventDefault();
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle("Open details");
            item.setIcon("pencil");
            item.onClick(async () => await (this.plugin as any).openTaskDetail(task));
        });

        menu.addItem((item) => {
            item.setTitle("Add new task above");
            item.setIcon("plus");
            item.onClick(async () => {
                const store = (this.plugin as any).taskStore;
                const newTask = await store.addTask("New Task");
                // Insert before current task in manual order
                const allTasks = store.getAll();
                const taskIndex = allTasks.findIndex((t: PlannerTask) => t.id === task.id);
                if (taskIndex >= 0) {
                    const reordered = [...allTasks];
                    const newIndex = reordered.findIndex((t: PlannerTask) => t.id === newTask.id);
                    if (newIndex >= 0) {
                        const [moved] = reordered.splice(newIndex, 1);
                        reordered.splice(taskIndex, 0, moved);
                        await store.reorder(reordered.map((t: PlannerTask) => t.id));
                    }
                }
                this.render();
            });
        });

        menu.addItem((item) => {
            item.setTitle("Make subtask");
            item.setIcon("arrow-right");
            item.onClick(async () => {
                const store = (this.plugin as any).taskStore;
                const allTasks = store.getAll();
                const taskIndex = allTasks.findIndex((t: PlannerTask) => t.id === task.id);
                if (taskIndex <= 0) return;

                // Find previous task to become parent
                const prevTask = allTasks[taskIndex - 1];
                await store.updateTask(task.id, { parentId: prevTask.id });
                this.render();
            });
        });

        menu.addItem((item) => {
            item.setTitle("Promote to parent");
            item.setIcon("arrow-left");
            item.setDisabled(!task.parentId);
            item.onClick(async () => {
                if (!task.parentId) return;
                const store = (this.plugin as any).taskStore;
                await store.promoteSubtask(task.id);
                this.render();
            });
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle("Delete task");
            item.setIcon("trash");
            item.onClick(async () => {
                await (this.plugin as any).taskStore.deleteTask(task.id);
                this.render();
            });
        });

        menu.showAtMouseEvent(evt);
    }

    private attachBarInteractions(
        bar: HTMLElement,
        task: PlannerTask,
        startMs: number,
        endMs: number,
        timelineStart: number,
        dayWidth: number
    ) {
        const isHandle = (el: HTMLElement) => el.classList.contains("planner-gantt-handle");

        bar.addEventListener("pointerdown", (e: PointerEvent) => {
            if (e.button !== 0) return;

            const target = e.target as HTMLElement;
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
                const widthPx = Math.max(
                    dayWidth,
                    Math.round(((newEnd - newStart) / this.dayMs + 1) * dayWidth) - 4
                );
                bar.style.left = `${leftPx}px`;
                bar.style.width = `${widthPx}px`;
            };

            const onMove = (evt: PointerEvent) => {
                const deltaDays = Math.round((evt.clientX - startX) / dayWidth);
                if (deltaDays === 0) return;
                moved = true;

                if (mode === "move") {
                    newStart = initialStart + deltaDays * this.dayMs;
                    newEnd = initialEnd + deltaDays * this.dayMs;
                } else if (mode === "resize-left") {
                    newStart = initialStart + deltaDays * this.dayMs;
                    // Prevent inverting range
                    if (newStart > newEnd - this.dayMs) {
                        newStart = newEnd - this.dayMs;
                    }
                } else if (mode === "resize-right") {
                    newEnd = initialEnd + deltaDays * this.dayMs;
                    if (newEnd < newStart + this.dayMs) {
                        newEnd = newStart + this.dayMs;
                    }
                }

                updateVisual();
            };

            const onUp = async (_evt: PointerEvent) => {
                bar.classList.remove("planner-gantt-bar-dragging");
                bar.releasePointerCapture(e.pointerId);
                bar.removeEventListener("pointermove", onMove);
                bar.removeEventListener("pointerup", onUp);
                bar.removeEventListener("pointercancel", onUp);

                if (!moved && mode === "move" && !isHandle(target)) {
                    await (this.plugin as any).openTaskDetail(task);
                    return;
                }

                // Commit new dates and rerender
                await this.updateTaskDates(task.id, newStart, newEnd);
                this.render();
            };

            bar.addEventListener("pointermove", onMove);
            bar.addEventListener("pointerup", onUp);
            bar.addEventListener("pointercancel", onUp);
        });
    }

    private attachInlineTitle(
        container: HTMLElement,
        task: PlannerTask
    ) {
        container.style.position = "relative";
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.gap = "6px";

        const titleSpan = container.createSpan({ text: task.title });
        titleSpan.style.flex = "1";
        titleSpan.style.overflow = "hidden";
        titleSpan.style.textOverflow = "ellipsis";
        titleSpan.style.whiteSpace = "nowrap";

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
                this.render();
            };

            const cancel = () => {
                this.render();
            };

            input.onkeydown = (ev) => {
                if (ev.key === "Enter") {
                    ev.preventDefault();
                    void commit();
                } else if (ev.key === "Escape") {
                    ev.preventDefault();
                    cancel();
                }
            };
            input.onblur = () => void commit();
        };

        // Single click opens detail (Planner-like), double-click edits
        titleSpan.onclick = () => (this.plugin as any).openTaskDetail(task);
        titleSpan.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            startEdit();
        };
        titleSpan.oncontextmenu = (e) => this.showTaskMenu(e as any, task);

        const menuBtn = container.createEl("button", {
            cls: "planner-task-menu",
            text: "⋯",
        });
        menuBtn.onclick = (e) => {
            e.stopPropagation();
            this.showTaskMenu(e as any, task);
        };
        menuBtn.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showTaskMenu(e as any, task);
        };
    }

    private startDrag(evt: PointerEvent, row: HTMLElement, task: PlannerTask) {
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

        const inner = row.cloneNode(true) as HTMLElement;
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
        (document.body.style as any).webkitUserSelect = "none";
        document.body.style.cursor = "grabbing";

        const offsetY = evt.clientY - rowRect.top;

        const onMove = (moveEvt: PointerEvent) => {
            moveEvt.preventDefault();

            const y = moveEvt.clientY - offsetY;
            ghost.style.top = `${y}px`;

            const targetEl = document.elementFromPoint(moveEvt.clientX, moveEvt.clientY) as HTMLElement | null;
            const targetRow = targetEl?.closest(".planner-gantt-row-left") as HTMLElement | null;

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

        const onUp = async (upEvt: PointerEvent) => {
            upEvt.preventDefault();

            window.removeEventListener("pointermove", onMove, true);
            window.removeEventListener("pointerup", onUp, true);

            ghost.remove();
            indicator.remove();

            row.classList.remove("planner-gantt-row-dragging");
            document.body.style.userSelect = "";
            (document.body.style as any).webkitUserSelect = "";
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
    }

    private render() {
        const container = this.containerEl;
        container.empty();
        container.addClass("planner-gantt-wrapper");

        // Shared header
        renderPlannerHeader(container, this.plugin, {
            active: "gantt",
            onProjectChange: async () => {
                await (this.plugin as any).taskStore.load();
                this.render();
            }
        });

        // Filter and zoom controls
        const toolbar = container.createDiv("planner-gantt-toolbar");

        // Filters
        const filters = toolbar.createDiv("planner-gantt-filters");

        // Status filter
        const statusFilter = filters.createEl("select", { cls: "planner-filter-select" });
        ["All", "Not Started", "In Progress", "Blocked", "Completed"].forEach(status => {
            const option = statusFilter.createEl("option", { text: status, value: status });
            if (status === this.currentFilters.status) option.selected = true;
        });
        statusFilter.onchange = () => {
            this.currentFilters.status = statusFilter.value;
            this.render();
        };

        // Priority filter
        const priorityFilter = filters.createEl("select", { cls: "planner-filter-select" });
        ["All", "Low", "Medium", "High", "Critical"].forEach(priority => {
            const option = priorityFilter.createEl("option", { text: priority, value: priority });
            if (priority === this.currentFilters.priority) option.selected = true;
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
            this.render();
        };

        // Zoom controls
        const zoomControls = toolbar.createDiv("planner-gantt-zoom");
        zoomControls.createSpan({ text: "Zoom: ", cls: "planner-zoom-label" });

        const zoomBtnGroup = zoomControls.createDiv("planner-zoom-buttons");
        ["day", "week", "month"].forEach((level) => {
            const btn = zoomBtnGroup.createEl("button", {
                text: level.charAt(0).toUpperCase() + level.slice(1),
                cls: "planner-zoom-btn"
            });
            if (level === this.zoomLevel) btn.classList.add("active");
            btn.onclick = () => {
                this.zoomLevel = level as "day" | "week" | "month";
                this.render();
            };
        });

        // Content area
        const content = container.createDiv("planner-gantt-content");
        const allTasks: PlannerTask[] = (this.plugin as any).taskStore.getAll();

        // Apply filters
        const tasks = allTasks.filter(t => this.matchesFilters(t));

        if (tasks.length === 0) {
            content.createEl("div", { text: "No tasks match current filters." });
            return;
        }

        // Helper: leaf tasks only (exclude parents)
        const hasChildren = (id: string) => tasks.some(t => t.parentId === id);
        const leafTasks = tasks.filter(t => !hasChildren(t.id));

        // Determine timeline range (min start/due to max start/due)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const ranges = leafTasks.map((t) => this.getTaskRange(t, today.getTime()));
        const dates: number[] = [];
        for (const r of ranges) {
            dates.push(r.start, r.end);
        }
        let minTime = dates.length ? Math.min(...dates) : today.getTime();
        let maxTime = dates.length ? Math.max(...dates) : today.getTime() + 30 * this.dayMs;
        // Ensure at least 30 days span
        if (maxTime - minTime < 30 * this.dayMs) maxTime = minTime + 30 * this.dayMs;

        // Build scale with zoom-based day width
        const dayMs = this.dayMs;
        let dayWidth = 20; // px per day (default)
        if (this.zoomLevel === "week") dayWidth = 8;
        else if (this.zoomLevel === "month") dayWidth = 3;

        const totalDays = Math.round((maxTime - minTime) / dayMs) + 1;
        const timelineWidth = totalDays * dayWidth;

        // Layout containers: left list + right timeline
        const layout = content.createDiv("planner-gantt-layout");
        const leftCol = layout.createDiv("planner-gantt-left");
        const rightColWrap = layout.createDiv("planner-gantt-right-wrap");
        const rightCol = rightColWrap.createDiv("planner-gantt-right");
        rightCol.style.width = `${timelineWidth}px`;

        // Top scale (dates)
        const scale = rightCol.createDiv("planner-gantt-scale");
        for (let i = 0; i < totalDays; i++) {
            const cell = scale.createDiv("planner-gantt-scale-day");
            cell.style.width = `${dayWidth}px`;
            const date = new Date(minTime + i * dayMs);
            if (date.getDate() === 1) {
                cell.classList.add("planner-gantt-scale-month");
                cell.setText(`${date.toLocaleString(undefined, { month: 'short' })}`);
            } else if (date.getDay() === 1) {
                cell.setText(`${date.getDate()}`);
            }
        }

        // Today marker
        const todayTime = today.getTime();
        if (todayTime >= minTime && todayTime <= maxTime) {
            const x = Math.round((todayTime - minTime) / dayMs) * dayWidth;
            const marker = rightCol.createDiv("planner-gantt-today");
            marker.style.left = `${x}px`;
        }

        // Rows: one per leaf task
        const statusColor = (status: string): string => {
            switch (status) {
                case "Completed": return "#2f9e44";
                case "In Progress": return "#0a84ff";
                case "Blocked": return "#d70022";
                case "Not Started":
                default: return "#6c757d";
            }
        };

        leafTasks.forEach((t, idx) => {
            const range = ranges[idx];
            let start = range.start;
            let end = range.end;

            // Left label
            const rowLeft = leftCol.createDiv("planner-gantt-row-left");
            rowLeft.dataset.taskId = t.id;
            if (t.completed) rowLeft.classList.add("planner-task-completed");

            // Drag handle
            const dragHandle = rowLeft.createDiv({ cls: "planner-drag-handle" });
            setIcon(dragHandle, "grip-vertical");

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
                const newStatus = t.status === "Completed" ? "Not Started" : "Completed";
                await (this.plugin as any).taskStore.updateTask(t.id, { status: newStatus });
            };

            this.attachInlineTitle(rowLeft, t);

            // Right bar row
            const row = rightCol.createDiv("planner-gantt-row");
            row.style.height = `28px`;

            // Calculate bar position
            const clampedStart = Math.max(start, minTime);
            const clampedEnd = Math.min(end, maxTime);
            const startDays = Math.max(0, Math.round((clampedStart - minTime) / dayMs));
            const spanDays = Math.max(1, Math.round((clampedEnd - clampedStart) / dayMs) + 1);

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
    }
}
