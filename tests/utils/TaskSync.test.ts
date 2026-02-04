import { TFile, TFolder, CachedMetadata } from "obsidian";
import { TaskSync } from "../../src/utils/TaskSync";
import { PlannerTask } from "../../src/types";
import { PlannerProject } from "../../src/settings";
import type ProjectPlannerPlugin from "../../src/main";

// Mock crypto.randomUUID for consistent IDs in tests
const mockUUID = jest.fn();
let uuidCounter = 0;
(global as any).crypto = {
    randomUUID: () => {
        uuidCounter++;
        return `test-uuid-${uuidCounter}`;
    }
};

// Create a mock TFile class for instanceof checks
// We don't extend TFile to avoid constructor issues with the mock
const createMockTFile = (path: string): TFile => {
    const mockFile = Object.create(TFile.prototype);
    mockFile.path = path;
    mockFile.name = path.split('/').pop() || '';
    return mockFile;
};

describe("TaskSync", () => {
    let taskSync: TaskSync;
    let mockPlugin: jest.Mocked<ProjectPlannerPlugin>;
    let mockVault: any;
    let mockMetadataCache: any;
    let mockApp: any;

    beforeEach(() => {
        uuidCounter = 0; // Reset counter

        // Mock Vault
        mockVault = {
            getAbstractFileByPath: jest.fn(),
            create: jest.fn(),
            modify: jest.fn(),
            delete: jest.fn(),
            createFolder: jest.fn(),
            read: jest.fn(),
            getMarkdownFiles: jest.fn().mockReturnValue([]),
            on: jest.fn(),
        };

        // Mock MetadataCache
        mockMetadataCache = {
            getFileCache: jest.fn(),
            on: jest.fn(),
        };

        // Mock App
        mockApp = {
            vault: mockVault,
            metadataCache: mockMetadataCache,
            fileManager: {
                renameFile: jest.fn(),
            },
        };

        // Mock Plugin
        mockPlugin = {
            app: mockApp,
            settings: {
                projects: [
                    {
                        id: "project-1",
                        name: "Test Project",
                    } as PlannerProject,
                ],
                projectsBasePath: "",
            },
            taskStore: {
                getTaskById: jest.fn() as jest.MockedFunction<(id: string) => PlannerTask | undefined>,
                getAll: jest.fn(),
                addTask: jest.fn(),
                updateTask: jest.fn(),
                addTaskFromObject: jest.fn(),
                deleteTask: jest.fn(),
            },
            saveSettings: jest.fn().mockResolvedValue(undefined),
            registerEvent: jest.fn(),
        } as any;

        taskSync = new TaskSync(mockApp, mockPlugin);
    });

    describe("taskToMarkdown", () => {
        it("should convert a basic task to markdown with YAML frontmatter", () => {
            const task: PlannerTask = {
                id: "task-1",
                title: "Test Task",
                status: "In Progress",
                completed: false,
            };

            const markdown = taskSync.taskToMarkdown(task, "Test Project");

            expect(markdown).toContain("---");
            expect(markdown).toContain("id: task-1");
            expect(markdown).toContain("title: Test Task");
            expect(markdown).toContain("status: In Progress");
            expect(markdown).toContain("completed: false");
            expect(markdown).toContain("*Task from Project: Test Project*");
        });

        it("should include optional fields when present", () => {
            const task: PlannerTask = {
                id: "task-2",
                title: "Complex Task",
                status: "Not Started",
                completed: false,
                priority: "High",
                parentId: "parent-1",
                bucketId: "bucket-1",
                startDate: "2024-01-01",
                dueDate: "2024-12-31",
                createdDate: "2024-01-01T00:00:00Z",
                lastModifiedDate: "2024-01-02T00:00:00Z",
                tags: ["urgent", "feature"],
                collapsed: false,
            };

            const markdown = taskSync.taskToMarkdown(task, "Test Project");

            expect(markdown).toContain("priority: High");
            expect(markdown).toContain("parentId: parent-1");
            expect(markdown).toContain("bucketId: bucket-1");
            expect(markdown).toContain("startDate: 2024-01-01");
            expect(markdown).toContain("dueDate: 2024-12-31");
            expect(markdown).toContain("tags:");
            expect(markdown).toContain("  - urgent");
            expect(markdown).toContain("  - feature");
            expect(markdown).toContain("collapsed: false");
        });

        it("should include description in markdown body", () => {
            const task: PlannerTask = {
                id: "task-3",
                title: "Task with Description",
                status: "Not Started",
                completed: false,
                description: "This is a detailed description\nwith multiple lines.",
            };

            const markdown = taskSync.taskToMarkdown(task, "Test Project");

            expect(markdown).toContain("This is a detailed description");
            expect(markdown).toContain("with multiple lines.");
        });

        it("should format subtasks as checkboxes", () => {
            const task: PlannerTask = {
                id: "task-4",
                title: "Task with Subtasks",
                status: "Not Started",
                completed: false,
                subtasks: [
                    { id: "sub-1", title: "Completed subtask", completed: true },
                    { id: "sub-2", title: "Pending subtask", completed: false },
                ],
            };

            const markdown = taskSync.taskToMarkdown(task, "Test Project");

            expect(markdown).toContain("## Subtasks");
            expect(markdown).toContain("- [x] Completed subtask");
            expect(markdown).toContain("- [ ] Pending subtask");
        });

        it("should format dependencies with task links", () => {
            const task: PlannerTask = {
                id: "task-5",
                title: "Task with Dependencies",
                status: "Not Started",
                completed: false,
                dependencies: [
                    { type: "FS", predecessorId: "pred-1" },
                    { type: "SS", predecessorId: "pred-2" },
                ],
            };

            // Mock predecessor tasks
            (mockPlugin.taskStore.getTaskById as jest.Mock).mockImplementation((id: string) => {
                if (id === "pred-1") return { id: "pred-1", title: "Predecessor 1" } as PlannerTask;
                if (id === "pred-2") return { id: "pred-2", title: "Predecessor 2" } as PlannerTask;
                return null;
            });

            const markdown = taskSync.taskToMarkdown(task, "Test Project");

            expect(markdown).toContain("## Dependencies");
            expect(markdown).toContain("- FS: [[Predecessor 1]]");
            expect(markdown).toContain("- SS: [[Predecessor 2]]");
            expect(markdown).toContain("dependencies:");
            expect(markdown).toContain("  - FS:pred-1");
            expect(markdown).toContain("  - SS:pred-2");
        });

        it("should format links (obsidian and external)", () => {
            const task: PlannerTask = {
                id: "task-6",
                title: "Task with Links",
                status: "Not Started",
                completed: false,
                links: [
                    { id: "link-1", title: "Internal Note", url: "Internal Note", type: "obsidian" },
                    { id: "link-2", title: "GitHub", url: "https://github.com", type: "external" },
                ],
            };

            const markdown = taskSync.taskToMarkdown(task, "Test Project");

            expect(markdown).toContain("## Links");
            expect(markdown).toContain("- [[Internal Note]]");
            expect(markdown).toContain("- [https://github.com](https://github.com)");
        });
    });

    describe("parseMarkdownContent", () => {
        it("should parse description from markdown body", () => {
            const content = `---
id: task-1
title: Test
---

This is the description.

## Subtasks
- [ ] Sub 1
`;
            // Use a private method - we'll access it via any cast
            const result = (taskSync as any).parseMarkdownContent(content);

            expect(result.description).toBe("This is the description.");
        });

        it("should parse subtasks from markdown", () => {
            const content = `---
id: task-1
title: Test
---

## Subtasks

- [x] Completed task
- [ ] Pending task
- [x] Another completed

## Links
`;
            const result = (taskSync as any).parseMarkdownContent(content);

            expect(result.subtasks).toHaveLength(3);
            expect(result.subtasks[0].title).toBe("Completed task");
            expect(result.subtasks[0].completed).toBe(true);
            expect(result.subtasks[1].title).toBe("Pending task");
            expect(result.subtasks[1].completed).toBe(false);
        });

        it("should parse obsidian links from markdown", () => {
            const content = `---
id: task-1
title: Test
---

## Links

- [[Note 1]]
- [[Note 2]]
`;
            const result = (taskSync as any).parseMarkdownContent(content);

            expect(result.links).toHaveLength(2);
            expect(result.links[0].url).toBe("Note 1");
            expect(result.links[0].type).toBe("obsidian");
        });

        it("should parse external links from markdown", () => {
            const content = `---
id: task-1
title: Test
---

## Links

- [GitHub](https://github.com)
- [Google](https://google.com)
`;
            const result = (taskSync as any).parseMarkdownContent(content);

            expect(result.links).toHaveLength(2);
            expect(result.links[0].title).toBe("GitHub");
            expect(result.links[0].url).toBe("https://github.com");
            expect(result.links[0].type).toBe("external");
        });
    });

    describe("markdownToTask", () => {
        it("should convert markdown frontmatter to task", async () => {
            const mockFile = { path: "Test Project/Tasks/Test.md" } as TFile;

            mockMetadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    id: "task-1",
                    title: "Test Task",
                    status: "In Progress",
                    completed: false,
                    priority: "High",
                    tags: ["tag1", "tag2"],
                },
            });

            mockVault.read.mockResolvedValue(`---
id: task-1
title: Test Task
---

Task description here.
`);

            const task = await taskSync.markdownToTask(mockFile, "project-1");

            expect(task).not.toBeNull();
            expect(task?.id).toBe("task-1");
            expect(task?.title).toBe("Test Task");
            expect(task?.status).toBe("In Progress");
            expect(task?.completed).toBe(false);
            expect(task?.priority).toBe("High");
            expect(task?.tags).toEqual(["tag1", "tag2"]);
            expect(task?.description).toBe("Task description here.");
        });

        it("should return null if frontmatter is missing", async () => {
            const mockFile = { path: "Test.md" } as TFile;

            mockMetadataCache.getFileCache.mockReturnValue(null);

            const task = await taskSync.markdownToTask(mockFile, "project-1");

            expect(task).toBeNull();
        });

        it("should return null if required fields are missing", async () => {
            const mockFile = { path: "Test.md" } as TFile;

            mockMetadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    status: "Not Started",
                    // Missing id and title
                },
            });

            const task = await taskSync.markdownToTask(mockFile, "project-1");

            expect(task).toBeNull();
        });

        it("should parse dependencies from frontmatter", async () => {
            const mockFile = { path: "Test.md" } as TFile;

            mockMetadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    id: "task-1",
                    title: "Test",
                    status: "Not Started",
                    completed: false,
                    dependencies: ["FS:dep-1", "SS:dep-2"],
                },
            });

            mockVault.read.mockResolvedValue("---\nid: task-1\n---");

            const task = await taskSync.markdownToTask(mockFile, "project-1");

            expect(task?.dependencies).toHaveLength(2);
            expect(task?.dependencies?.[0]).toEqual({ type: "FS", predecessorId: "dep-1" });
            expect(task?.dependencies?.[1]).toEqual({ type: "SS", predecessorId: "dep-2" });
        });
    });

    describe("getTaskFilePath", () => {
        it("should generate correct file path without base path", () => {
            const task: PlannerTask = {
                id: "task-1",
                title: "My Task",
                status: "Not Started",
                completed: false,
            };

            mockPlugin.settings.projectsBasePath = "";

            const path = taskSync.getTaskFilePath(task, "Test Project");

            expect(path).toBe("Test Project/Tasks/My Task.md");
        });

        it("should generate correct file path with base path", () => {
            const task: PlannerTask = {
                id: "task-1",
                title: "My Task",
                status: "Not Started",
                completed: false,
            };

            mockPlugin.settings.projectsBasePath = "Projects";

            const path = taskSync.getTaskFilePath(task, "Test Project");

            expect(path).toBe("Projects/Test Project/Tasks/My Task.md");
        });

        it("should sanitize invalid filename characters", () => {
            const task: PlannerTask = {
                id: "task-1",
                title: 'Invalid: /\\*?"<>| chars',
                status: "Not Started",
                completed: false,
            };

            const path = taskSync.getTaskFilePath(task, "Test Project");

            expect(path).toBe("Test Project/Tasks/Invalid- -------- chars.md");
        });
    });

    describe("syncTaskToMarkdown", () => {
        it("should create new markdown file for task", async () => {
            const task: PlannerTask = {
                id: "task-create-1",
                title: "New Task",
                status: "Not Started",
                completed: false,
            };

            mockVault.getAbstractFileByPath.mockReturnValue(null);

            await taskSync.syncTaskToMarkdown(task, "project-1");

            expect(mockVault.createFolder).toHaveBeenCalledWith("Test Project/Tasks");
            expect(mockVault.create).toHaveBeenCalledWith(
                "Test Project/Tasks/New Task.md",
                expect.stringContaining("id: task-create-1")
            );
        });

        it("should update existing markdown file for task", async () => {
            const task: PlannerTask = {
                id: "task-update-1",
                title: "Existing Task",
                status: "In Progress",
                completed: false,
            };

            const mockFile = createMockTFile("Test Project/Tasks/Existing Task.md");
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);

            await taskSync.syncTaskToMarkdown(task, "project-1");

            expect(mockVault.modify).toHaveBeenCalledWith(
                mockFile,
                expect.stringContaining("status: In Progress")
            );
            expect(mockVault.create).not.toHaveBeenCalled();
        });

        it("should handle missing project gracefully", async () => {
            const task: PlannerTask = {
                id: "task-missing-1",
                title: "Task",
                status: "Not Started",
                completed: false,
            };

            await taskSync.syncTaskToMarkdown(task, "nonexistent-project");

            expect(mockVault.create).not.toHaveBeenCalled();
            expect(mockVault.modify).not.toHaveBeenCalled();
        });
    });

    describe("handleTaskRename", () => {
        it("should delete old file and create new one", async () => {
            const task: PlannerTask = {
                id: "task-rename-1",
                title: "New Title",
                status: "Not Started",
                completed: false,
            };

            const oldFile = createMockTFile("Test Project/Tasks/Old Title.md");
            mockVault.getAbstractFileByPath
                .mockReturnValueOnce(oldFile) // First call for old file
                .mockReturnValueOnce(null); // Second call for new file

            await taskSync.handleTaskRename(task, "Old Title", "project-1");

            expect(mockVault.delete).toHaveBeenCalledWith(oldFile);
            expect(mockVault.create).toHaveBeenCalledWith(
                "Test Project/Tasks/New Title.md",
                expect.any(String)
            );
        });

        it("should handle delete error gracefully", async () => {
            const task: PlannerTask = {
                id: "task-rename-2",
                title: "New Title",
                status: "Not Started",
                completed: false,
            };

            const oldFile = createMockTFile("Test Project/Tasks/Old Title.md");
            mockVault.getAbstractFileByPath
                .mockReturnValueOnce(oldFile)
                .mockReturnValueOnce(null);
            mockVault.delete.mockRejectedValueOnce(new Error("Delete failed"));

            // Should not throw
            await taskSync.handleTaskRename(task, "Old Title", "project-1");

            // Should still attempt to create new file
            expect(mockVault.create).toHaveBeenCalled();
        });

        it("should do nothing if old file does not exist", async () => {
            const task: PlannerTask = {
                id: "task-rename-3",
                title: "New Title",
                status: "Not Started",
                completed: false,
            };

            mockVault.getAbstractFileByPath.mockReturnValue(null);

            await taskSync.handleTaskRename(task, "Old Title", "project-1");

            expect(mockVault.delete).not.toHaveBeenCalled();
        });
    });

    describe("deleteTaskMarkdown", () => {
        it("should delete task markdown file", async () => {
            const task: PlannerTask = {
                id: "task-del-1",
                title: "Task to Delete",
                status: "Not Started",
                completed: false,
            };

            const mockFile = createMockTFile("Test Project/Tasks/Task to Delete.md");
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);

            await taskSync.deleteTaskMarkdown(task, "Test Project");

            expect(mockVault.delete).toHaveBeenCalledWith(mockFile);
        });

        it("should do nothing if file does not exist", async () => {
            const task: PlannerTask = {
                id: "task-del-2",
                title: "Non-existent",
                status: "Not Started",
                completed: false,
            };

            mockVault.getAbstractFileByPath.mockReturnValue(null);

            await taskSync.deleteTaskMarkdown(task, "Test Project");

            expect(mockVault.delete).not.toHaveBeenCalled();
        });
    });

    describe("syncMarkdownToTask", () => {
        it("should update existing task from markdown", async () => {
            const mockFile = createMockTFile("Test Project/Tasks/Test.md");

            mockMetadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    id: "task-1",
                    title: "Updated from Markdown",
                    status: "In Progress",
                    completed: false,
                },
            });

            mockVault.read.mockResolvedValue(`---
id: task-1
title: Updated from Markdown
---

Description here.
`);

            (mockPlugin.taskStore.getTaskById as jest.Mock).mockReturnValue({
                id: "task-1",
                title: "Original",
                status: "Not Started",
                completed: false,
            } as PlannerTask);

            await taskSync.syncMarkdownToTask(mockFile, "project-1");

            expect(mockPlugin.taskStore.addTaskFromObject).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "task-1",
                    title: "Updated from Markdown",
                })
            );
        });

        it("should add new task if it doesn't exist in store", async () => {
            const mockFile = createMockTFile("Test Project/Tasks/New Task.md");

            mockMetadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    id: "new-task-1",
                    title: "New Task",
                    status: "Not Started",
                    completed: false,
                },
            });

            mockVault.read.mockResolvedValue(`---
id: new-task-1
title: New Task
---
`);

            (mockPlugin.taskStore.getTaskById as jest.Mock).mockReturnValue(undefined);

            await taskSync.syncMarkdownToTask(mockFile, "project-1");

            expect(mockPlugin.taskStore.addTaskFromObject).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "new-task-1",
                    title: "New Task",
                })
            );
        });

        it("should handle title change by renaming file", async () => {
            const mockFile = createMockTFile("Test Project/Tasks/Old Name.md");
            const mockFileManager = {
                renameFile: jest.fn().mockResolvedValue(undefined),
            };
            mockApp.fileManager = mockFileManager;

            mockMetadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    id: "task-1",
                    title: "New Name",
                    status: "Not Started",
                    completed: false,
                },
            });

            mockVault.read.mockResolvedValue(`---
id: task-1
title: New Name
---
`);

            (mockPlugin.taskStore.getTaskById as jest.Mock).mockReturnValue({
                id: "task-1",
                title: "Old Name",
                status: "Not Started",
                completed: false,
            } as PlannerTask);

            await taskSync.syncMarkdownToTask(mockFile, "project-1");

            expect(mockFileManager.renameFile).toHaveBeenCalledWith(
                mockFile,
                "Test Project/Tasks/New Name.md"
            );
        });

        it("should not rename if file path hasn't changed", async () => {
            const mockFile = createMockTFile("Test Project/Tasks/Same Name.md");
            const mockFileManager = {
                renameFile: jest.fn().mockResolvedValue(undefined),
            };
            mockApp.fileManager = mockFileManager;

            mockMetadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    id: "task-1",
                    title: "Same Name",
                    status: "Not Started",
                    completed: false,
                },
            });

            mockVault.read.mockResolvedValue(`---
id: task-1
title: Same Name
---
`);

            (mockPlugin.taskStore.getTaskById as jest.Mock).mockReturnValue({
                id: "task-1",
                title: "Old Name",
                status: "Not Started",
                completed: false,
            } as PlannerTask);

            await taskSync.syncMarkdownToTask(mockFile, "project-1");

            expect(mockFileManager.renameFile).not.toHaveBeenCalled();
        });

        it("should handle rename error gracefully", async () => {
            const mockFile = createMockTFile("Test Project/Tasks/Old Name.md");
            const mockFileManager = {
                renameFile: jest.fn().mockRejectedValue(new Error("Rename failed")),
            };
            mockApp.fileManager = mockFileManager;

            mockMetadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    id: "task-1",
                    title: "New Name",
                    status: "Not Started",
                    completed: false,
                },
            });

            mockVault.read.mockResolvedValue(`---
id: task-1
title: New Name
---
`);

            (mockPlugin.taskStore.getTaskById as jest.Mock).mockReturnValue({
                id: "task-1",
                title: "Old Name",
                status: "Not Started",
                completed: false,
            } as PlannerTask);

            // Should not throw
            await taskSync.syncMarkdownToTask(mockFile, "project-1");

            expect(mockPlugin.taskStore.addTaskFromObject).toHaveBeenCalled();
        });

        it("should respect sync lock to prevent infinite loops", async () => {
            const mockFile = createMockTFile("Test Project/Tasks/Test.md");

            mockMetadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    id: "task-lock",
                    title: "Test",
                    status: "Not Started",
                    completed: false,
                },
            });

            mockVault.read.mockResolvedValue(`---
id: task-lock
---
`);

            // Call twice quickly
            const promise1 = taskSync.syncMarkdownToTask(mockFile, "project-1");
            const promise2 = taskSync.syncMarkdownToTask(mockFile, "project-1");

            await Promise.all([promise1, promise2]);

            // Second call should be blocked by sync lock
            expect(mockPlugin.taskStore.addTaskFromObject).toHaveBeenCalledTimes(1);
        });

        it("should do nothing if markdown parsing returns null", async () => {
            const mockFile = createMockTFile("Test Project/Tasks/Invalid.md");

            mockMetadataCache.getFileCache.mockReturnValue(null);

            await taskSync.syncMarkdownToTask(mockFile, "project-1");

            expect(mockPlugin.taskStore.addTaskFromObject).not.toHaveBeenCalled();
        });
    });

    describe("markdownToTask error handling", () => {
        it("should handle vault.read error gracefully", async () => {
            const mockFile = createMockTFile("Test Project/Tasks/Error.md");

            mockMetadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    id: "task-error",
                    title: "Error Task",
                    status: "Not Started",
                    completed: false,
                },
            });

            mockVault.read.mockRejectedValue(new Error("Read error"));

            const task = await taskSync.markdownToTask(mockFile, "project-1");

            // Should still return task with frontmatter data
            expect(task).not.toBeNull();
            expect(task?.id).toBe("task-error");
            expect(task?.title).toBe("Error Task");
            // But description/subtasks/links won't be parsed
            expect(task?.description).toBeUndefined();
        });
    });

    describe("initialSync", () => {
        it("should sync all markdown files in project folder", async () => {
            const mockFiles = [
                createMockTFile("Test Project/Tasks/Task1.md"),
                createMockTFile("Test Project/Tasks/Task2.md"),
            ];

            mockVault.getAbstractFileByPath.mockReturnValue({ path: "Test Project/Tasks" });
            mockVault.getMarkdownFiles.mockReturnValue(mockFiles);

            mockMetadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    id: "task-1",
                    title: "Task",
                    status: "Not Started",
                    completed: false,
                },
            });

            mockVault.read.mockResolvedValue("---\nid: task-1\n---");
            mockPlugin.settings.projects[0].lastSyncTimestamp = undefined;

            await taskSync.initialSync("project-1", "Test Project");

            expect(mockPlugin.taskStore.addTaskFromObject).toHaveBeenCalled();
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });

        it("should skip sync if synced recently", async () => {
            const fiveMinutesAgo = Date.now() - (3 * 60 * 1000); // 3 minutes ago
            mockPlugin.settings.projects[0].lastSyncTimestamp = fiveMinutesAgo;

            await taskSync.initialSync("project-1", "Test Project");

            expect(mockVault.getMarkdownFiles).not.toHaveBeenCalled();
        });

        it("should do nothing if project not found", async () => {
            await taskSync.initialSync("non-existent", "Non-existent");

            expect(mockVault.getMarkdownFiles).not.toHaveBeenCalled();
        });

        it("should do nothing if folder does not exist", async () => {
            mockPlugin.settings.projects[0].lastSyncTimestamp = undefined;
            mockVault.getAbstractFileByPath.mockReturnValue(null);

            await taskSync.initialSync("project-1", "Test Project");

            expect(mockVault.getMarkdownFiles).not.toHaveBeenCalled();
        });
    });

    describe("parseMarkdownContent edge cases", () => {
        it("should handle content without frontmatter", () => {
            const content = "Just some text";
            const result = (taskSync as any).parseMarkdownContent(content);

            expect(result.description).toBeUndefined();
        });

        it("should handle incomplete frontmatter", () => {
            const content = "---\nid: test\n";
            const result = (taskSync as any).parseMarkdownContent(content);

            expect(result.description).toBeUndefined();
        });

        it("should extract description when no headings present", () => {
            const content = `---
id: test
---

This is a description without any headings.

---
*Task from Project: Test*
`;
            const result = (taskSync as any).parseMarkdownContent(content);

            expect(result.description).toBe("This is a description without any headings.");
        });

        it("should handle content with only footer", () => {
            const content = `---
id: test
---

Some content

---
*Task from Project: Test*
`;
            const result = (taskSync as any).parseMarkdownContent(content);

            expect(result.description).toBe("Some content");
        });
    });
});
