import { TFile } from "obsidian";
import { TaskStore } from "../../src/stores/taskStore";
import { TaskSync } from "../../src/utils/TaskSync";
import { DailyNoteTaskScanner } from "../../src/utils/DailyNoteTaskScanner";
import { PlannerTask } from "../../src/types";
import type ProjectPlannerPlugin from "../../src/main";

/**
 * Integration tests for complete task workflows
 * Tests how TaskStore, TaskSync, and DailyNoteTaskScanner work together
 */

// Mock crypto.randomUUID for consistent IDs
let uuidCounter = 0;
(global as any).crypto = {
    randomUUID: () => {
        uuidCounter++;
        return `integration-test-uuid-${uuidCounter}`;
    }
};

const createMockTFile = (path: string): TFile => {
    const mockFile = Object.create(TFile.prototype);
    mockFile.path = path;
    mockFile.name = path.split('/').pop() || '';
    mockFile.basename = mockFile.name.replace('.md', '');
    mockFile.extension = 'md';
    return mockFile;
};

describe("Integration: Task Workflows", () => {
    let taskStore: TaskStore;
    let taskSync: TaskSync;
    let mockPlugin: any;
    let mockApp: any;
    let mockVault: any;
    let mockMetadataCache: any;
    let createdFiles: Map<string, string>; // path -> content
    let mockPluginData: any; // Persistent plugin data storage

    beforeEach(async () => {
        uuidCounter = 0;
        createdFiles = new Map();
        mockPluginData = {}; // Reset plugin data

        // Mock Vault with in-memory file storage
        mockVault = {
            getAbstractFileByPath: jest.fn((path: string) => {
                if (createdFiles.has(path)) {
                    return createMockTFile(path);
                }
                return null;
            }),
            create: jest.fn(async (path: string, content: string) => {
                createdFiles.set(path, content);
                return createMockTFile(path);
            }),
            modify: jest.fn(async (file: TFile, content: string) => {
                createdFiles.set(file.path, content);
            }),
            delete: jest.fn(async (file: TFile) => {
                createdFiles.delete(file.path);
            }),
            read: jest.fn(async (file: TFile) => {
                return createdFiles.get(file.path) || '';
            }),
            createFolder: jest.fn(),
            getMarkdownFiles: jest.fn(() => {
                return Array.from(createdFiles.keys())
                    .filter(path => path.endsWith('.md'))
                    .map(path => createMockTFile(path));
            }),
            on: jest.fn(),
        };

        mockMetadataCache = {
            getFileCache: jest.fn((file: TFile) => {
                const content = createdFiles.get(file.path);
                if (!content) return null;

                // Parse frontmatter
                const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
                if (!frontmatterMatch) return null;

                const frontmatter: any = {};
                const lines = frontmatterMatch[1].split('\n');
                for (const line of lines) {
                    const [key, ...valueParts] = line.split(':');
                    if (key && valueParts.length > 0) {
                        const value = valueParts.join(':').trim();
                        frontmatter[key.trim()] = value === 'true' ? true : value === 'false' ? false : value;
                    }
                }
                return { frontmatter };
            }),
            on: jest.fn(),
        };

        mockApp = {
            vault: mockVault,
            metadataCache: mockMetadataCache,
            fileManager: {
                renameFile: jest.fn(async (file: TFile, newPath: string) => {
                    const content = createdFiles.get(file.path);
                    if (content) {
                        createdFiles.delete(file.path);
                        createdFiles.set(newPath, content);
                    }
                }),
            },
        };

        mockPlugin = {
            app: mockApp,
            settings: {
                projects: [
                    {
                        id: 'project-work',
                        name: 'Work Project',
                        tasks: [],
                        tasksFolderPath: 'Work Project/Tasks',
                    },
                    {
                        id: 'project-personal',
                        name: 'Personal Project',
                        tasks: [],
                        tasksFolderPath: 'Personal Project/Tasks',
                    },
                ],
                projectsBasePath: '',
                activeProjectId: 'project-work',
                dailyNoteTagPattern: '#planner',
                dailyNoteDefaultProject: 'project-personal',
                dailyNoteScanFolders: [],
                availableTags: [
                    { id: 'tag-urgent', name: 'urgent', color: '#ff0000' },
                ],
                enableMarkdownSync: false,  // Disable auto-sync to avoid interference
                autoCreateTaskNotes: false,
            },
            loadData: jest.fn().mockImplementation(() => {
                // Return current plugin data
                return Promise.resolve(mockPluginData);
            }),
            saveData: jest.fn().mockImplementation((data: any) => {
                // Store data for future loads
                Object.assign(mockPluginData, data);
                return Promise.resolve(undefined);
            }),
            saveSettings: jest.fn().mockResolvedValue(undefined),
            registerEvent: jest.fn(),
        };

        taskStore = new TaskStore(mockPlugin);
        await taskStore.load();

        // Add taskStore reference to mockPlugin for TaskSync and Scanner
        mockPlugin.taskStore = taskStore;

        taskSync = new TaskSync(mockApp, mockPlugin);
        
        // Add taskSync reference to mockPlugin for automatic sync operations
        mockPlugin.taskSync = taskSync;
    });

    describe("End-to-End: Task Creation to Markdown", () => {
        it("should create task in store and sync to markdown file", async () => {
            // Create task in TaskStore
            const task = await taskStore.addTask("Review PR #123");
            
            // Update additional fields
            await taskStore.updateTask(task.id, {
                priority: "High",
                dueDate: "2026-02-10",
            });

            const updatedTask = taskStore.getTaskById(task.id)!;
            expect(updatedTask.title).toBe("Review PR #123");
            expect(updatedTask.priority).toBe("High");

            // Sync to markdown
            await taskSync.syncTaskToMarkdown(updatedTask, 'project-work');

            // Verify file was created
            const expectedPath = "Work Project/Tasks/Review PR #123.md";
            expect(createdFiles.has(expectedPath)).toBe(true);

            // Verify file content
            const content = createdFiles.get(expectedPath)!;
            expect(content).toContain('id: ' + updatedTask.id);
            expect(content).toContain('title: Review PR #123');
            expect(content).toContain('priority: High');
            expect(content).toContain('dueDate: 2026-02-10');
        });

        it("should update task in store and sync changes to markdown", async () => {
            // Create and sync initial task
            const task = await taskStore.addTask("Design mockups");
            await taskSync.syncTaskToMarkdown(task, 'project-work');

            const filePath = "Work Project/Tasks/Design mockups.md";
            expect(createdFiles.has(filePath)).toBe(true);

            // Verify task is in store before update
            const taskBeforeUpdate = taskStore.getTaskById(task.id);
            expect(taskBeforeUpdate).toBeDefined();
            expect(taskBeforeUpdate?.status).toBe("Not Started");

            // Update task
            await taskStore.updateTask(task.id, {
                status: "In Progress",
                priority: "Medium",
            });

            // Verify update worked
            const taskAfterUpdate = taskStore.getTaskById(task.id);
            expect(taskAfterUpdate?.status).toBe("In Progress");
            expect(taskAfterUpdate?.priority).toBe("Medium");

            // Sync update
            const updatedTask = taskStore.getTaskById(task.id)!;
            await taskSync.syncTaskToMarkdown(updatedTask, 'project-work');

            // Verify updated content
            const content = createdFiles.get(filePath)!;
            expect(content).toContain('status: In Progress');
            expect(content).toContain('priority: Medium');
        });

        it("should delete task from store and remove markdown file", async () => {
            // Create and sync task
            const task = await taskStore.addTask("Temporary task");
            await taskSync.syncTaskToMarkdown(task, 'project-work');

            const filePath = "Work Project/Tasks/Temporary task.md";
            expect(createdFiles.has(filePath)).toBe(true);

            // Delete task
            await taskStore.deleteTask(task.id);

            // Delete markdown
            await taskSync.deleteTaskMarkdown(task, 'Work Project');

            expect(createdFiles.has(filePath)).toBe(false);
        });
    });

    describe("End-to-End: Markdown to Task Store", () => {
        it("should read markdown file and create task in store", async () => {
            const taskId = 'manual-task-1';
            const filePath = "Work Project/Tasks/Manual Task.md";
            const content = `---
id: ${taskId}
title: Manual Task
status: Not Started
completed: false
priority: Low
---

This is a manually created task.
`;

            createdFiles.set(filePath, content);
            const file = createMockTFile(filePath);

            // Sync markdown to task store
            await taskSync.syncMarkdownToTask(file, 'project-work');

            // Verify task was created
            const task = taskStore.getTaskById(taskId);
            expect(task).toBeDefined();
            expect(task?.title).toBe("Manual Task");
            expect(task?.priority).toBe("Low");
            expect(task?.description).toContain("manually created task");
        });

        it("should update existing task when markdown changes", async () => {
            // Create initial task
            const task = await taskStore.addTask("Editable task");
            const taskId = task.id;

            // Create markdown file with updated content
            const filePath = "Work Project/Tasks/Editable task.md";
            const updatedContent = `---
id: ${taskId}
title: Editable task
status: Completed
completed: true
priority: Critical
---

Task has been completed!
`;

            createdFiles.set(filePath, updatedContent);
            const file = createMockTFile(filePath);

            // Sync markdown changes
            await taskSync.syncMarkdownToTask(file, 'project-work');

            // Verify task was updated
            const updatedTask = taskStore.getTaskById(taskId);
            expect(updatedTask?.status).toBe("Completed");
            expect(updatedTask?.completed).toBe(true);
            expect(updatedTask?.priority).toBe("Critical");
        });
    });

    describe("End-to-End: Daily Note Scanning", () => {
        it("should scan daily note and import tagged tasks", async () => {
            const scanner = new DailyNoteTaskScanner(mockApp, mockPlugin);

            // Create daily note with tagged tasks
            const dailyNotePath = "Daily Notes/2026-02-04.md";
            const content = `# Daily Note - Feb 4, 2026

## Tasks
- [ ] Call client about project #planner
- [ ] Review documentation !!! #planner/Work-Project
- [x] Morning standup #planner
- [ ] Regular task (not imported)
`;

            createdFiles.set(dailyNotePath, content);
            const file = createMockTFile(dailyNotePath);

            // Scan the file
            await scanner.scanFile(file);

            // Verify tasks were imported
            const workTasks = taskStore.getAllForProject('project-work');
            const personalTasks = taskStore.getAllForProject('project-personal');

            // "Review documentation" should be in Work Project
            const workTask = workTasks.find(t => t.title?.includes("Review documentation"));
            expect(workTask).toBeDefined();
            expect(workTask?.priority).toBe("Critical"); // !!! = Critical

            // "Call client" and "Morning standup" should be in Personal Project (default)
            expect(personalTasks.length).toBeGreaterThanOrEqual(2);
            const callTask = personalTasks.find(t => t.title?.includes("Call client"));
            expect(callTask).toBeDefined();
            expect(callTask?.completed).toBe(false);

            const standupTask = personalTasks.find(t => t.title?.includes("Morning standup"));
            expect(standupTask).toBeDefined();
            expect(standupTask?.completed).toBe(true);
        });

        it("should update task when daily note is modified", async () => {
            const scanner = new DailyNoteTaskScanner(mockApp, mockPlugin);

            // Create initial daily note
            const dailyNotePath = "Daily Notes/2026-02-04.md";
            createdFiles.set(dailyNotePath, "- [ ] Initial task #planner");
            const file = createMockTFile(dailyNotePath);

            await scanner.scanFile(file);

            const initialTasks = taskStore.getAllForProject('project-personal');
            const initialTask = initialTasks.find(t => t.title?.includes("Initial task"));
            expect(initialTask?.completed).toBe(false);

            // Update daily note (mark as complete)
            createdFiles.set(dailyNotePath, "- [x] Initial task #planner");

            await scanner.scanFile(file);

            // Verify task was updated (check in the correct project)
            const updatedTasks = taskStore.getAllForProject('project-personal');
            const updatedTask = updatedTasks.find(t => t.id === initialTask!.id);
            expect(updatedTask?.completed).toBe(true);
            expect(updatedTask?.status).toBe("Completed");
        });
    });

    describe("Multi-Project Workflows", () => {
        it("should maintain task isolation between projects", async () => {
            // Create tasks in different projects
            const workTask: PlannerTask = {
                id: 'work-1',
                title: "Work task",
                status: "Not Started",
                completed: false,
            };

            const personalTask: PlannerTask = {
                id: 'personal-1',
                title: "Personal task",
                status: "Not Started",
                completed: false,
            };

            await taskStore.addTaskToProject(workTask, 'project-work');
            await taskStore.addTaskToProject(personalTask, 'project-personal');

            // Verify isolation
            const workTasks = taskStore.getAllForProject('project-work');
            const personalTasks = taskStore.getAllForProject('project-personal');

            expect(workTasks).toContainEqual(expect.objectContaining({ id: 'work-1' }));
            expect(workTasks).not.toContainEqual(expect.objectContaining({ id: 'personal-1' }));

            expect(personalTasks).toContainEqual(expect.objectContaining({ id: 'personal-1' }));
            expect(personalTasks).not.toContainEqual(expect.objectContaining({ id: 'work-1' }));
        });

        it("should sync tasks to correct project folders", async () => {
            const workTask: PlannerTask = {
                id: 'work-task',
                title: "Work item",
                status: "Not Started",
                completed: false,
            };

            const personalTask: PlannerTask = {
                id: 'personal-task',
                title: "Personal item",
                status: "Not Started",
                completed: false,
            };

            await taskStore.addTaskToProject(workTask, 'project-work');
            await taskStore.addTaskToProject(personalTask, 'project-personal');

            // Sync to markdown
            await taskSync.syncTaskToMarkdown(workTask, 'project-work');
            await taskSync.syncTaskToMarkdown(personalTask, 'project-personal');

            // Verify correct folders
            expect(createdFiles.has("Work Project/Tasks/Work item.md")).toBe(true);
            expect(createdFiles.has("Personal Project/Tasks/Personal item.md")).toBe(true);

            // Verify tasks are NOT in wrong folders
            expect(createdFiles.has("Work Project/Tasks/Personal item.md")).toBe(false);
            expect(createdFiles.has("Personal Project/Tasks/Work item.md")).toBe(false);
        });
    });

    describe("Bidirectional Sync Scenarios", () => {
        it("should handle task renamed in store and sync to markdown", async () => {
            // Create task
            const task = await taskStore.addTask("Original Name");
            await taskSync.syncTaskToMarkdown(task, 'project-work');

            const originalPath = "Work Project/Tasks/Original Name.md";
            expect(createdFiles.has(originalPath)).toBe(true);

            // Rename task
            await taskStore.updateTask(task.id, { title: "Updated Name" });
            const updatedTask = taskStore.getTaskById(task.id)!;

            // Handle rename in file system
            await taskSync.handleTaskRename(
                updatedTask,
                "Original Name",
                'project-work'
            );

            // Sync new version
            await taskSync.syncTaskToMarkdown(updatedTask, 'project-work');

            // Verify new file exists and old doesn't
            const newPath = "Work Project/Tasks/Updated Name.md";
            expect(createdFiles.has(newPath)).toBe(true);
            expect(createdFiles.has(originalPath)).toBe(false);
        });

        it("should handle title change in markdown and update store", async () => {
            // Create initial task
            const task = await taskStore.addTask("Task to Rename");
            const taskId = task.id;

            const originalPath = "Work Project/Tasks/Task to Rename.md";
            const newPath = "Work Project/Tasks/New Task Name.md";

            // Simulate user editing markdown file with new title
            const updatedContent = `---
id: ${taskId}
title: New Task Name
status: Not Started
completed: false
---

Renamed via markdown.
`;

            createdFiles.set(newPath, updatedContent);
            createdFiles.delete(originalPath);

            const newFile = createMockTFile(newPath);

            // Sync markdown changes
            await taskSync.syncMarkdownToTask(newFile, 'project-work');

            // Verify task store was updated
            const updatedTask = taskStore.getTaskById(taskId);
            expect(updatedTask?.title).toBe("New Task Name");
        });

        it("should prevent sync loops between store and markdown", async () => {
            const task = await taskStore.addTask("Test Task");
            const filePath = "Work Project/Tasks/Test Task.md";

            // Sync to markdown
            await taskSync.syncTaskToMarkdown(task, 'project-work');

            const initialCreateCount = mockVault.create.mock.calls.length;
            const initialModifyCount = mockVault.modify.mock.calls.length;

            // Try to sync again with no changes
            await taskSync.syncTaskToMarkdown(task, 'project-work');

            // Should update, not create new
            expect(mockVault.create.mock.calls.length).toBe(initialCreateCount);
            expect(mockVault.modify.mock.calls.length).toBeGreaterThan(initialModifyCount);
        });
    });

    describe("Complex Workflow: Full Task Lifecycle", () => {
        it("should handle complete task lifecycle across all components", async () => {
            // 1. User adds task via daily note
            const scanner = new DailyNoteTaskScanner(mockApp, mockPlugin);
            const dailyNotePath = "Daily Notes/2026-02-04.md";
            createdFiles.set(dailyNotePath, "- [ ] Build new feature !!! 📅 2026-02-15 #urgent #planner/Work-Project");
            
            await scanner.scanFile(createMockTFile(dailyNotePath));

            // 2. Verify task imported to correct project
            const workTasks = taskStore.getAllForProject('project-work');
            const importedTask = workTasks.find(t => t.title?.includes("Build new feature"));
            
            expect(importedTask).toBeDefined();
            expect(importedTask?.priority).toBe("Critical");
            expect(importedTask?.dueDate).toBe("2026-02-15");

            // 3. Sync to project markdown file
            await taskSync.syncTaskToMarkdown(importedTask!, 'project-work');
            
            // File path uses the actual task title (which may include tags)
            const taskFilePath = `Work Project/Tasks/${importedTask!.title}.md`;
            expect(createdFiles.has(taskFilePath)).toBe(true);

            // 4. User updates task in project file
            // Clear sync lock left by syncTaskToMarkdown (1s setTimeout hasn't fired in tests)
            (taskSync as any).syncInProgress.clear();

            const updatedContent = `---
id: ${importedTask!.id}
title: Build new feature
status: In Progress
completed: false
priority: Critical
dueDate: 2026-02-15
---

Started implementation. Making good progress.
`;
            createdFiles.set(taskFilePath, updatedContent);

            // 5. Sync markdown changes back to store
            await taskSync.syncMarkdownToTask(createMockTFile(taskFilePath), 'project-work');

            // syncMarkdownToTask may have renamed the file (title changed from
            // "Build new feature #urgent" → "Build new feature"), so update the
            // path we use for subsequent steps.
            const renamedTaskFilePath = `Work Project/Tasks/${taskStore.getTaskById(importedTask!.id)!.title}.md`;

            // 6. Verify update propagated
            const updatedTask = taskStore.getTaskById(importedTask!.id);
            expect(updatedTask?.status).toBe("In Progress");
            expect(updatedTask?.description).toContain("Making good progress");

            // 7. Complete task in TaskStore
            await taskStore.updateTask(importedTask!.id, {
                status: "Completed",
                completed: true,
            });

            // 8. Sync completion to markdown
            // Clear sync lock from step 5
            (taskSync as any).syncInProgress.clear();
            const completedTask = taskStore.getTaskById(importedTask!.id)!;
            await taskSync.syncTaskToMarkdown(completedTask, 'project-work');

            // 9. Verify final state
            const finalContent = createdFiles.get(renamedTaskFilePath)!;
            expect(finalContent).toContain('status: Completed');
            expect(finalContent).toContain('completed: true');

            // 10. Delete task
            await taskStore.deleteTask(importedTask!.id);
            await taskSync.deleteTaskMarkdown(completedTask, 'Work Project');

            // 11. Verify cleanup
            expect(taskStore.getTaskById(importedTask!.id)).toBeUndefined();
            expect(createdFiles.has(renamedTaskFilePath)).toBe(false);
        });
    });
});
