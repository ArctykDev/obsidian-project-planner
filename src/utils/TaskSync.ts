import { App, TFile } from "obsidian";
import { PlannerTask, TaskDependency, TaskLink, PlannerSubtask } from "../types";
import type ProjectPlannerPlugin from "../main";

/**
 * Handles bidirectional synchronization between plugin JSON data and vault markdown notes.
 * Tasks are stored as markdown files with YAML frontmatter in {ProjectName}/Tasks/{TaskTitle}.md
 */
export class TaskSync {
    private app: App;
    private plugin: ProjectPlannerPlugin;
    private syncInProgress = new Set<string>(); // Prevent infinite loops

    constructor(app: App, plugin: ProjectPlannerPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    /**
     * Convert a PlannerTask to YAML frontmatter + markdown content
     */
    taskToMarkdown(task: PlannerTask, projectName: string): string {
        const yaml: any = {
            id: task.id,
            title: task.title,
            status: task.status,
            completed: task.completed,
        };

        // Optional fields
        if (task.parentId) yaml.parentId = task.parentId;
        if (task.priority) yaml.priority = task.priority;
        if (task.bucketId) yaml.bucketId = task.bucketId;
        if (task.startDate) yaml.startDate = task.startDate;
        if (task.dueDate) yaml.dueDate = task.dueDate;
        if (task.tags && task.tags.length > 0) yaml.tags = task.tags;
        if (task.collapsed !== undefined) yaml.collapsed = task.collapsed;

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
            } else {
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
                } else {
                    content += `- [${link.url}](${link.url})\n`;
                }
            });
            content += `\n`;
        }

        content += `\n---\n*Task from Project: ${projectName}*\n`;

        return content;
    }

    /**
     * Convert YAML frontmatter + markdown to a PlannerTask
     */
    async markdownToTask(file: TFile, projectId: string): Promise<PlannerTask | null> {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) return null;

        const fm = cache.frontmatter;

        // Required fields
        if (!fm.id || !fm.title) return null;

        const task: PlannerTask = {
            id: fm.id,
            title: fm.title,
            status: fm.status || "Not Started",
            completed: fm.completed === true,
        };

        // Optional fields
        if (fm.parentId) task.parentId = fm.parentId;
        if (fm.priority) task.priority = fm.priority;
        if (fm.bucketId) task.bucketId = fm.bucketId;
        if (fm.startDate) task.startDate = fm.startDate;
        if (fm.dueDate) task.dueDate = fm.dueDate;
        if (fm.tags) task.tags = Array.isArray(fm.tags) ? fm.tags : [fm.tags];
        if (fm.collapsed !== undefined) task.collapsed = fm.collapsed;

        // Dependencies
        if (fm.dependencies && Array.isArray(fm.dependencies)) {
            task.dependencies = fm.dependencies.map((d: string) => {
                const [type, predecessorId] = d.split(':');
                return {
                    type: type as any,
                    predecessorId,
                };
            });
        }

        // Read file content to parse description, subtasks, and links
        try {
            const content = await this.app.vault.read(file);
            const parsed = this.parseMarkdownContent(content);

            if (parsed.description) task.description = parsed.description;
            if (parsed.subtasks && parsed.subtasks.length > 0) task.subtasks = parsed.subtasks;
            if (parsed.links && parsed.links.length > 0) task.links = parsed.links;
        } catch (error) {
            console.error('Error reading task file:', error);
        }

        return task;
    }

    /**
     * Parse markdown content to extract description, subtasks, and links
     */
    private parseMarkdownContent(content: string): {
        description?: string;
        subtasks?: PlannerSubtask[];
        links?: TaskLink[];
    } {
        const result: {
            description?: string;
            subtasks?: PlannerSubtask[];
            links?: TaskLink[];
        } = {};

        // Split content by frontmatter
        const parts = content.split('---');
        if (parts.length < 3) return result;

        // Get content after frontmatter
        let bodyContent = parts.slice(2).join('---').trim();

        // Extract description (content before first ## heading)
        const firstHeadingMatch = bodyContent.match(/^##\s/m);
        if (firstHeadingMatch) {
            const descriptionEnd = firstHeadingMatch.index || 0;
            result.description = bodyContent.substring(0, descriptionEnd).trim();
            bodyContent = bodyContent.substring(descriptionEnd);
        } else {
            // No headings found, check if there's content before the footer
            const footerMatch = bodyContent.match(/\n---\n\*Task from Project:/);
            if (footerMatch) {
                result.description = bodyContent.substring(0, footerMatch.index).trim();
            } else {
                result.description = bodyContent.trim();
            }
            return result; // No sections to parse
        }

        // Parse subtasks section
        const subtasksMatch = bodyContent.match(/##\s+Subtasks\s*\n([\s\S]*?)(?=\n##|\n---|\n*$)/);
        if (subtasksMatch) {
            const subtasksText = subtasksMatch[1];
            const subtaskLines = subtasksText.split('\n').filter(line => line.trim().startsWith('-'));

            result.subtasks = subtaskLines.map(line => {
                const checkboxMatch = line.match(/- \[([ x])\]\s*(.+)/);
                if (checkboxMatch) {
                    return {
                        id: crypto.randomUUID(),
                        title: checkboxMatch[2].trim(),
                        completed: checkboxMatch[1] === 'x',
                    };
                }
                return null;
            }).filter((st): st is PlannerSubtask => st !== null);
        }

        // Parse links section
        const linksMatch = bodyContent.match(/##\s+Links\s*\n([\s\S]*?)(?=\n##|\n---|\n*$)/);
        if (linksMatch) {
            const linksText = linksMatch[1];
            const linkLines = linksText.split('\n').filter(line => line.trim().startsWith('-'));

            result.links = linkLines.map(line => {
                // Obsidian internal link: - [[Link]]
                const obsidianMatch = line.match(/- \[\[([^\]]+)\]\]/);
                if (obsidianMatch) {
                    return {
                        id: crypto.randomUUID(),
                        title: obsidianMatch[1],
                        url: obsidianMatch[1],
                        type: 'obsidian' as const,
                    };
                }

                // External link: - [url](url) or - [title](url)
                const externalMatch = line.match(/- \[([^\]]+)\]\(([^\)]+)\)/);
                if (externalMatch) {
                    return {
                        id: crypto.randomUUID(),
                        title: externalMatch[1],
                        url: externalMatch[2],
                        type: 'external' as const,
                    };
                }

                return null;
            }).filter((link): link is TaskLink => link !== null);
        }

        return result;
    }

    /**
     * Get the file path for a task's markdown note
     */
    getTaskFilePath(task: PlannerTask, projectName: string): string {
        // Sanitize title for filename
        const safeName = task.title.replace(/[\\/:*?"<>|]/g, '-');
        return `${projectName}/Tasks/${safeName}.md`;
    }

    /**
     * Sync a task from JSON to markdown (create or update the note)
     */
    async syncTaskToMarkdown(task: PlannerTask, projectId: string): Promise<void> {
        const project = this.plugin.settings.projects.find(p => p.id === projectId);
        if (!project) return;

        const filePath = this.getTaskFilePath(task, project.name);

        // Prevent infinite loop
        if (this.syncInProgress.has(task.id)) return;
        this.syncInProgress.add(task.id);

        try {
            const content = this.taskToMarkdown(task, project.name);
            const existingFile = this.app.vault.getAbstractFileByPath(filePath);

            if (existingFile instanceof TFile) {
                await this.app.vault.modify(existingFile, content);
            } else {
                await this.app.vault.create(filePath, content);
            }
        } finally {
            // Remove from set after a delay to allow metadata cache to update
            setTimeout(() => this.syncInProgress.delete(task.id), 200);
        }
    }

    /**
     * Sync a task from markdown to JSON (update the plugin data)
     */
    async syncMarkdownToTask(file: TFile, projectId: string): Promise<void> {
        const task = await this.markdownToTask(file, projectId);
        if (!task) return;

        // Prevent infinite loop
        if (this.syncInProgress.has(task.id)) {
            console.log('[TaskSync] Skipping sync (already in progress):', task.title);
            return;
        }
        this.syncInProgress.add(task.id);

        try {
            const existingTask = this.plugin.taskStore.getTaskById(task.id);

            if (existingTask) {
                // Update existing task
                console.log('[TaskSync] Updating task from markdown:', task.title);
                await this.plugin.taskStore.updateTask(task.id, task);
            } else {
                // Task doesn't exist in JSON - new task created via markdown
                console.log('[TaskSync] Adding new task from markdown:', task.title);
                await this.plugin.taskStore.addTaskFromObject(task);
            }
        } finally {
            setTimeout(() => this.syncInProgress.delete(task.id), 200);
        }
    }

    /**
     * Delete a task's markdown note
     */
    async deleteTaskMarkdown(task: PlannerTask, projectName: string): Promise<void> {
        const filePath = this.getTaskFilePath(task, projectName);
        const file = this.app.vault.getAbstractFileByPath(filePath);

        if (file instanceof TFile) {
            await this.app.vault.delete(file);
        }
    }

    /**
     * Watch for changes to markdown files in project folders
     */
    watchProjectFolder(projectId: string, projectName: string) {
        const folderPath = `${projectName}/Tasks`;
        console.log(`[TaskSync] Setting up watchers for: ${folderPath}`);

        // Watch for metadata cache changes (most reliable for YAML frontmatter changes)
        this.plugin.registerEvent(
            this.app.metadataCache.on('changed', async (file) => {
                if (file instanceof TFile && file.path.startsWith(folderPath) && file.extension === 'md') {
                    console.log('[TaskSync] Metadata changed:', file.path);
                    await this.syncMarkdownToTask(file, projectId);
                }
            })
        );

        // Watch for file deletions
        this.plugin.registerEvent(
            this.app.vault.on('delete', async (file) => {
                if (file instanceof TFile && file.path.startsWith(folderPath) && file.extension === 'md') {
                    console.log('[TaskSync] File deleted:', file.path);
                    const cache = this.app.metadataCache.getFileCache(file);
                    const taskId = cache?.frontmatter?.id;
                    if (taskId) {
                        await this.plugin.taskStore.deleteTask(taskId);
                    }
                }
            })
        );

        // Watch for new files (manual task creation)
        this.plugin.registerEvent(
            this.app.vault.on('create', async (file) => {
                if (file instanceof TFile && file.path.startsWith(folderPath) && file.extension === 'md') {
                    console.log('[TaskSync] File created:', file.path);
                    // Wait for metadata cache to populate
                    setTimeout(async () => {
                        await this.syncMarkdownToTask(file, projectId);
                    }, 1000);
                }
            })
        );
    }

    /**
     * Perform initial sync - scan project folder and sync all markdown files
     */
    async initialSync(projectId: string, projectName: string): Promise<void> {
        const folderPath = `${projectName}/Tasks`;
        const folder = this.app.vault.getAbstractFileByPath(folderPath);

        if (!folder) return;

        console.log(`[TaskSync] Starting initial sync for: ${folderPath}`);
        const files = this.app.vault.getMarkdownFiles().filter(f =>
            f.path.startsWith(folderPath)
        );

        console.log(`[TaskSync] Found ${files.length} files to sync`);
        for (const file of files) {
            await this.syncMarkdownToTask(file, projectId);
        }
    }
}
