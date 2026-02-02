import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon } from "obsidian";
import type ProjectPlannerPlugin from "../main";
import type { PlannerTask } from "../types";

export const VIEW_TYPE_TASK_DETAIL = "project-planner-task-detail";

export class TaskDetailView extends ItemView {
  private plugin: ProjectPlannerPlugin;
  private task: PlannerTask | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ProjectPlannerPlugin) {
    super(leaf);
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

  private getCanonicalTask(id: string): PlannerTask | null {
    // Use plugin's taskStore directly - it's the single source of truth
    return this.plugin.taskStore.getAll().find((t: PlannerTask) => t.id === id) || null;
  }

  // Called when GridView selects a task
  setTask(task: PlannerTask) {
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
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  render() {
    const container = this.containerEl;
    container.empty();
    container.addClass("planner-detail-wrapper");

    if (!this.task) {
      container.createEl("div", { text: "No task selected." });
      return;
    }

    const task = this.task;

    //
    // COMPLETE BUTTON — top action
    //
    const headerContainer = container.createDiv("planner-detail-header");
    const completeBtn = headerContainer.createEl("button", {
      cls: "planner-complete-btn"
    });
    const checkIcon = completeBtn.createSpan({ cls: "planner-btn-icon" });
    setIcon(checkIcon, task.status === "Completed" ? "check-circle" : "circle");
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
    setIcon(linkIcon, "link");
    copyLinkBtn.createSpan({ cls: "planner-btn-text", text: "Copy Link" });

    copyLinkBtn.onclick = async () => {
      const projectId = this.plugin.settings?.activeProjectId || "";
      const uri = `obsidian://open-planner-task?id=${encodeURIComponent(task.id)}&project=${encodeURIComponent(projectId)}`;

      await navigator.clipboard.writeText(uri);

      // Visual feedback
      copyLinkBtn.classList.add("planner-btn-success");
      linkIcon.empty();
      setIcon(linkIcon, "check");
      const textSpan = copyLinkBtn.querySelector(".planner-btn-text");
      if (textSpan) textSpan.textContent = "Copied!";

      setTimeout(() => {
        copyLinkBtn.classList.remove("planner-btn-success");
        linkIcon.empty();
        setIcon(linkIcon, "link");
        if (textSpan) textSpan.textContent = "Copy Link";
      }, 2000);
    };

    // CLOSE PANEL button
    const closeBtn = headerContainer.createEl("button", {
      cls: "planner-close-btn",
      title: "Close Task Details"
    });
    const closeIcon = closeBtn.createSpan({ cls: "planner-btn-icon" });
    setIcon(closeIcon, "x");

    closeBtn.onclick = () => {
      try {
        this.leaf?.detach();
      } catch (e) {
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
    this.createEditableMarkdown(
      container,
      task.description || "",
      async (val) => {
        await this.update({ description: val });
      }
    );

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

    this.createEditableSelect(
      container,
      task.priority || defaultPriority,
      priorityNames,
      async (val) => {
        await this.update({ priority: val });
      }
    );

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
    } else {
      for (let i = 0; i < subtasks.length; i++) {
        this.renderSubtaskRow(checklistWrapper, subtasks[i].id, i);
      }
    }

    const addBtn = container.createEl("button", {
      cls: "planner-subtask-add",
      text: "Add checklist item",
    });

    addBtn.onclick = async () => {
      if (!this.task) return;

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
    const cardPreviewLabels: Record<string, string> = {
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
      await this.update({ cardPreview: cardPreviewSelect.value as "none" | "checklist" | "description" });
    };

    //
    // BUCKET — dropdown
    //
    container.createEl("h3", { text: "Bucket" });
    const activeProject = settings.projects?.find(
      p => p.id === settings.activeProjectId
    );
    const buckets = activeProject?.buckets || [];
    const bucketNames = ["Unassigned", ...buckets.map(b => b.name)];
    const currentBucketId = task.bucketId;
    const currentBucketName = currentBucketId
      ? buckets.find(b => b.id === currentBucketId)?.name || "Unassigned"
      : "Unassigned";

    this.createEditableSelect(
      container,
      currentBucketName,
      bucketNames,
      async (val) => {
        if (val === "Unassigned") {
          await this.update({ bucketId: undefined });
        } else {
          const selectedBucket = buckets.find(b => b.name === val);
          if (selectedBucket) {
            await this.update({ bucketId: selectedBucket.id });
          }
        }
      }
    );

    //
    // START DATE
    //
    container.createEl("h3", { text: "Start Date" });
    this.createEditableDateTime(container, task.startDate, async (val) => {
      await this.update({ startDate: val });
    });

    //
    // DUE DATE
    //
    container.createEl("h3", { text: "Due Date" });
    this.createEditableDateTime(container, task.dueDate, async (val) => {
      await this.update({ dueDate: val });
    });

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

  private renderSubtaskRow(parent: HTMLElement, subtaskId: string, index: number) {
    if (!this.task) return;

    const subtasks = this.task.subtasks ?? [];
    const sub = subtasks.find((s) => s.id === subtaskId);
    if (!sub) return;

    const row = parent.createDiv("planner-subtask-row");
    row.dataset.subtaskId = sub.id;

    // Drag handle
    const dragHandle = row.createEl("span", {
      cls: "planner-subtask-drag-handle",
      text: "⋮⋮",
    });

    dragHandle.onpointerdown = (evt: PointerEvent) => {
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

      const inner = row.cloneNode(true) as HTMLElement;
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

      let dragTargetId: string | null = null;
      let dragInsertAfter = false;

      row.classList.add("planner-subtask-dragging");
      document.body.style.userSelect = "none";
      (document.body.style as any).webkitUserSelect = "none";
      document.body.style.cursor = "grabbing";

      const offsetY = evt.clientY - rowRect.top;

      const onMove = (moveEvt: PointerEvent) => {
        moveEvt.preventDefault();

        const y = moveEvt.clientY - offsetY;
        ghost.style.top = `${y}px`;

        const targetEl = document.elementFromPoint(
          moveEvt.clientX,
          moveEvt.clientY
        ) as HTMLElement | null;

        const targetRow = targetEl?.closest(".planner-subtask-row") as HTMLElement | null;

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

      const onUp = async (upEvt: PointerEvent) => {
        upEvt.preventDefault();

        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);

        ghost.remove();
        indicator.remove();

        row.classList.remove("planner-subtask-dragging");
        document.body.style.userSelect = "";
        (document.body.style as any).webkitUserSelect = "";
        document.body.style.cursor = "";

        if (dragTargetId && dragTargetId !== sub.id) {
          await this.handleSubtaskDrop(sub.id, dragTargetId, dragInsertAfter);
        }
      };

      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
    };

    // Checkbox
    const checkbox = row.createEl("input", {
      attr: { type: "checkbox" },
    });
    checkbox.checked = !!sub.completed;

    checkbox.onchange = async () => {
      if (!this.task) return;

      const updated = (this.task.subtasks ?? []).map((s) =>
        s.id === sub.id ? { ...s, completed: checkbox.checked } : s
      );
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
        if (!this.task) return;

        const newTitle = input.value.trim() || sub.title;
        const updated = (this.task.subtasks ?? []).map((s) =>
          s.id === sub.id ? { ...s, title: newTitle } : s
        );
        await this.update({ subtasks: updated });
      };

      input.onblur = () => void commit();
      input.onkeydown = (e) => {
        if (e.key === "Enter") void commit();
        if (e.key === "Escape") this.render();
      };
    };

    // Delete button
    const delBtn = row.createEl("button", {
      text: "✕",
      cls: "planner-subtask-delete",
    });

    delBtn.onclick = async () => {
      if (!this.task) return;

      const updated = (this.task.subtasks ?? []).filter((s) => s.id !== sub.id);
      await this.update({ subtasks: updated });
    };
  }

  // Handle subtask drag and drop reordering
  private async handleSubtaskDrop(
    dragId: string,
    targetId: string,
    insertAfter: boolean
  ) {
    if (!this.task) return;

    const subtasks = this.task.subtasks ?? [];
    const dragIndex = subtasks.findIndex((s) => s.id === dragId);
    const targetIndex = subtasks.findIndex((s) => s.id === targetId);

    if (dragIndex === -1 || targetIndex === -1) return;

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

  private async update(fields: Partial<PlannerTask>) {
    if (!this.task) return;

    // Update canonical TaskStore via plugin.updateTask()
    await this.plugin.updateTask(this.task.id, fields);

    // Fetch fresh canonical task from TaskStore after update
    const updated = this.getCanonicalTask(this.task.id);
    if (updated) {
      this.task = updated;
    }

    // Re-render panel with fresh data
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Editable Controls
  // ---------------------------------------------------------------------------

  private createEditableInput(
    container: HTMLElement,
    value: string,
    onSave: (val: string) => Promise<void>
  ) {
    const input = container.createEl("input", {
      attr: { type: "text" },
    });

    input.value = value;
    input.classList.add("planner-detail-input");

    const commit = () => onSave(input.value.trim());

    input.onblur = commit;
    input.onkeydown = (e) => {
      if (e.key === "Enter") commit();
    };
  }

  private createEditableTextarea(
    container: HTMLElement,
    value: string,
    onSave: (val: string) => Promise<void>
  ) {
    const area = container.createEl("textarea", {
      cls: "planner-detail-textarea",
    });

    area.value = value;

    area.onblur = () => {
      void onSave(area.value.trim());
    };
  }

  private createEditableMarkdown(
    container: HTMLElement,
    value: string,
    onSave: (val: string) => Promise<void>
  ) {
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
        await MarkdownRenderer.render(
          this.app,
          value,
          previewContainer,
          "",
          this.plugin
        );
      } else {
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
      } else {
        editContainer.style.display = "none";
        previewContainer.style.display = "block";
        await renderPreview();
      }
    };

    // Initial state: show preview
    editContainer.style.display = "none";
    void renderPreview();
  }

  private createEditableSelect<T extends string>(
    container: HTMLElement,
    value: T,
    options: readonly T[],
    onSave: (val: T) => Promise<void>
  ) {
    const select = container.createEl("select", {
      cls: "planner-detail-select",
    });

    for (const opt of options) {
      const optionEl = select.createEl("option", { text: opt });
      if (opt === value) optionEl.selected = true;
    }

    select.onchange = () => {
      void onSave(select.value as T);
    };
  }

  private createEditableDateTime(
    container: HTMLElement,
    value: string | undefined,
    onSave: (val: string) => Promise<void>
  ) {
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

  private renderDependencies(container: HTMLElement, task: PlannerTask) {
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
    } else {
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

          const typeSpan = depRow.createEl("span", {
            cls: "planner-dependency-type",
            text: typeLabels[dep.type]
          });

          // Task title
          const titleSpan = depRow.createEl("span", {
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
      if (t.id === task.id) return false; // Can't depend on itself
      if (t.parentId === task.id) return false; // Can't depend on child
      if (dependencies.some(d => d.predecessorId === t.id)) return false; // Already added
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
            type: typeSelect.value as any
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
    } else {
      addDepDiv.createEl("div", {
        text: "No available tasks to add as dependencies.",
        cls: "planner-no-dependencies-hint"
      });
    }
  }

  private getAllTasks(): PlannerTask[] {
    const leaf = this.app.workspace.getLeavesOfType("project-planner-view")[0];
    if (!leaf) return [];

    const grid: any = leaf.view;
    if (!grid || !grid.taskStore) return [];

    return grid.taskStore.getAll();
  }

  private wouldCreateCircularDependency(taskId: string, predecessorId: string): boolean {
    const allTasks = this.getAllTasks();
    const visited = new Set<string>();

    // Walk the dependency chain from predecessor
    const checkChain = (currentId: string): boolean => {
      if (currentId === taskId) return true; // Circular!
      if (visited.has(currentId)) return false;
      visited.add(currentId);

      const current = allTasks.find(t => t.id === currentId);
      if (!current || !current.dependencies) return false;

      for (const dep of current.dependencies) {
        if (checkChain(dep.predecessorId)) return true;
      }

      return false;
    };

    return checkChain(predecessorId);
  }

  // ---------------------------------------------------------------------------
  // Links / Attachments
  // ---------------------------------------------------------------------------

  private renderLinks(container: HTMLElement, task: PlannerTask) {
    const links = task.links || [];

    const linkContainer = container.createDiv("planner-link-container");

    // Display existing links
    const assignedLinksDiv = linkContainer.createDiv("planner-assigned-links");
    if (links.length === 0) {
      assignedLinksDiv.createEl("span", {
        text: "No links or attachments",
        cls: "planner-no-links"
      });
    } else {
      links.forEach((link, index) => {
        const linkRow = assignedLinksDiv.createDiv({
          cls: "planner-link-row"
        });

        // Link icon based on type
        const iconSpan = linkRow.createEl("span", {
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
        } else {
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
      let linkType: "obsidian" | "external" = "external";
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

  private createLinkId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Tags
  // ---------------------------------------------------------------------------

  private renderTagSelector(container: HTMLElement, task: PlannerTask) {
    const pluginAny = this.plugin as any;
    const settings = pluginAny.settings || {};
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
    } else {
      taskTags.forEach((tagId) => {
        const tag = availableTags.find((t: any) => t.id === tagId);
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

      availableTags.forEach((tag: any) => {
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
    } else {
      tagContainer.createEl("div", {
        text: "No tags available. Create tags in plugin settings.",
        cls: "planner-no-tags-hint"
      });
    }
  }

  // Helpers
  // ---------------------------------------------------------------------------

  private createSubtaskId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
