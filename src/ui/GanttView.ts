import { ItemView, WorkspaceLeaf, Menu, setIcon, Notice, TFile } from "obsidian";
import type ProjectPlannerPlugin from "../main";
import type { PlannerTask } from "../types";
import { renderPlannerHeader } from "./Header";

export const VIEW_TYPE_GANTT = "project-planner-gantt-view";

interface VisibleTask {
    task: PlannerTask;
    depth: number;
    hasChildren: boolean;
}

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

    // Resizable layout
    private leftColumnWidth: number;

    // Clipboard for Cut/Copy/Paste
    private clipboardTask: { task: PlannerTask; isCut: boolean } | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: ProjectPlannerPlugin) {
        super(leaf);
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
    }

    private getTaskRange(task: PlannerTask, todayMs: number): { start: number; end: number } {
        let start: number | null = null;
        let end: number | null = null;

        if (task.startDate) {
            // Parse date correctly to avoid timezone issues (YYYY-MM-DD format)
            const parts = task.startDate.split("-");
            const startDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            startDate.setHours(0, 0, 0, 0);
            start = startDate.getTime();
        }

        if (task.dueDate) {
            // Parse date correctly to avoid timezone issues (YYYY-MM-DD format)
            const parts = task.dueDate.split("-");
            const endDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            endDate.setHours(0, 0, 0, 0);
            end = endDate.getTime();
        }

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
        await this.plugin.taskStore.updateTask(taskId, {
            startDate: this.toISODate(startMs),
            dueDate: this.toISODate(endMs)
        });
    }

    private async updateTaskTitle(taskId: string, title: string) {
        await this.plugin.taskStore.updateTask(taskId, { title });
    }

    private async handleDrop(dragId: string, targetId: string, insertAfter: boolean) {
        const tasks = this.plugin.taskStore.getAll();
        const dragTask = tasks.find((t: PlannerTask) => t.id === dragId);
        const targetTask = tasks.find((t: PlannerTask) => t.id === targetId);

        if (!dragTask || !targetTask) return;
        if (dragTask.id === targetTask.id) return;

        const ids = tasks.map((t: PlannerTask) => t.id);

        // Helper to get all descendants recursively
        const getAllDescendants = (taskId: string): string[] => {
            const descendants: string[] = [];
            const children = tasks.filter((t: PlannerTask) => t.parentId === taskId);
            for (const child of children) {
                descendants.push(child.id);
                descendants.push(...getAllDescendants(child.id));
            }
            return descendants;
        };

        // Parent drag: move parent + all descendants as a contiguous block
        if (!dragTask.parentId) {
            const blockIds: string[] = [dragTask.id, ...getAllDescendants(dragTask.id)];

            // If target is inside the same block, ignore
            if (blockIds.includes(targetTask.id)) return;

            const targetRootId = targetTask.parentId || targetTask.id;

            // If dropping onto one of own descendants, ignore
            if (blockIds.includes(targetRootId)) return;

            // Remove block from ids
            const firstIdx = ids.indexOf(blockIds[0]);
            if (firstIdx === -1) return;
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
            await (this.plugin as any).taskStore.setOrder(ids);
            this.render();
            return;
        }

        // Child drag: move subtask (and its descendants) and update hierarchy if needed
        const blockIds: string[] = [dragTask.id, ...getAllDescendants(dragTask.id)];

        // Don't allow dropping onto own descendants
        if (blockIds.includes(targetTask.id)) return;

        const fromIndex = ids.indexOf(dragId);
        if (fromIndex === -1) return;
        ids.splice(fromIndex, blockIds.length);

        let insertIndex = ids.indexOf(targetId);
        if (insertIndex === -1) {
            insertIndex = ids.length;
        } else if (insertAfter) {
            insertIndex += 1;
        }

        ids.splice(insertIndex, 0, ...blockIds);

        // Determine new parent based on drop location
        let newParentId: string | null = null;

        if (insertIndex > 0) {
            const taskBeforeId = ids[insertIndex - 1];
            const taskBefore = tasks.find((t: PlannerTask) => t.id === taskBeforeId);

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
            await (this.plugin as any).taskStore.updateTask(dragId, { parentId: newParentId });
        }

        await (this.plugin as any).taskStore.setOrder(ids);
        this.render();
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
                if (!this.clipboardTask) return;

                const { task: clipTask, isCut } = this.clipboardTask;
                const store = (this.plugin as any).taskStore;

                if (isCut) {
                    // Move the task by updating its parentId
                    await store.updateTask(clipTask.id, {
                        parentId: task.parentId,
                    });
                    this.clipboardTask = null;
                } else {
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

                this.render();
            });
        });

        menu.addSeparator();

        // Copy link to task
        menu.addItem((item) => {
            item.setTitle("Copy link to task");
            item.setIcon("link");
            item.onClick(async () => {
                const projectId = this.plugin.settings.activeProjectId;
                const uri = `obsidian://open-planner-task?id=${encodeURIComponent(
                    task.id
                )}&project=${encodeURIComponent(projectId)}`;

                try {
                    await navigator.clipboard.writeText(uri);
                    new Notice("Task link copied to clipboard");
                } catch (err) {
                    console.error("Failed to copy link:", err);
                    new Notice("Failed to copy link");
                }
            });
        });

        // Open Markdown task note
        menu.addItem((item) => {
            item.setTitle("Open Markdown task note");
            item.setIcon("file-text");
            item.setDisabled(!this.plugin.settings.enableMarkdownSync);
            item.onClick(async () => {
                if (!this.plugin.settings.enableMarkdownSync) return;

                const projectId = this.plugin.settings.activeProjectId;
                const project = this.plugin.settings.projects.find(
                    (p) => p.id === projectId
                );
                if (!project) return;

                // Use the same path as TaskSync
                const filePath = this.plugin.taskSync.getTaskFilePath(task, project.name);

                try {
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (file && file instanceof TFile) {
                        await this.app.workspace.openLinkText(filePath, "", true);
                    } else {
                        // Note doesn't exist - create it
                        new Notice("Creating task note...");
                        await this.plugin.taskSync.syncTaskToMarkdown(task, projectId);
                        // Wait a moment for the file to be created, then open it
                        setTimeout(async () => {
                            await this.app.workspace.openLinkText(filePath, "", true);
                        }, 100);
                    }
                } catch (err) {
                    console.error("Failed to open task note:", err);
                    new Notice("Failed to open task note");
                }
            });
        });

        menu.addSeparator();

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
                        await store.setOrder(reordered.map((t: PlannerTask) => t.id));
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
        task: PlannerTask,
        hasChildren: boolean = false
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

    private showDatePicker(evt: MouseEvent, btn: HTMLElement) {
        const menu = new Menu();

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
                        } else if (e.key === "Escape") {
                            cancelBtn.click();
                        }
                    };

                    document.body.appendChild(modal);
                    input.focus();
                });
        });

        menu.showAtMouseEvent(evt);
    }

    private scrollToDate(targetDate: Date) {
        // Store target date and re-render (the render will handle scrolling)
        (this as any).scrollTargetDate = targetDate;
        this.render();
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
        const statusFilterGroup = filters.createDiv("planner-filter-group");
        statusFilterGroup.createSpan({ cls: "planner-filter-label", text: "Status:" });
        const statusFilter = statusFilterGroup.createEl("select", { cls: "planner-filter-select" });
        ["All", "Not Started", "In Progress", "Blocked", "Completed"].forEach(status => {
            const option = statusFilter.createEl("option", { text: status, value: status });
            if (status === this.currentFilters.status) option.selected = true;
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
            const hasActiveFilters =
                this.currentFilters.status !== "All" ||
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
            if (level === this.zoomLevel) btn.classList.add("active");
            btn.onclick = () => {
                this.zoomLevel = level as "day" | "week" | "month";
                this.render();
            };
        });

        // Go to date button
        const goToDateBtn = toolbar.createEl("button", {
            text: "Go to date",
            cls: "planner-goto-date-btn"
        });
        setIcon(goToDateBtn.createSpan({ cls: "planner-goto-date-icon" }), "calendar");
        goToDateBtn.onclick = (e) => {
            this.showDatePicker(e, goToDateBtn);
        };

        // Content area
        const content = container.createDiv("planner-gantt-content");
        const allTasks: PlannerTask[] = this.plugin.taskStore.getAll();

        // Build hierarchical task list with filters
        const matchesFilter = new Map<string, boolean>();
        for (const t of allTasks) {
            matchesFilter.set(t.id, this.matchesFilters(t));
        }

        // Build visible task hierarchy
        const visibleTasks: VisibleTask[] = [];
        const roots = allTasks.filter((t) => !t.parentId);

        const addTaskAndChildren = (task: PlannerTask, depth: number) => {
            const children = allTasks.filter((t) => t.parentId === task.id);
            const taskMatches = matchesFilter.get(task.id) ?? true;
            const matchingChildren = children.filter(
                (c) => matchesFilter.get(c.id) ?? true
            );

            const hasChildren = children.length > 0;

            if (!taskMatches && matchingChildren.length === 0) return;

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
        let isLeftScrolling = false;
        let isRightScrolling = false;

        leftCol.addEventListener('scroll', () => {
            if (!isLeftScrolling) {
                isRightScrolling = true;
                rightColWrap.scrollTop = leftCol.scrollTop;
                setTimeout(() => { isRightScrolling = false; }, 10);
            }
        });

        rightColWrap.addEventListener('scroll', () => {
            if (!isRightScrolling) {
                isLeftScrolling = true;
                leftCol.scrollTop = rightColWrap.scrollTop;
                setTimeout(() => { isLeftScrolling = false; }, 10);
            }
        });

        // Two-tier date scale (like MS Planner)
        const scale = rightCol.createDiv("planner-gantt-scale");

        // Top tier: Months/Years
        const monthRow = scale.createDiv("planner-gantt-scale-months");

        // Bottom tier: Days/Weeks based on zoom
        const dayRow = scale.createDiv("planner-gantt-scale-days");

        // Group days by month and create month headers
        const monthGroups = new Map<string, { start: number; count: number; date: Date }>();

        for (let i = 0; i < totalDays; i++) {
            const date = new Date(minTime + i * dayMs);
            const monthKey = `${date.getFullYear()}-${date.getMonth()}`;

            if (!monthGroups.has(monthKey)) {
                monthGroups.set(monthKey, { start: i, count: 1, date });
            } else {
                monthGroups.get(monthKey)!.count++;
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
            } else if (this.zoomLevel === "week") {
                // Show week start dates (Mondays)
                if (date.getDay() === 1) {
                    dayCell.setText(`${date.getDate()}`);
                    dayCell.classList.add("planner-gantt-week-marker");
                }
            } else if (this.zoomLevel === "month") {
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
        const statusColor = (status: string): string => {
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
            if (t.completed) rowLeft.classList.add("planner-task-completed");

            // Add indentation based on depth
            const indent = vt.depth * 20;
            rowLeft.style.paddingLeft = `${indent + 8}px`;

            // Collapse/expand toggle for parent tasks
            if (vt.hasChildren) {
                const toggle = rowLeft.createDiv({
                    cls: "planner-expand-toggle"
                });
                setIcon(toggle, t.collapsed ? "chevron-right" : "chevron-down");
                toggle.onclick = async (e) => {
                    e.stopPropagation();
                    await this.plugin.taskStore.updateTask(t.id, {
                        collapsed: !t.collapsed
                    });
                };
            } else {
                // Add spacing for tasks without children to align with those that have toggle
                const spacer = rowLeft.createDiv({ cls: "planner-expand-spacer" });
            }

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
                await this.plugin.taskStore.updateTask(t.id, { status: newStatus });
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

        // Handle scroll to date if requested
        const scrollTarget = (this as any).scrollTargetDate;
        if (scrollTarget && rightColWrap) {
            delete (this as any).scrollTargetDate;

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

    private attachResizerHandlers(resizer: HTMLElement, layout: HTMLElement) {
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        const onMouseDown = (e: MouseEvent) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = this.leftColumnWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;

            const delta = e.clientX - startX;
            const newWidth = Math.max(200, Math.min(600, startWidth + delta)); // Min 200px, max 600px

            this.leftColumnWidth = newWidth;
            layout.style.gridTemplateColumns = `${newWidth}px 1fr`;
            resizer.style.left = `${newWidth}px`;
        };

        const onMouseUp = async () => {
            if (!isResizing) return;

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

        // Cleanup on view close
        this.register(() => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        });
    }
}
