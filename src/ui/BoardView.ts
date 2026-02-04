import { ItemView, WorkspaceLeaf, Menu, setIcon, MarkdownRenderer } from "obsidian";
import type ProjectPlannerPlugin from "../main";
import type { PlannerTask } from "../types";
import { TaskStore } from "../stores/taskStore";
import type { BoardBucket } from "../settings";
import { renderPlannerHeader } from "./Header";

export const VIEW_TYPE_BOARD = "project-planner-board-view";

export class BoardView extends ItemView {
    private plugin: ProjectPlannerPlugin;
    public taskStore: TaskStore;
    private unsubscribe: (() => void) | null = null;
    private draggedTaskId: string | null = null;
    private draggedBucketId: string | null = null;
    private dropTargetCardId: string | null = null;
    private dropPosition: "before" | "after" | null = null;
    private buckets: BoardBucket[] = [];
    private completedSectionsCollapsed: { [bucketId: string]: boolean } = {};

    // Filters
    private currentFilters = {
        priority: "All",
        search: ""
    };

    constructor(leaf: WorkspaceLeaf, plugin: ProjectPlannerPlugin) {
        super(leaf);
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

    private isParentTask(taskId: string, allTasks: PlannerTask[]): boolean {
        // A task is a parent if any other task has this task's ID as their parentId
        return allTasks.some(t => t.parentId === taskId);
    }

    private filterLeafTasks(tasks: PlannerTask[]): PlannerTask[] {
        // Only return tasks that are not parents (leaf tasks only)
        const allTasks = this.taskStore.getAll();
        return tasks.filter(t => !this.isParentTask(t.id, allTasks));
    }

    private matchesFilters(task: PlannerTask): boolean {
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

    private async initializeBuckets() {
        const settings = this.plugin.settings;
        const activeProjectId = settings.activeProjectId;
        const projects = settings.projects || [];
        const activeProject = projects.find(p => p.id === activeProjectId);

        // Load buckets from project settings (each project has its own bucket layout)
        if (activeProject && activeProject.buckets && activeProject.buckets.length > 0) {
            this.buckets = [...activeProject.buckets];
        } else {
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
        } else {
            // Reset collapsed state for new project
            this.completedSectionsCollapsed = {};
        }
    }

    async render() {
        const container = this.containerEl;
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
                this.currentFilters.priority !== "All" ||
                this.currentFilters.search.trim() !== "";
            clearFilterBtn.style.display = hasActiveFilters ? "inline-block" : "none";
        };

        clearFilterBtn.onclick = () => {
            this.render();
        };

        updateClearButtonVisibility();

        // Render board columns
        await this.renderBoard(wrapper);
    }

    // Header is now shared; previous method removed

    private async renderBoard(wrapper: HTMLElement) {
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
                this.render();
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

    private renderAddBucketColumn(boardContainer: HTMLElement) {
        const addColumn = boardContainer.createDiv("planner-board-column planner-board-add-bucket");

        const addButton = addColumn.createDiv("planner-board-add-bucket-btn");

        const icon = addButton.createSpan("planner-board-add-bucket-icon");
        icon.textContent = "+";

        const label = addButton.createSpan("planner-board-add-bucket-label");
        label.textContent = "Add new bucket";

        addButton.onclick = async () => {
            const newBucket: BoardBucket = {
                id: crypto.randomUUID(),
                name: "New Bucket"
            };
            this.buckets.push(newBucket);
            await this.saveBuckets();
            this.render();
        };
    }

    private async renderCard(container: HTMLElement, task: PlannerTask) {
        const card = container.createDiv("planner-board-card");
        card.setAttribute("data-task-id", task.id);
        card.draggable = true;

        // Drag events
        card.ondragstart = (e) => {
            this.draggedTaskId = task.id;
            card.classList.add("planner-board-card-dragging");
            e.dataTransfer!.effectAllowed = "move";
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
            
            if (!this.draggedTaskId || this.draggedTaskId === task.id) return;

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
            } else {
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

            if (!this.draggedTaskId || !this.dropTargetCardId || this.draggedTaskId === this.dropTargetCardId) return;

            const draggedTask = this.taskStore.getAll().find(t => t.id === this.draggedTaskId);
            const targetTask = this.taskStore.getAll().find(t => t.id === this.dropTargetCardId);

            if (!draggedTask || !targetTask) return;

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
            if ((e.target as HTMLElement).closest('.planner-board-card-checkbox, .planner-board-card-menu')) {
                return;
            }
            await this.plugin.openTaskDetail(task);
        };

        // Priority indicator (icon on the side for High/Critical)
        if (task.priority && (task.priority === "High" || task.priority === "Critical")) {
            const priorityBadge = card.createDiv("planner-board-card-priority");
            if (task.priority === "Critical") {
                priorityBadge.textContent = "🔥";
            } else {
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
            await this.taskStore.updateTask(task.id, { completed: !task.completed });
            this.render();
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
                    const updatedSubtasks = task.subtasks!.map(s => 
                        s.id === subtask.id ? { ...s, completed: !s.completed } : s
                    );
                    await this.taskStore.updateTask(task.id, { subtasks: updatedSubtasks });
                    this.render();
                };
                const label = itemDiv.createSpan("planner-board-checklist-label");
                label.textContent = subtask.title;
                if (subtask.completed) {
                    label.classList.add("planner-board-checklist-completed");
                }
            });
        } else if (cardPreview === "description" && task.description) {
            const descContainer = card.createDiv("planner-board-card-description");
            // Render markdown in description
            await MarkdownRenderer.render(
                this.app,
                task.description,
                descContainer,
                "",
                this.plugin
            );
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
            } else if (isToday) {
                dueDate.classList.add("planner-board-card-date-today");
            }

            // Format date based on user preference
            const dateFormat = this.plugin.settings.dateFormat || "iso";
            let formatted: string;
            
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

    private showCardMenu(task: PlannerTask, evt: MouseEvent) {
        const menu = new Menu();

        menu.addItem((item) =>
            item
                .setTitle("Open details")
                .setIcon("pencil")
                .onClick(() => this.plugin.openTaskDetail(task))
        );

        menu.addSeparator();

        menu.addItem((item) =>
            item
                .setTitle("Delete task")
                .setIcon("trash")
                .onClick(async () => {
                    await this.taskStore.deleteTask(task.id);
                    this.render();
                })
        );

        menu.showAtMouseEvent(evt);
    }

    private async renderCompletedSection(columnContent: HTMLElement, completedTasks: PlannerTask[], bucketId: string) {
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

    private async saveCompletedSectionsState() {
        const pluginAny = this.plugin as any;
        const settings = pluginAny.settings || {};
        const activeProjectId = settings.activeProjectId;
        const projects = settings.projects || [];
        const activeProject = projects.find((p: any) => p.id === activeProjectId);

        if (activeProject) {
            activeProject.completedSectionsCollapsed = { ...this.completedSectionsCollapsed };
            await this.plugin.saveSettings();
        }
    }

    private setupDropZone(columnContent: HTMLElement, bucket: BoardBucket) {
        columnContent.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer!.dropEffect = "move";
            columnContent.classList.add("planner-board-column-dragover");
        };

        columnContent.ondragleave = () => {
            columnContent.classList.remove("planner-board-column-dragover");
        };

        columnContent.ondrop = async (e) => {
            e.preventDefault();
            columnContent.classList.remove("planner-board-column-dragover");

            if (!this.draggedTaskId) return;

            // Update task bucket
            if (bucket.id === "unassigned") {
                // Remove bucketId to move to unassigned
                await this.taskStore.updateTask(this.draggedTaskId, {
                    bucketId: undefined,
                });
            } else {
                await this.taskStore.updateTask(this.draggedTaskId, {
                    bucketId: bucket.id,
                });
            }

            this.render();
        };
    }

    private async renderUnassignedBucket(boardContainer: HTMLElement, tasks: PlannerTask[]) {
        // Filter tasks without bucketId (tasks are already filtered to exclude parents)
        const unassignedTasks = tasks.filter((t) => !t.bucketId);

        // Get custom name from settings
        const pluginAny = this.plugin as any;
        const settings = pluginAny.settings || {};
        const activeProjectId = settings.activeProjectId;
        const projects = settings.projects || [];
        const activeProject = projects.find((p: any) => p.id === activeProjectId);
        const bucketName = activeProject?.unassignedBucketName || "📋 Unassigned";

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
            const menu = new Menu();
            menu.addItem((item) =>
                item
                    .setTitle("Rename bucket")
                    .setIcon("pencil")
                    .onClick(() => {
                        this.startRenameUnassignedBucket(headerTitle);
                    })
            );
            menu.showAtMouseEvent(e);
        };

        // Task count
        const taskCount = columnHeader.createDiv("planner-board-column-count");
        taskCount.textContent = `${unassignedTasks.length}`;

        // Column content (cards container)
        const columnContent = column.createDiv("planner-board-column-content");
        columnContent.setAttribute("data-bucket-id", "unassigned");

        // Enable drop zone for unassigned bucket (allows moving tasks back)
        const unassignedBucket: BoardBucket = { id: "unassigned", name: "Unassigned" };
        this.setupDropZone(columnContent, unassignedBucket);

        // Add task button at the top (MS Planner style)
        const addTaskBtn = columnContent.createDiv("planner-board-add-card");
        addTaskBtn.textContent = "+ Add task";
        addTaskBtn.onclick = async () => {
            const newTask = await this.taskStore.addTask("New Task");
            // Don't assign bucketId - leave it unassigned
            this.render();
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

    private startRenameUnassignedBucket(titleElement: HTMLElement) {
        const pluginAny = this.plugin as any;
        const settings = pluginAny.settings || {};
        const activeProjectId = settings.activeProjectId;
        const projects = settings.projects || [];
        const activeProject = projects.find((p: any) => p.id === activeProjectId);
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

            if (newName && newName !== originalName && activeProject) {
                activeProject.unassignedBucketName = newName;
                await this.plugin.saveSettings();
            } else {
                titleElement.textContent = originalName;
            }
        };

        titleElement.onblur = finishRename;
        titleElement.onkeydown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                titleElement.blur();
            } else if (e.key === "Escape") {
                e.preventDefault();
                titleElement.textContent = originalName;
                titleElement.blur();
            }
        };
    }

    private startRenameBucket(titleElement: HTMLElement, bucket: BoardBucket) {
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
            } else {
                titleElement.textContent = originalName;
            }
        };

        titleElement.onblur = finishRename;
        titleElement.onkeydown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                titleElement.blur();
            } else if (e.key === "Escape") {
                e.preventDefault();
                titleElement.textContent = originalName;
                titleElement.blur();
            }
        };
    }

    private createEditableBucketName(container: HTMLElement, bucket: BoardBucket): void {
        container.empty();
        const span = container.createEl("span", { text: bucket.name });
        span.classList.add("planner-editable");

        const openEditor = (e: MouseEvent) => {
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
                } else {
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

    private createEditableUnassignedBucketName(container: HTMLElement): void {
        const pluginAny = this.plugin as any;
        const settings = pluginAny.settings || {};
        const activeProjectId = settings.activeProjectId;
        const projects = settings.projects || [];
        const activeProject = projects.find((p: any) => p.id === activeProjectId);
        let currentName = activeProject?.unassignedBucketName || "📋 Unassigned";

        container.empty();
        const span = container.createEl("span", { text: currentName });
        span.classList.add("planner-editable");

        const openEditor = (e: MouseEvent) => {
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
                } else {
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

    private showBucketContextMenu(e: MouseEvent, bucket: BoardBucket, header: HTMLElement) {
        const menu = new Menu();

        menu.addItem((item) =>
            item
                .setTitle("Rename bucket")
                .setIcon("pencil")
                .onClick(() => {
                    const titleEl = header.querySelector(".planner-board-column-title") as HTMLElement;
                    if (titleEl) {
                        this.startRenameBucket(titleEl, bucket);
                    }
                })
        );

        menu.addItem((item) =>
            item
                .setTitle("Change color")
                .setIcon("palette")
                .onClick(() => {
                    this.showColorPicker(bucket, header);
                })
        );

        menu.addItem((item) =>
            item
                .setTitle("Add bucket to right")
                .setIcon("plus")
                .onClick(async () => {
                    const newBucket: BoardBucket = {
                        id: crypto.randomUUID(),
                        name: "New Bucket"
                    };
                    const bucketIndex = this.buckets.indexOf(bucket);
                    this.buckets.splice(bucketIndex + 1, 0, newBucket);
                    await this.saveBuckets();
                    this.render();
                })
        );

        menu.addSeparator();

        menu.addItem((item) =>
            item
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
                })
        );

        menu.showAtMouseEvent(e);
    }

    private showColorPicker(bucket: BoardBucket, header: HTMLElement) {
        const menu = new Menu();

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
                        const iconEl = (item as any).dom?.querySelector(".menu-item-icon");
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
                    } else {
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

    private getContrastColor(hexColor: string): string {
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

    private async saveBuckets() {
        const pluginAny = this.plugin as any;
        const settings = pluginAny.settings || {};
        const activeProjectId = settings.activeProjectId;
        const projects = settings.projects || [];
        const activeProject = projects.find((p: any) => p.id === activeProjectId);

        if (activeProject) {
            activeProject.buckets = [...this.buckets];
            await this.plugin.saveSettings();
        }
    }

    private setupBucketDrag(header: HTMLElement, column: HTMLElement, bucket: BoardBucket) {
        // Drag start
        header.ondragstart = (e) => {
            this.draggedBucketId = bucket.id;
            column.classList.add("planner-board-column-dragging");
            e.dataTransfer!.effectAllowed = "move";
            e.dataTransfer!.setData("text/plain", bucket.id);
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
            if (!this.draggedBucketId || this.draggedTaskId) return;

            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer!.dropEffect = "move";

            if (this.draggedBucketId !== bucket.id) {
                column.classList.add("planner-board-column-dragover-bucket");
            }
        };

        // Drag leave
        column.ondragleave = (e) => {
            if (!this.draggedBucketId) return;

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
            if (!this.draggedBucketId || this.draggedTaskId) return;

            e.preventDefault();
            e.stopPropagation();
            column.classList.remove("planner-board-column-dragover-bucket");

            const draggedId = this.draggedBucketId;
            const targetId = bucket.id;

            if (draggedId === targetId) return;

            // Find indices
            const draggedIndex = this.buckets.findIndex(b => b.id === draggedId);
            const targetIndex = this.buckets.findIndex(b => b.id === targetId);

            if (draggedIndex === -1 || targetIndex === -1) return;

            // Reorder buckets array
            const [draggedBucket] = this.buckets.splice(draggedIndex, 1);
            this.buckets.splice(targetIndex, 0, draggedBucket);

            // Save new order and re-render
            await this.saveBuckets();
            this.render();
        };
    }

    // Public API for task updates
    async updateTask(id: string, fields: Partial<PlannerTask>) {
        await this.taskStore.updateTask(id, fields);
        this.render();
    }
}
