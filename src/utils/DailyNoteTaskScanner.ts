import { App, TFile, Notice } from "obsidian";
import type ProjectPlannerPlugin from "../main";
import { PlannerTask } from "../types";

/**
 * Scans daily notes and other markdown files for tagged tasks
 * and automatically imports them into the appropriate project.
 * 
 * Supports tag patterns like:
 * - #planner (uses default project)
 * - #planner/ProjectName (adds to specific project)
 * - Custom patterns defined in settings
 */
export class DailyNoteTaskScanner {
    private app: App;
    private plugin: ProjectPlannerPlugin;
    private processedTasks = new Set<string>(); // Track task IDs to avoid duplicates

    constructor(app: App, plugin: ProjectPlannerPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    /**
     * Extract project name from a tag pattern
     * Examples:
     * - "#planner/Project Planner" -> "Project Planner"
     * - "#planner/Project-Planner" -> "Project Planner"
     * - "#planner" -> null (use default)
     */
    private extractProjectFromTag(tag: string): string | null {
        const basePattern = this.plugin.settings.dailyNoteTagPattern.replace('#', '');
        // Match either format: #planner/Project-Name or #planner/Project Name
        // Captures until end of tag (next # or end of string/whitespace followed by non-alphanumeric)
        const regex = new RegExp(`#${basePattern}/([^#\\n\\r]+?)(?=\\s|$|#)`, 'i');
        const match = tag.match(regex);
        if (!match) return null;

        // Clean up the project name and replace hyphens with spaces
        let projectName = match[1].trim();
        projectName = projectName.replace(/-/g, ' ');
        return projectName;
    }

    /**
     * Find the project ID by name or use default
     */
    private findProjectId(projectName: string | null): string | null {
        if (projectName) {
            const project = this.plugin.settings.projects.find(
                p => p.name.toLowerCase() === projectName.toLowerCase()
            );
            return project?.id || null;
        }
        return this.plugin.settings.dailyNoteDefaultProject || null;
    }

    /**
     * Check if a line contains a task with the tag pattern
     */
    private isTaggedTask(line: string): boolean {
        const basePattern = this.plugin.settings.dailyNoteTagPattern.replace('#', '');
        // Match task lines: - [ ] or - [x] or - [X]
        const taskRegex = /^[\s]*-\s+\[([ xX])\]\s+(.+)/;
        const tagRegex = new RegExp(`#${basePattern}(?:/[^\\s#]+)?`, 'i');

        return taskRegex.test(line) && tagRegex.test(line);
    }

    /**
     * Parse a tagged task line into a PlannerTask object
     */
    private parseTaskLine(line: string, file: TFile): PlannerTask | null {
        const taskRegex = /^[\s]*-\s+\[([ xX])\]\s+(.+)/;
        const match = line.match(taskRegex);

        if (!match) return null;

        const isCompleted = match[1].toLowerCase() === 'x';
        const taskContent = match[2].trim();

        // Extract tags
        const basePattern = this.plugin.settings.dailyNoteTagPattern.replace('#', '');
        const tagRegex = new RegExp(`#${basePattern}(?:/([^\\s#]+))?`, 'gi');
        const tags: string[] = [];
        let projectTag: string | null = null;

        let tagMatch;
        while ((tagMatch = tagRegex.exec(taskContent)) !== null) {
            if (tagMatch[1]) {
                projectTag = tagMatch[1];
            }
            tags.push(tagMatch[0]);
        }

        // Remove tags from title
        let title = taskContent;
        tags.forEach(tag => {
            title = title.replace(tag, '').trim();
        });

        // Extract priority from text (e.g., "!!!" or "🔴" or "(high)")
        let priority: string | undefined;
        const priorityPatterns = [
            { pattern: /!!!/g, value: "Critical" },
            { pattern: /!!/g, value: "High" },
            { pattern: /!/g, value: "Medium" },
            { pattern: /\(critical\)/gi, value: "Critical" },
            { pattern: /\(high\)/gi, value: "High" },
            { pattern: /\(medium\)/gi, value: "Medium" },
            { pattern: /\(low\)/gi, value: "Low" },
        ];

        for (const { pattern, value } of priorityPatterns) {
            if (pattern.test(title)) {
                priority = value;
                title = title.replace(pattern, '').trim();
                break;
            }
        }

        // Extract due date from text (e.g., "📅 2026-01-15" or "due: 2026-01-15")
        let dueDate: string | undefined;
        const dueDatePatterns = [
            /📅\s*(\d{4}-\d{2}-\d{2})/,
            /due:\s*(\d{4}-\d{2}-\d{2})/i,
            /@(\d{4}-\d{2}-\d{2})/,
        ];

        for (const pattern of dueDatePatterns) {
            const dateMatch = title.match(pattern);
            if (dateMatch) {
                dueDate = dateMatch[1];
                title = title.replace(pattern, '').trim();
                break;
            }
        }

        // Extract additional tags (excluding planner tag)
        const additionalTagRegex = /#([^\s#]+)/g;
        const additionalTags: string[] = [];
        let additionalTagMatch;
        while ((additionalTagMatch = additionalTagRegex.exec(taskContent)) !== null) {
            const tag = additionalTagMatch[1];
            if (!tag.startsWith(basePattern)) {
                // Find matching tag in settings
                const matchedTag = this.plugin.settings.availableTags.find(
                    t => t.name.toLowerCase() === tag.toLowerCase()
                );
                if (matchedTag) {
                    additionalTags.push(matchedTag.id);
                }
            }
        }

        // Generate a unique ID based on file path + line content
        const uniqueString = `${file.path}:${title}`;
        const taskId = this.generateTaskId(uniqueString);

        // Create the task object
        const task: PlannerTask = {
            id: taskId,
            title: title,
            completed: isCompleted,
            status: isCompleted ? "Completed" : "Not Started",
            description: `Imported from: [[${file.basename}]]`,
        };

        if (priority) task.priority = priority;
        if (dueDate) task.dueDate = dueDate;
        if (additionalTags.length > 0) task.tags = additionalTags;

        // Add link back to the source note
        task.links = [{
            id: crypto.randomUUID(),
            title: file.basename,
            url: file.path,
            type: "obsidian",
        }];

        return task;
    }

    /**
     * Generate a consistent task ID from a string
     */
    private generateTaskId(input: string): string {
        // Simple hash function to generate consistent IDs
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `daily-task-${Math.abs(hash)}`;
    }

    /**
     * Scan a single file for tagged tasks
     */
    async scanFile(file: TFile): Promise<void> {
        if (file.extension !== 'md') return;

        // Check if file is in scan folders (if specified)
        if (this.plugin.settings.dailyNoteScanFolders.length > 0) {
            const shouldScan = this.plugin.settings.dailyNoteScanFolders.some(
                folder => file.path.startsWith(folder)
            );
            if (!shouldScan) return;
        }

        const content = await this.app.vault.read(file);
        const lines = content.split('\n');

        for (const line of lines) {
            if (this.isTaggedTask(line)) {
                const task = this.parseTaskLine(line, file);
                if (task) {
                    // Check if task already exists
                    if (this.processedTasks.has(task.id)) {
                        continue;
                    }

                    // Extract project name from tag using the same method as extractProjectFromTag
                    const projectName = this.extractProjectFromTag(line);
                    const projectId = this.findProjectId(projectName);

                    if (!projectId) {
                        console.warn(`[DailyNoteScanner] No project found for task: ${task.title}. Project name from tag: ${projectName || 'none (using default)'}`);
                        console.warn(`[DailyNoteScanner] Available projects:`, this.plugin.settings.projects.map(p => p.name));
                        console.warn(`[DailyNoteScanner] Default project ID:`, this.plugin.settings.dailyNoteDefaultProject);
                        continue;
                    }

                    // Check if task already exists in the project
                    const existingTask = this.plugin.taskStore.getTaskById(task.id);

                    if (!existingTask) {
                        // Add new task
                        console.log(`[DailyNoteScanner] Adding task: ${task.title} to project: ${projectId}`);
                        await this.plugin.taskStore.addTaskToProject(task, projectId);
                        this.processedTasks.add(task.id);
                    } else {
                        // Update existing task
                        console.log(`[DailyNoteScanner] Updating task: ${task.title}`);
                        await this.plugin.taskStore.updateTask(task.id, task);
                        this.processedTasks.add(task.id);
                    }
                }
            }
        }
    }

    /**
     * Scan all notes in the vault for tagged tasks
     */
    async scanAllNotes(): Promise<void> {
        console.log('[DailyNoteScanner] Starting scan of all notes...');
        this.processedTasks.clear();

        const files = this.app.vault.getMarkdownFiles();
        let tasksFound = 0;

        for (const file of files) {
            const beforeCount = this.processedTasks.size;
            await this.scanFile(file);
            const afterCount = this.processedTasks.size;
            tasksFound += (afterCount - beforeCount);
        }

        console.log(`[DailyNoteScanner] Scan complete. Found ${tasksFound} tasks.`);
        new Notice(`Imported ${tasksFound} tasks from daily notes`);
    }

    /**
     * Watch for changes to files and scan them
     */
    setupWatchers() {
        console.log('[DailyNoteScanner] Setting up file watchers...');

        // Watch for file modifications
        this.plugin.registerEvent(
            this.app.vault.on('modify', async (file) => {
                if (file instanceof TFile) {
                    await this.scanFile(file);
                }
            })
        );

        // Watch for new files
        this.plugin.registerEvent(
            this.app.vault.on('create', async (file) => {
                if (file instanceof TFile) {
                    // Wait for file to be written
                    setTimeout(async () => {
                        await this.scanFile(file);
                    }, 500);
                }
            })
        );
    }
}
