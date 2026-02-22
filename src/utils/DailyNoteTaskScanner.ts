import { App, TFile, Notice, normalizePath } from "obsidian";
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
    private scanTimeout: ReturnType<typeof setTimeout> | null = null;
    private pendingScans = new Set<string>(); // Track files pending scan
    // Map: "filePath:lineNumber" -> taskId to track task locations (persisted to settings)
    private taskLocationMap = new Map<string, string>();

    constructor(app: App, plugin: ProjectPlannerPlugin) {
        this.app = app;
        this.plugin = plugin;
        this.loadTaskLocationMap();
    }

    /**
     * Load taskLocationMap from persisted settings
     */
    private loadTaskLocationMap() {
        const saved = this.plugin.settings.dailyNoteTaskLocations;
        if (saved) {
            this.taskLocationMap = new Map(Object.entries(saved));
        }
    }

    /**
     * Save taskLocationMap to persisted settings
     */
    private async saveTaskLocationMap() {
        this.plugin.settings.dailyNoteTaskLocations = Object.fromEntries(this.taskLocationMap);
        await this.plugin.saveSettings();
    }

    /**
     * Generate a stable hash-based ID for a task
     * Uses file path + normalized content for deterministic ID generation
     */
    private generateStableTaskId(file: TFile, taskContent: string): string {
        // Normalize content: remove extra spaces, lowercase, trim
        const normalized = taskContent.trim().toLowerCase().replace(/\s+/g, ' ');
        // Create a simple hash (good enough for collision avoidance)
        const hashStr = `${file.path}|${normalized}`;
        let hash = 0;
        for (let i = 0; i < hashStr.length; i++) {
            const char = hashStr.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        const hashHex = Math.abs(hash).toString(16).padStart(8, '0');
        return `daily-task-${hashHex}`;
    }

    /**
     * Find existing task by content similarity to avoid duplicates
     */
    private findDuplicateTaskByContent(title: string, projectId: string): PlannerTask | null {
        // Get all tasks from TaskStore (across all projects)
        const allTasks = this.plugin.taskStore.getAll();
        const normalizedTitle = title.trim().toLowerCase();
        
        // Find tasks with matching title that were imported from daily notes
        // Note: Since TaskStore.getAll() returns tasks from active project only,
        // we can assume any daily-task- ID found is in the current project
        const duplicates = allTasks.filter(t => {
            if (!t.id.startsWith('daily-task-')) return false;
            if (t.title.trim().toLowerCase() !== normalizedTitle) return false;
            return true;
        });
        
        return duplicates.length > 0 ? duplicates[0] : null;
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
        // Match format: #planner/Project-Name (hyphens for spaces)
        // Captures non-whitespace characters after the slash (tag ends at whitespace)
        const regex = new RegExp(`#${basePattern}/([^\\s#]+)`, 'i');
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
    private async parseTaskLine(line: string, file: TFile, lineNumber: number): Promise<{ task: PlannerTask, locationKey: string } | null> {
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

        // Generate location key for tracking (file path + line number)
        const locationKey = `${file.path}:${lineNumber}`;

        // Check if we already have a task at this location
        let taskId = this.taskLocationMap.get(locationKey);
        let isNewTask = !taskId;

        // If no existing task at this location, try to find by content hash
        if (!taskId) {
            // Generate stable ID based on file path and task content
            taskId = this.generateStableTaskId(file, title);
            
            // Check if this task ID already exists (content-based deduplication)
            const existingById = this.plugin.taskStore.getTaskById(taskId);
            if (!existingById) {
                isNewTask = true;
            } else {
                isNewTask = false;
                // Task exists, just update location mapping
            }
            
            // Always update location map for future lookups
            this.taskLocationMap.set(locationKey, taskId);
            await this.saveTaskLocationMap().catch(err => {
                console.warn('[DailyNoteScanner] Failed to save location map:', err);
            });
        }

        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().slice(0, 10);

        // Create the task object with source tracking
        const task: PlannerTask = {
            id: taskId,
            title: title,
            completed: isCompleted,
            status: isCompleted ? "Completed" : "Not Started",
            description: `Imported from: [[${file.basename}]]\nLine: ${lineNumber + 1}`,
        };

        // Set timestamps
        if (isNewTask) {
            task.createdDate = today;
        }
        task.lastModifiedDate = today;

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

        return { task, locationKey };
    }

    /**
     * Schedule a debounced scan of a file
     */
    private scheduleScan(file: TFile) {
        this.pendingScans.add(file.path);

        if (this.scanTimeout) {
            clearTimeout(this.scanTimeout);
        }

        this.scanTimeout = setTimeout(async () => {
            const paths = Array.from(this.pendingScans);
            this.pendingScans.clear();

            for (const path of paths) {
                const fileToScan = this.app.vault.getAbstractFileByPath(path);
                if (fileToScan instanceof TFile) {
                    await this.scanFile(fileToScan);
                }
            }
        }, 1000); // Wait 1 second after last change
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
        const currentFileTasks = new Set<string>(); // Track task IDs in this file
        // File-local dedup: prevents duplicate lines within the same file from
        // being processed twice, while still allowing re-scans of modified files.
        const locallyProcessed = new Set<string>();

        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber];
            if (this.isTaggedTask(line)) {
                const result = await this.parseTaskLine(line, file, lineNumber);
                if (result) {
                    const { task, locationKey } = result;

                    // Track that we found a task at this location
                    currentFileTasks.add(locationKey);

                    // Check if task already processed in this file or batch
                    if (locallyProcessed.has(task.id)) {
                        continue;
                    }

                    // Extract project name from tag
                    const projectName = this.extractProjectFromTag(line);
                    const projectId = this.findProjectId(projectName);

                    if (!projectId) {
                        console.warn(`[DailyNoteScanner] No project found for task: ${task.title}. Project name from tag: ${projectName || 'none (using default)'}`);
                        console.warn(`[DailyNoteScanner] Available projects:`, this.plugin.settings.projects.map(p => p.name));
                        console.warn(`[DailyNoteScanner] Default project ID:`, this.plugin.settings.dailyNoteDefaultProject);
                        continue;
                    }

                    // Check if task already exists by ID
                    const existingTask = this.plugin.taskStore.getTaskById(task.id);

                    if (!existingTask) {
                        // Double-check for content-based duplicates before adding
                        const contentDuplicate = this.findDuplicateTaskByContent(task.title, projectId);
                        if (contentDuplicate) {
                            console.log(`[DailyNoteScanner] Found duplicate by content, updating existing task: ${task.title}`);
                            // Update the existing duplicate instead of creating new task
                            await this.plugin.taskStore.updateTask(contentDuplicate.id, task);
                            // Update location map to point to existing task
                            this.taskLocationMap.set(locationKey, contentDuplicate.id);
                            await this.saveTaskLocationMap();
                            locallyProcessed.add(contentDuplicate.id);
                            this.processedTasks.add(contentDuplicate.id);
                        } else {
                            // No duplicates found, add new task
                            await this.plugin.taskStore.addTaskToProject(task, projectId);
                            locallyProcessed.add(task.id);
                            this.processedTasks.add(task.id);
                        }
                    } else {
                        // Update existing task (content may have changed)
                        await this.plugin.taskStore.updateTask(task.id, task);
                        locallyProcessed.add(task.id);
                        this.processedTasks.add(task.id);
                    }
                }
            }
        }

        // Clean up location map entries for tasks that were removed from this file
        const allKeysForFile = Array.from(this.taskLocationMap.keys()).filter(key => key.startsWith(`${file.path}:`));
        let removedCount = 0;
        for (const key of allKeysForFile) {
            if (!currentFileTasks.has(key)) {
                // Task was removed from this location
                const removedTaskId = this.taskLocationMap.get(key);
                this.taskLocationMap.delete(key);
                removedCount++;
                
                // Optionally: Delete task from TaskStore if it no longer exists in any file
                // (only if we're confident about this - could be handled by user manually)
                // await this.plugin.taskStore.deleteTask(removedTaskId);
            }
        }
        
        // Save location map if any changes were made
        if (removedCount > 0) {
            await this.saveTaskLocationMap();
        }
    }

    /**
     * Scan all notes in the vault for tagged tasks
     */
    async scanAllNotes(): Promise<void> {
        this.processedTasks.clear();

        const files = this.app.vault.getMarkdownFiles();
        let tasksFound = 0;

        for (const file of files) {
            const beforeCount = this.processedTasks.size;
            await this.scanFile(file);
            const afterCount = this.processedTasks.size;
            tasksFound += (afterCount - beforeCount);
        }

        new Notice(`Imported ${tasksFound} tasks from daily notes`);
    }

    /**
     * Watch for changes to files and scan them
     */
    setupWatchers() {
        // Watch for file modifications
        this.plugin.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile) {
                    this.scheduleScan(file);
                }
            })
        );

        // Watch for new files
        this.plugin.registerEvent(
            this.app.vault.on('create', (file) => {
                if (file instanceof TFile) {
                    this.scheduleScan(file);
                }
            })
        );

        // Watch for file deletions to clean up location map
        this.plugin.registerEvent(
            this.app.vault.on('delete', (file) => {
                if (file instanceof TFile) {
                    this.handleFileDelete(file);
                }
            })
        );

        // Watch for file renames to update location map
        this.plugin.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                if (file instanceof TFile) {
                    this.handleFileRename(file, oldPath);
                }
            })
        );
    }

    /**
     * Handle file deletion - clean up location map
     */
    private async handleFileDelete(file: TFile) {
        const keysToDelete = Array.from(this.taskLocationMap.keys())
            .filter(key => key.startsWith(`${file.path}:`));
        
        if (keysToDelete.length > 0) {
            keysToDelete.forEach(key => this.taskLocationMap.delete(key));
            await this.saveTaskLocationMap();
            console.log(`[DailyNoteScanner] Cleaned up ${keysToDelete.length} location entries for deleted file: ${file.path}`);
        }
    }

    /**
     * Handle file rename - update location map with new paths
     */
    private async handleFileRename(file: TFile, oldPath: string) {
        const oldKeys = Array.from(this.taskLocationMap.keys())
            .filter(key => key.startsWith(`${oldPath}:`));
        
        if (oldKeys.length > 0) {
            const updates: [string, string][] = [];
            
            // Create new keys with updated file path
            oldKeys.forEach(oldKey => {
                const taskId = this.taskLocationMap.get(oldKey);
                if (taskId) {
                    // Extract line number from old key
                    const lineNumber = oldKey.split(':')[1];
                    const newKey = `${file.path}:${lineNumber}`;
                    updates.push([oldKey, newKey]);
                }
            });
            
            // Apply updates
            updates.forEach(([oldKey, newKey]) => {
                const taskId = this.taskLocationMap.get(oldKey);
                if (taskId) {
                    this.taskLocationMap.delete(oldKey);
                    this.taskLocationMap.set(newKey, taskId);
                }
            });
            
            await this.saveTaskLocationMap();
            console.log(`[DailyNoteScanner] Updated ${updates.length} location entries for renamed file: ${oldPath} → ${file.path}`);
        }
    }

    /**
     * Perform a quick scan and provide user feedback
     */
    async quickScan(): Promise<void> {
        new Notice('Scanning for tagged tasks...');
        await this.scanAllNotes();
    }
}
