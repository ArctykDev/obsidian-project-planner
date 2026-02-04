import ProjectPlannerPlugin from '../../src/main';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { TaskStore } from '../../src/stores/taskStore';
import { TaskSync } from '../../src/utils/TaskSync';
import { DailyNoteTaskScanner } from '../../src/utils/DailyNoteTaskScanner';
import { PlannerTask } from '../../src/types';

// Mock the view classes
jest.mock('../../src/ui/GridView');
jest.mock('../../src/ui/BoardView');
jest.mock('../../src/ui/TaskDetailView');
jest.mock('../../src/ui/DependencyGraphView');
jest.mock('../../src/ui/GanttView');
jest.mock('../../src/ui/DashboardView');
jest.mock('../../src/stores/taskStore');
jest.mock('../../src/utils/TaskSync');
jest.mock('../../src/utils/DailyNoteTaskScanner');

describe('ProjectPlannerPlugin', () => {
    let plugin: ProjectPlannerPlugin;
    let mockApp: any;
    let mockManifest: any;

    beforeEach(() => {
        // Mock app
        mockApp = {
            workspace: {
                getLeaf: jest.fn().mockReturnValue({
                    setViewState: jest.fn().mockResolvedValue(undefined),
                }),
                getMostRecentLeaf: jest.fn(),
                revealLeaf: jest.fn(),
                getLeavesOfType: jest.fn().mockReturnValue([]),
            },
            vault: {
                adapter: {
                    read: jest.fn().mockResolvedValue('/* mock css */'),
                },
                getAbstractFileByPath: jest.fn(),
                createFolder: jest.fn(),
                create: jest.fn(),
                modify: jest.fn(),
            },
        };

        mockManifest = {
            id: 'obsidian-project-planner',
            name: 'Project Planner',
            version: '0.6.12',
        };

        // Create plugin instance
        plugin = new ProjectPlannerPlugin(mockApp, mockManifest);

        // Mock DOM
        document.head.innerHTML = '';
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Plugin Lifecycle', () => {
        it('should initialize with default settings when no data exists', async () => {
            plugin.loadData = jest.fn().mockResolvedValue(null);
            plugin.saveData = jest.fn().mockResolvedValue(undefined);

            await plugin.loadSettings();

            expect(plugin.settings).toBeDefined();
            expect(plugin.settings.projects).toHaveLength(1);
            expect(plugin.settings.projects[0].name).toBe('My Project');
            expect(plugin.settings.activeProjectId).toBe(plugin.settings.projects[0].id);
        });

        it('should load existing settings from data file', async () => {
            const existingSettings = {
                ...DEFAULT_SETTINGS,
                projects: [
                    { id: 'proj-1', name: 'Test Project' },
                    { id: 'proj-2', name: 'Another Project' },
                ],
                activeProjectId: 'proj-1',
            };

            plugin.loadData = jest.fn().mockResolvedValue({ settings: existingSettings });
            plugin.saveData = jest.fn().mockResolvedValue(undefined);

            await plugin.loadSettings();

            expect(plugin.settings.projects).toHaveLength(2);
            expect(plugin.settings.projects[0].name).toBe('Test Project');
            expect(plugin.settings.activeProjectId).toBe('proj-1');
        });

        it('should migrate legacy root-level settings', async () => {
            const legacySettings = {
                ...DEFAULT_SETTINGS,
                projects: [{ id: 'legacy-proj', name: 'Legacy Project' }],
                activeProjectId: 'legacy-proj',
            };

            plugin.loadData = jest.fn().mockResolvedValue(legacySettings);
            plugin.saveData = jest.fn().mockResolvedValue(undefined);

            await plugin.loadSettings();

            expect(plugin.settings.projects[0].name).toBe('Legacy Project');
            expect(plugin.saveData).toHaveBeenCalledWith(
                expect.objectContaining({
                    settings: expect.objectContaining({
                        activeProjectId: 'legacy-proj',
                    }),
                })
            );
        });

        it('should ensure default statuses exist', async () => {
            plugin.loadData = jest.fn().mockResolvedValue({
                settings: {
                    projects: [{ id: 'test', name: 'Test' }],
                    activeProjectId: 'test',
                    availableStatuses: [],
                },
            });
            plugin.saveData = jest.fn().mockResolvedValue(undefined);

            await plugin.loadSettings();

            expect(plugin.settings.availableStatuses).toBeDefined();
            expect(plugin.settings.availableStatuses.length).toBeGreaterThan(0);
        });

        it('should ensure default priorities exist', async () => {
            plugin.loadData = jest.fn().mockResolvedValue({
                settings: {
                    projects: [{ id: 'test', name: 'Test' }],
                    activeProjectId: 'test',
                    availablePriorities: [],
                },
            });
            plugin.saveData = jest.fn().mockResolvedValue(undefined);

            await plugin.loadSettings();

            expect(plugin.settings.availablePriorities).toBeDefined();
            expect(plugin.settings.availablePriorities.length).toBeGreaterThan(0);
        });

        it('should fix invalid activeProjectId', async () => {
            plugin.loadData = jest.fn().mockResolvedValue({
                settings: {
                    projects: [{ id: 'proj-1', name: 'Project 1' }],
                    activeProjectId: 'invalid-id',
                },
            });
            plugin.saveData = jest.fn().mockResolvedValue(undefined);

            await plugin.loadSettings();

            expect(plugin.settings.activeProjectId).toBe('proj-1');
        });

        it('should save settings without destroying other data', async () => {
            const existingData = {
                settings: DEFAULT_SETTINGS,
                tasksByProject: {
                    'proj-1': [{ id: '1', title: 'Task 1' }],
                },
                customField: 'preserve-this',
            };

            plugin.loadData = jest.fn().mockResolvedValue(existingData);
            plugin.saveData = jest.fn().mockResolvedValue(undefined);

            await plugin.loadSettings();
            plugin.settings.activeProjectId = 'proj-1';
            await plugin.saveSettings();

            expect(plugin.saveData).toHaveBeenCalledWith(
                expect.objectContaining({
                    tasksByProject: existingData.tasksByProject,
                    customField: 'preserve-this',
                })
            );
        });

        it('should cleanup inline styles on unload', () => {
            const styleEl = document.createElement('style');
            styleEl.id = 'test-style';
            document.head.appendChild(styleEl);
            (plugin as any).inlineStyleEl = styleEl;

            expect(document.head.contains(styleEl)).toBe(true);

            plugin.onunload();

            expect(document.head.contains(styleEl)).toBe(false);
            expect((plugin as any).inlineStyleEl).toBeNull();
        });
    });

    describe('Project Management', () => {
        beforeEach(async () => {
            plugin.loadData = jest.fn().mockResolvedValue({
                settings: {
                    ...DEFAULT_SETTINGS,
                    projects: [
                        { id: 'proj-1', name: 'Project 1' },
                        { id: 'proj-2', name: 'Project 2' },
                    ],
                    activeProjectId: 'proj-1',
                },
            });
            plugin.saveData = jest.fn().mockResolvedValue(undefined);
            await plugin.loadSettings();
        });

        it('should switch active project', async () => {
            expect(plugin.settings.activeProjectId).toBe('proj-1');

            plugin.setActiveProject('proj-2');

            expect(plugin.settings.activeProjectId).toBe('proj-2');
            expect(plugin.saveData).toHaveBeenCalled();
        });

        it('should not switch to invalid project', () => {
            plugin.setActiveProject('invalid-id');

            expect(plugin.settings.activeProjectId).toBe('proj-1');
        });

        it('should migrate project timestamps', async () => {
            plugin.loadData = jest.fn().mockResolvedValue({
                settings: {
                    ...DEFAULT_SETTINGS,
                    projects: [
                        { id: 'proj-1', name: 'Old Project' }, // Missing timestamps
                    ],
                    activeProjectId: 'proj-1',
                },
            });
            plugin.saveData = jest.fn().mockResolvedValue(undefined);

            await plugin.loadSettings();
            (plugin as any).migrateProjectTimestamps();

            expect(plugin.settings.projects[0].createdDate).toBeDefined();
            expect(plugin.settings.projects[0].lastUpdatedDate).toBeDefined();
        });
    });

    describe('View Activation', () => {
        beforeEach(async () => {
            plugin.loadData = jest.fn().mockResolvedValue(null);
            plugin.saveData = jest.fn().mockResolvedValue(undefined);
            await plugin.loadSettings();
        });

        it('should activate grid view in existing tab by default', async () => {
            const mockLeaf = {
                setViewState: jest.fn().mockResolvedValue(undefined),
            };
            mockApp.workspace.getMostRecentLeaf.mockReturnValue(mockLeaf);

            await plugin.activateView();

            expect(mockLeaf.setViewState).toHaveBeenCalledWith({
                type: 'project-planner-view',
                active: true,
            });
            expect(mockApp.workspace.revealLeaf).toHaveBeenCalledWith(mockLeaf);
        });

        it('should activate grid view in new tab when forceNewTab=true', async () => {
            const mockNewLeaf = {
                setViewState: jest.fn().mockResolvedValue(undefined),
            };
            mockApp.workspace.getLeaf.mockReturnValue(mockNewLeaf);

            await plugin.activateView(true);

            expect(mockApp.workspace.getLeaf).toHaveBeenCalledWith('tab');
            expect(mockNewLeaf.setViewState).toHaveBeenCalledWith({
                type: 'project-planner-view',
                active: true,
            });
        });

        it('should activate grid view in new tab when setting enabled', async () => {
            plugin.settings.openViewsInNewTab = true;
            const mockNewLeaf = {
                setViewState: jest.fn().mockResolvedValue(undefined),
            };
            mockApp.workspace.getLeaf.mockReturnValue(mockNewLeaf);

            await plugin.activateView();

            expect(mockApp.workspace.getLeaf).toHaveBeenCalledWith('tab');
        });

        it('should activate board view', async () => {
            const mockLeaf = {
                setViewState: jest.fn().mockResolvedValue(undefined),
            };
            mockApp.workspace.getMostRecentLeaf.mockReturnValue(mockLeaf);

            await plugin.activateBoardView();

            expect(mockLeaf.setViewState).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'project-planner-board-view',
                })
            );
        });

        it('should activate dashboard view', async () => {
            const mockLeaf = {
                setViewState: jest.fn().mockResolvedValue(undefined),
            };
            mockApp.workspace.getMostRecentLeaf.mockReturnValue(mockLeaf);

            await plugin.activateDashboardView();

            expect(mockLeaf.setViewState).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'project-planner-dashboard-view',
                })
            );
        });

        it('should activate gantt view', async () => {
            const mockLeaf = {
                setViewState: jest.fn().mockResolvedValue(undefined),
            };
            mockApp.workspace.getMostRecentLeaf.mockReturnValue(mockLeaf);

            await plugin.activateGanttView();

            expect(mockLeaf.setViewState).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'project-planner-gantt-view',
                })
            );
        });

        it('should open dependency graph', async () => {
            const mockLeaf = {
                setViewState: jest.fn().mockResolvedValue(undefined),
            };
            mockApp.workspace.getMostRecentLeaf.mockReturnValue(mockLeaf);

            await plugin.openDependencyGraph();

            expect(mockLeaf.setViewState).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'project-planner-dependency-graph',
                })
            );
        });
    });

    describe('Task Detail View', () => {
        let mockTask: PlannerTask;

        beforeEach(async () => {
            plugin.loadData = jest.fn().mockResolvedValue(null);
            plugin.saveData = jest.fn().mockResolvedValue(undefined);
            await plugin.loadSettings();

            mockTask = {
                id: 'task-1',
                title: 'Test Task',
                status: 'In Progress',
                completed: false,
                priority: 'High',
                parentId: null,
                collapsed: false,
                createdDate: '2026-02-04',
                lastModifiedDate: '2026-02-04',
            };
        });

        it('should open task detail in right sidebar', async () => {
            const mockDetailLeaf = {
                setViewState: jest.fn().mockResolvedValue(undefined),
                view: {
                    setTask: jest.fn(),
                },
            };

            mockApp.workspace.getLeavesOfType.mockReturnValue([]);
            (mockApp.workspace as any).getRightLeaf = jest.fn().mockReturnValue(mockDetailLeaf);

            await plugin.openTaskDetail(mockTask);

            expect(mockDetailLeaf.setViewState).toHaveBeenCalledWith({
                type: 'project-planner-task-detail',
                active: true,
            });
            expect(mockDetailLeaf.view.setTask).toHaveBeenCalledWith(mockTask);
            expect(mockApp.workspace.revealLeaf).toHaveBeenCalledWith(mockDetailLeaf);
        });

        it('should reuse existing detail view if available', async () => {
            const existingLeaf = {
                setViewState: jest.fn().mockResolvedValue(undefined),
                view: {
                    setTask: jest.fn(),
                },
            };

            mockApp.workspace.getLeavesOfType.mockReturnValue([existingLeaf]);

            await plugin.openTaskDetail(mockTask);

            expect(existingLeaf.view.setTask).toHaveBeenCalledWith(mockTask);
            // Should not create new leaf since one exists
            expect(mockApp.workspace.getLeaf).not.toHaveBeenCalled();
        });
    });

    describe('Task Operations', () => {
        beforeEach(async () => {
            plugin.loadData = jest.fn().mockResolvedValue(null);
            plugin.saveData = jest.fn().mockResolvedValue(undefined);
            await plugin.loadSettings();

            // Setup mocks for TaskStore and TaskSync
            plugin.taskStore = new TaskStore(plugin) as jest.Mocked<TaskStore>;
            plugin.taskSync = new TaskSync(mockApp, plugin) as jest.Mocked<TaskSync>;

            (plugin.taskStore.updateTask as jest.Mock) = jest.fn().mockResolvedValue(undefined);
            (plugin.taskStore.getTaskById as jest.Mock) = jest.fn().mockReturnValue({
                id: 'task-1',
                title: 'Updated Task',
                status: 'Completed',
            });
            (plugin.taskSync.syncTaskToMarkdown as jest.Mock) = jest.fn().mockResolvedValue(undefined);
        });

        it('should update task in store', async () => {
            plugin.settings.enableMarkdownSync = false;

            await plugin.updateTask('task-1', { status: 'Completed' });

            expect(plugin.taskStore.updateTask).toHaveBeenCalledWith('task-1', { status: 'Completed' });
        });

        it('should sync task to markdown when enabled', async () => {
            plugin.settings.enableMarkdownSync = true;
            plugin.settings.autoCreateTaskNotes = true;

            await plugin.updateTask('task-1', { status: 'Completed' });

            expect(plugin.taskStore.updateTask).toHaveBeenCalledWith('task-1', { status: 'Completed' });
            expect(plugin.taskStore.getTaskById).toHaveBeenCalledWith('task-1');
            expect(plugin.taskSync.syncTaskToMarkdown).toHaveBeenCalled();
        });

        it('should not sync to markdown when disabled', async () => {
            plugin.settings.enableMarkdownSync = false;

            await plugin.updateTask('task-1', { status: 'Completed' });

            expect(plugin.taskSync.syncTaskToMarkdown).not.toHaveBeenCalled();
        });
    });

    describe('URI Protocol Handler', () => {
        beforeEach(async () => {
            plugin.loadData = jest.fn().mockResolvedValue({
                settings: {
                    ...DEFAULT_SETTINGS,
                    projects: [
                        { id: 'proj-1', name: 'Project 1' },
                        { id: 'proj-2', name: 'Project 2' },
                    ],
                    activeProjectId: 'proj-1',
                },
            });
            plugin.saveData = jest.fn().mockResolvedValue(undefined);
            await plugin.loadSettings();

            plugin.taskStore = new TaskStore(plugin) as jest.Mocked<TaskStore>;
            (plugin.taskStore.ensureLoaded as jest.Mock) = jest.fn().mockResolvedValue(undefined);
            (plugin.taskStore.load as jest.Mock) = jest.fn().mockResolvedValue(undefined);
            (plugin.taskStore.getAll as jest.Mock) = jest.fn().mockReturnValue([
                { id: 'task-1', title: 'Task 1', status: 'Not Started' },
                { id: 'task-2', title: 'Task 2', status: 'In Progress' },
            ]);
        });

        it('should open task by ID', async () => {
            plugin.openTaskDetail = jest.fn();

            await plugin.openTaskById('task-1');

            expect(plugin.taskStore.ensureLoaded).toHaveBeenCalled();
            expect(plugin.openTaskDetail).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'task-1' })
            );
        });

        it('should switch projects before opening task', async () => {
            plugin.openTaskDetail = jest.fn();

            await plugin.openTaskById('task-2', 'proj-2');

            expect(plugin.settings.activeProjectId).toBe('proj-2');
            expect(plugin.taskStore.load).toHaveBeenCalled();
            expect(plugin.openTaskDetail).toHaveBeenCalled();
        });

        it('should not switch to invalid project', async () => {
            plugin.openTaskDetail = jest.fn();

            await plugin.openTaskById('task-1', 'invalid-project');

            expect(plugin.settings.activeProjectId).toBe('proj-1');
        });

        it('should handle task not found', async () => {
            console.warn = jest.fn();

            await plugin.openTaskById('nonexistent-task');

            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('nonexistent-task')
            );
        });
    });

    describe('Stylesheet Loading', () => {
        it('should not inject stylesheet if link already exists', async () => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'app://obsidian.md/.obsidian/plugins/obsidian-project-planner/styles.css';
            document.head.appendChild(link);

            plugin.loadData = jest.fn().mockResolvedValue(null);
            plugin.saveData = jest.fn().mockResolvedValue(undefined);

            await (plugin as any).ensureStylesheetLoaded();

            expect(document.querySelectorAll('style').length).toBe(0);
        });

        it('should inject stylesheet inline if link missing', async () => {
            plugin.loadData = jest.fn().mockResolvedValue(null);
            plugin.saveData = jest.fn().mockResolvedValue(undefined);

            await (plugin as any).ensureStylesheetLoaded();

            const inlineStyle = document.getElementById('obsidian-project-planner-inline-style');
            expect(inlineStyle).toBeDefined();
            expect(inlineStyle?.textContent).toContain('/* mock css */');
        });

        it('should handle stylesheet read failure gracefully', async () => {
            mockApp.vault.adapter.read.mockRejectedValue(new Error('File not found'));
            console.warn = jest.fn();

            await (plugin as any).ensureStylesheetLoaded();

            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('could not auto-inject stylesheet'),
                expect.any(Error)
            );
        });
    });
});
