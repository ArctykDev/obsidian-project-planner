import { DailyNoteTaskScanner } from "../../src/utils/DailyNoteTaskScanner";
import { App, TFile, Notice } from "obsidian";
import type ProjectPlannerPlugin from "../../src/main";

// Mock Notice
jest.mock('obsidian', () => ({
    ...jest.requireActual('obsidian'),
    Notice: jest.fn(),
}));

describe("DailyNoteTaskScanner", () => {
    let scanner: DailyNoteTaskScanner;
    let mockApp: any;
    let mockPlugin: any;
    let mockVault: any;
    let mockTaskStore: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockTaskStore = {
            getTaskById: jest.fn(),
            addTaskToProject: jest.fn().mockResolvedValue(undefined),
            updateTask: jest.fn().mockResolvedValue(undefined),
        };

        mockVault = {
            getAbstractFileByPath: jest.fn(),
            read: jest.fn(),
            getMarkdownFiles: jest.fn().mockReturnValue([]),
            on: jest.fn(),
        };

        mockApp = {
            vault: mockVault,
        };

        mockPlugin = {
            settings: {
                dailyNoteTagPattern: '#planner',
                dailyNoteDefaultProject: 'default-project',
                dailyNoteScanFolders: [],
                projects: [
                    { id: 'default-project', name: 'Default Project' },
                    { id: 'work-project', name: 'Work Project' },
                ],
                availableTags: [
                    { id: 'tag-urgent', name: 'urgent', color: '#ff0000' },
                    { id: 'tag-personal', name: 'personal', color: '#00ff00' },
                ],
            },
            taskStore: mockTaskStore,
            registerEvent: jest.fn(),
        };

        scanner = new DailyNoteTaskScanner(mockApp, mockPlugin);
    });

    describe("extractProjectFromTag", () => {
        it("should extract project name from tag with slash", () => {
            const result = (scanner as any).extractProjectFromTag("#planner/Work-Project some text");
            expect(result).toBe("Work Project");
        });

        it("should extract project name with hyphens and convert to spaces", () => {
            const result = (scanner as any).extractProjectFromTag("#planner/Work-Project text");
            expect(result).toBe("Work Project");
        });

        it("should return null if no project specified", () => {
            const result = (scanner as any).extractProjectFromTag("#planner some task");
            expect(result).toBeNull();
        });

        it("should handle tag at end of line", () => {
            const result = (scanner as any).extractProjectFromTag("task text #planner/Project-Name");
            expect(result).toBe("Project Name");
        });

        it("should stop at next tag boundary", () => {
            const result = (scanner as any).extractProjectFromTag("#planner/Work-Project #urgent");
            expect(result).toBe("Work Project");
        });
    });

    describe("findProjectId", () => {
        it("should find project ID by name (case insensitive)", () => {
            const result = (scanner as any).findProjectId("work project");
            expect(result).toBe("work-project");
        });

        it("should return default project ID if no project name provided", () => {
            const result = (scanner as any).findProjectId(null);
            expect(result).toBe("default-project");
        });

        it("should return null if project not found", () => {
            const result = (scanner as any).findProjectId("Non Existent Project");
            expect(result).toBeNull();
        });
    });

    describe("isTaggedTask", () => {
        it("should detect uncompleted task with planner tag", () => {
            const result = (scanner as any).isTaggedTask("- [ ] Task title #planner");
            expect(result).toBe(true);
        });

        it("should detect completed task with planner tag", () => {
            const result = (scanner as any).isTaggedTask("- [x] Task title #planner");
            expect(result).toBe(true);
        });

        it("should detect task with project-specific tag", () => {
            const result = (scanner as any).isTaggedTask("- [ ] Task #planner/Work-Project");
            expect(result).toBe(true);
        });

        it("should not detect task without planner tag", () => {
            const result = (scanner as any).isTaggedTask("- [ ] Regular task");
            expect(result).toBe(false);
        });

        it("should not detect non-task line with planner tag", () => {
            const result = (scanner as any).isTaggedTask("Regular text #planner");
            expect(result).toBe(false);
        });

        it("should detect task with indentation", () => {
            const result = (scanner as any).isTaggedTask("  - [ ] Indented task #planner");
            expect(result).toBe(true);
        });

        it("should detect task with uppercase X", () => {
            const result = (scanner as any).isTaggedTask("- [X] Completed task #planner");
            expect(result).toBe(true);
        });
    });

    describe("parseTaskLine", () => {
        let mockFile: any;

        beforeEach(() => {
            mockFile = Object.create(TFile.prototype);
            mockFile.path = "Daily Notes/2026-02-04.md";
            mockFile.basename = "2026-02-04";
        });

        it("should parse basic task with title", () => {
            const line = "- [ ] Simple task #planner";
            const result = (scanner as any).parseTaskLine(line, mockFile, 5);

            expect(result).not.toBeNull();
            expect(result.task.title).toBe("Simple task");
            expect(result.task.completed).toBe(false);
            expect(result.task.status).toBe("Not Started");
        });

        it("should parse completed task", () => {
            const line = "- [x] Completed task #planner";
            const result = (scanner as any).parseTaskLine(line, mockFile, 5);

            expect(result).not.toBeNull();
            expect(result.task.completed).toBe(true);
            expect(result.task.status).toBe("Completed");
        });

        it("should extract priority from exclamation marks", () => {
            const testCases = [
                { line: "- [ ] Critical task !!! #planner", expected: "Critical" },
                { line: "- [ ] High priority !! #planner", expected: "High" },
                { line: "- [ ] Medium priority ! #planner", expected: "Medium" },
            ];

            testCases.forEach(({ line, expected }) => {
                const result = (scanner as any).parseTaskLine(line, mockFile, 5);
                expect(result.task.priority).toBe(expected);
                expect(result.task.title).not.toContain("!");
            });
        });

        it("should extract priority from text markers", () => {
            const testCases = [
                { line: "- [ ] Task (critical) #planner", expected: "Critical" },
                { line: "- [ ] Task (high) #planner", expected: "High" },
                { line: "- [ ] Task (medium) #planner", expected: "Medium" },
                { line: "- [ ] Task (low) #planner", expected: "Low" },
            ];

            testCases.forEach(({ line, expected }) => {
                const result = (scanner as any).parseTaskLine(line, mockFile, 5);
                expect(result.task.priority).toBe(expected);
                expect(result.task.title).not.toContain("(");
            });
        });

        it("should extract due date from various formats", () => {
            const testCases = [
                "- [ ] Task 📅 2026-03-15 #planner",
                "- [ ] Task due: 2026-03-15 #planner",
                "- [ ] Task @2026-03-15 #planner",
            ];

            testCases.forEach(line => {
                const result = (scanner as any).parseTaskLine(line, mockFile, 5);
                expect(result.task.dueDate).toBe("2026-03-15");
                expect(result.task.title).toBe("Task");
            });
        });

        it("should extract additional tags from settings", () => {
            const line = "- [ ] Task #urgent #personal #planner";
            const result = (scanner as any).parseTaskLine(line, mockFile, 5);

            expect(result.task.tags).toContain('tag-urgent');
            expect(result.task.tags).toContain('tag-personal');
            expect(result.task.tags?.length).toBe(2);
        });

        it("should ignore tags not in settings", () => {
            const line = "- [ ] Task #unknown-tag #planner";
            const result = (scanner as any).parseTaskLine(line, mockFile, 5);

            expect(result.task.tags || []).toEqual([]);
        });

        it("should create description with source link", () => {
            const line = "- [ ] Task #planner";
            const result = (scanner as any).parseTaskLine(line, mockFile, 5);

            expect(result.task.description).toContain("[[2026-02-04]]");
        });

        it("should create obsidian link back to source", () => {
            const line = "- [ ] Task #planner";
            const result = (scanner as any).parseTaskLine(line, mockFile, 5);

            expect(result.task.links).toHaveLength(1);
            expect(result.task.links[0].type).toBe("obsidian");
            expect(result.task.links[0].title).toBe("2026-02-04");
            expect(result.task.links[0].url).toBe("Daily Notes/2026-02-04.md");
        });

        it("should generate location key for tracking", () => {
            const line = "- [ ] Task #planner";
            const result = (scanner as any).parseTaskLine(line, mockFile, 5);

            expect(result.locationKey).toBe("Daily Notes/2026-02-04.md:5");
        });

        it("should reuse task ID for same location", () => {
            const line = "- [ ] Task #planner";
            
            // First parse
            const result1 = (scanner as any).parseTaskLine(line, mockFile, 5);
            const firstId = result1.task.id;

            // Second parse at same location
            const result2 = (scanner as any).parseTaskLine(line, mockFile, 5);
            
            expect(result2.task.id).toBe(firstId);
        });

        it("should set timestamps for new tasks", () => {
            const line = "- [ ] Task #planner";
            const result = (scanner as any).parseTaskLine(line, mockFile, 5);

            const today = new Date().toISOString().slice(0, 10);
            expect(result.task.createdDate).toBe(today);
            expect(result.task.lastModifiedDate).toBe(today);
        });

        it("should handle complex task with all features", () => {
            const line = "- [ ] Important task !!! 📅 2026-05-01 #planner/Work-Project";
            const result = (scanner as any).parseTaskLine(line, mockFile, 10);

            // Title should have tags removed (only planner tags are removed)
            expect(result.task.title).toContain("Important task");
            expect(result.task.priority).toBe("Critical");
            expect(result.task.dueDate).toBe("2026-05-01");
        });

        it("should return null for non-task line", () => {
            const line = "Regular text #planner";
            const result = (scanner as any).parseTaskLine(line, mockFile, 5);

            expect(result).toBeNull();
        });
    });

    describe("scanFile", () => {
        let mockFile: any;

        beforeEach(() => {
            mockFile = Object.create(TFile.prototype);
            mockFile.path = "Daily Notes/2026-02-04.md";
            mockFile.basename = "2026-02-04";
            mockFile.extension = "md";
        });

        it("should skip non-markdown files", async () => {
            mockFile.extension = "txt";
            await scanner.scanFile(mockFile);

            expect(mockVault.read).not.toHaveBeenCalled();
        });

        it("should skip files outside scan folders when folders specified", async () => {
            mockPlugin.settings.dailyNoteScanFolders = ["Daily Notes", "Journal"];
            mockFile.path = "Other/file.md";

            await scanner.scanFile(mockFile);

            expect(mockVault.read).not.toHaveBeenCalled();
        });

        it("should scan files in specified folders", async () => {
            mockPlugin.settings.dailyNoteScanFolders = ["Daily Notes"];
            mockVault.read.mockResolvedValue("- [ ] Task #planner");
            mockTaskStore.getTaskById.mockReturnValue(null);

            await scanner.scanFile(mockFile);

            expect(mockVault.read).toHaveBeenCalledWith(mockFile);
            expect(mockTaskStore.addTaskToProject).toHaveBeenCalled();
        });

        it("should add new tasks to project", async () => {
            const content = "- [ ] New task #planner\n- [ ] Another task #planner";
            mockVault.read.mockResolvedValue(content);
            mockTaskStore.getTaskById.mockReturnValue(null);

            await scanner.scanFile(mockFile);

            expect(mockTaskStore.addTaskToProject).toHaveBeenCalledTimes(2);
            expect(mockTaskStore.addTaskToProject).toHaveBeenCalledWith(
                expect.objectContaining({ title: "New task" }),
                'default-project'
            );
        });

        it("should update existing tasks", async () => {
            const content = "- [x] Updated task #planner";
            mockVault.read.mockResolvedValue(content);
            mockTaskStore.getTaskById.mockReturnValue({ id: 'existing-id', title: 'Old title' });

            await scanner.scanFile(mockFile);

            expect(mockTaskStore.updateTask).toHaveBeenCalled();
            expect(mockTaskStore.addTaskToProject).not.toHaveBeenCalled();
        });

        it("should route tasks to correct project based on tag", async () => {
            const content = "- [ ] Work task #planner/Work-Project";
            mockVault.read.mockResolvedValue(content);
            mockTaskStore.getTaskById.mockReturnValue(null);

            await scanner.scanFile(mockFile);

            expect(mockTaskStore.addTaskToProject).toHaveBeenCalledWith(
                expect.objectContaining({ title: "Work task" }),
                'work-project'
            );
        });

        it("should warn if project not found", async () => {
            const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
            const content = "- [ ] Task #planner/Unknown-Project";
            mockVault.read.mockResolvedValue(content);

            await scanner.scanFile(mockFile);

            expect(consoleWarn).toHaveBeenCalledWith(
                expect.stringContaining('No project found for task')
            );
            expect(mockTaskStore.addTaskToProject).not.toHaveBeenCalled();

            consoleWarn.mockRestore();
        });

        it("should skip duplicate tasks in same scan", async () => {
            const content = "- [ ] Task #planner\n- [ ] Task #planner";
            mockVault.read.mockResolvedValue(content);
            mockTaskStore.getTaskById.mockReturnValue(null);

            // Manually set same location to force duplicate
            (scanner as any).taskLocationMap.set(`${mockFile.path}:0`, 'same-id');
            (scanner as any).taskLocationMap.set(`${mockFile.path}:1`, 'same-id');

            await scanner.scanFile(mockFile);

            // Only first occurrence should be processed
            expect(mockTaskStore.addTaskToProject).toHaveBeenCalledTimes(1);
        });

        it("should clean up removed tasks from location map", async () => {
            // Set up existing task in location map
            (scanner as any).taskLocationMap.set(`${mockFile.path}:5`, 'old-task-id');
            
            const content = "- [ ] New task #planner"; // Line 0, not line 5
            mockVault.read.mockResolvedValue(content);
            mockTaskStore.getTaskById.mockReturnValue(null);

            await scanner.scanFile(mockFile);

            // Old location should be removed
            expect((scanner as any).taskLocationMap.has(`${mockFile.path}:5`)).toBe(false);
        });

        it("should handle empty file", async () => {
            mockVault.read.mockResolvedValue("");

            await scanner.scanFile(mockFile);

            expect(mockTaskStore.addTaskToProject).not.toHaveBeenCalled();
        });

        it("should handle file with no tagged tasks", async () => {
            const content = "- [ ] Regular task\n- [x] Another task\nJust text";
            mockVault.read.mockResolvedValue(content);

            await scanner.scanFile(mockFile);

            expect(mockTaskStore.addTaskToProject).not.toHaveBeenCalled();
        });
    });

    describe("scheduleScan", () => {
        let mockFile: any;

        beforeEach(() => {
            jest.useFakeTimers();
            mockFile = Object.create(TFile.prototype);
            mockFile.path = "test.md";
            mockFile.extension = "md";
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it("should debounce file scans", async () => {
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.read.mockResolvedValue("");

            // Schedule multiple scans
            (scanner as any).scheduleScan(mockFile);
            (scanner as any).scheduleScan(mockFile);
            (scanner as any).scheduleScan(mockFile);

            // Fast-forward time
            jest.advanceTimersByTime(1000);
            await Promise.resolve(); // Allow async operations to complete

            // Should only scan once
            expect(mockVault.read).toHaveBeenCalledTimes(1);
        });

        it("should handle multiple files in batch", () => {
            const file1 = Object.create(TFile.prototype);
            file1.path = "file1.md";
            file1.extension = "md";

            const file2 = Object.create(TFile.prototype);
            file2.path = "file2.md";
            file2.extension = "md";

            (scanner as any).scheduleScan(file1);
            (scanner as any).scheduleScan(file2);

            // Both files should be in pending queue
            expect((scanner as any).pendingScans.has("file1.md")).toBe(true);
            expect((scanner as any).pendingScans.has("file2.md")).toBe(true);
        });
    });

    describe("scanAllNotes", () => {
        it("should scan all markdown files in vault", async () => {
            const file1 = Object.create(TFile.prototype);
            file1.path = "file1.md";
            file1.extension = "md";

            const file2 = Object.create(TFile.prototype);
            file2.path = "file2.md";
            file2.extension = "md";

            mockVault.getMarkdownFiles.mockReturnValue([file1, file2]);
            mockVault.read.mockResolvedValue("- [ ] Task #planner");
            mockTaskStore.getTaskById.mockReturnValue(null);

            await scanner.scanAllNotes();

            expect(mockVault.read).toHaveBeenCalledTimes(2);
            expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Imported 2 tasks'));
        });

        it("should clear processed tasks before scan", async () => {
            // Add some processed tasks
            (scanner as any).processedTasks.add('task-1');
            (scanner as any).processedTasks.add('task-2');

            mockVault.getMarkdownFiles.mockReturnValue([]);

            await scanner.scanAllNotes();

            expect((scanner as any).processedTasks.size).toBe(0);
        });

        it("should show notice with task count", async () => {
            mockVault.getMarkdownFiles.mockReturnValue([]);

            await scanner.scanAllNotes();

            expect(Notice).toHaveBeenCalledWith('Imported 0 tasks from daily notes');
        });
    });

    describe("setupWatchers", () => {
        it("should register vault event watchers", () => {
            scanner.setupWatchers();

            expect(mockPlugin.registerEvent).toHaveBeenCalledTimes(2);
            expect(mockVault.on).toHaveBeenCalledWith('modify', expect.any(Function));
            expect(mockVault.on).toHaveBeenCalledWith('create', expect.any(Function));
        });

        it("should schedule scan on file modify", () => {
            const scheduleScanSpy = jest.spyOn(scanner as any, 'scheduleScan');
            
            scanner.setupWatchers();

            // Get the modify callback
            const modifyCallback = mockVault.on.mock.calls.find(
                (call: any) => call[0] === 'modify'
            )[1];

            const mockFile = Object.create(TFile.prototype);
            modifyCallback(mockFile);

            expect(scheduleScanSpy).toHaveBeenCalledWith(mockFile);
        });

        it("should schedule scan on file create", () => {
            const scheduleScanSpy = jest.spyOn(scanner as any, 'scheduleScan');
            
            scanner.setupWatchers();

            // Get the create callback
            const createCallback = mockVault.on.mock.calls.find(
                (call: any) => call[0] === 'create'
            )[1];

            const mockFile = Object.create(TFile.prototype);
            createCallback(mockFile);

            expect(scheduleScanSpy).toHaveBeenCalledWith(mockFile);
        });
    });

    describe("quickScan", () => {
        it("should show notice and perform scan", async () => {
            mockVault.getMarkdownFiles.mockReturnValue([]);

            await scanner.quickScan();

            expect(Notice).toHaveBeenCalledWith('Scanning for tagged tasks...');
            expect(Notice).toHaveBeenCalledWith('Imported 0 tasks from daily notes');
        });
    });
});
