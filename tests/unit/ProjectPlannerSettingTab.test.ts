import { ProjectPlannerSettingTab, DEFAULT_SETTINGS } from '../../src/settings';
import { Setting } from 'obsidian';

// Mock Setting class
jest.mock('obsidian', () => ({
    ...jest.requireActual('obsidian'),
    Setting: jest.fn().mockImplementation(function(this: any, containerEl: HTMLElement) {
        this.settingEl = document.createElement('div');
        this.controlEl = document.createElement('div');
        // Add Obsidian methods to controlEl
        const controlEl = this.controlEl;
        (controlEl as any).createDiv = (opts?: any) => {
            const div = document.createElement('div');
            if (opts?.cls) div.className = opts.cls;
            if (opts?.text) div.textContent = opts.text;
            controlEl.appendChild(div);
            return div;
        };
        (controlEl as any).createEl = (tag: string, opts?: any) => {
            const el = document.createElement(tag);
            if (opts?.cls) el.className = opts.cls;
            if (opts?.text) el.textContent = opts.text;
            if (opts?.href) (el as any).href = opts.href;
            if (opts?.attr) {
                Object.entries(opts.attr).forEach(([key, value]) => {
                    el.setAttribute(key, value as string);
                });
            }
            controlEl.appendChild(el);
            // Recursively add Obsidian methods
            (el as any).createEl = createElMock.bind(el);
            (el as any).createDiv = function(o?: any) {
                const d = document.createElement('div');
                if (o?.cls) d.className = o.cls;
                if (o?.text) d.textContent = o.text;
                el.appendChild(d);
                return d;
            };
            return el;
        };
        this.settingEl.appendChild(this.controlEl);
        containerEl.appendChild(this.settingEl);
        
        this.setName = jest.fn().mockReturnThis();
        this.setDesc = jest.fn().mockReturnThis();
        this.setHeading = jest.fn().mockReturnThis();
        this.addText = jest.fn((callback) => {
            const mockText: any = {
                setValue: jest.fn().mockReturnThis(),
                setPlaceholder: jest.fn().mockReturnThis(),
                onChange: jest.fn((handler: any) => {
                    this._textHandler = handler;
                    return mockText;
                }),
            };
            callback(mockText);
            return this;
        });
        this.addToggle = jest.fn((callback) => {
            const mockToggle: any = {
                setValue: jest.fn().mockReturnThis(),
                onChange: jest.fn((handler: any) => {
                    this._toggleHandler = handler;
                    return mockToggle;
                }),
            };
            callback(mockToggle);
            return this;
        });
        this.addDropdown = jest.fn((callback) => {
            const mockDropdown: any = {
                addOption: jest.fn().mockReturnThis(),
                setValue: jest.fn().mockReturnThis(),
                onChange: jest.fn((handler: any) => {
                    this._dropdownHandler = handler;
                    return mockDropdown;
                }),
            };
            callback(mockDropdown);
            return this;
        });
        this.addButton = jest.fn((callback) => {
            const mockButton: any = {
                setButtonText: jest.fn().mockReturnThis(),
                setCta: jest.fn().mockReturnThis(),
                onClick: jest.fn((handler: any) => {
                    this._buttonHandler = handler;
                    return mockButton;
                }),
            };
            callback(mockButton);
            return this;
        });
        this.addColorPicker = jest.fn((callback) => {
            const mockColorPicker: any = {
                setValue: jest.fn().mockReturnThis(),
                onChange: jest.fn((handler: any) => {
                    this._colorHandler = handler;
                    return mockColorPicker;
                }),
            };
            callback(mockColorPicker);
            return this;
        });
        this.addExtraButton = jest.fn((callback) => {
            const mockButton: any = {
                setIcon: jest.fn().mockReturnThis(),
                setTooltip: jest.fn().mockReturnThis(),
                onClick: jest.fn((handler: any) => {
                    this._extraButtonHandler = handler;
                    return mockButton;
                }),
            };
            callback(mockButton);
            return this;
        });
    }),
}));

// Helper functions for creating elements with Obsidian methods
function createElMock(this: HTMLElement, tag: string, options?: any) {
    const el = document.createElement(tag);
    if (options?.cls) {
        el.className = options.cls;
    }
    if (options?.text) {
        el.textContent = options.text;
    }
    if (options?.href) {
        (el as any).href = options.href;
    }
    if (options?.attr) {
        Object.entries(options.attr).forEach(([key, value]) => {
            el.setAttribute(key, value as string);
        });
    }
    this.appendChild(el);
    // Recursively add Obsidian methods
    (el as any).createEl = createElMock.bind(el);
    (el as any).createDiv = function(opts?: any) {
        const div = document.createElement('div');
        if (opts?.cls) div.className = opts.cls;
        if (opts?.text) div.textContent = opts.text;
        el.appendChild(div);
        (div as any).createEl = createElMock.bind(div);
        (div as any).createSpan = createSpanMock.bind(div);
        return div;
    };
    (el as any).createSpan = createSpanMock.bind(el);
    return el;
}

function createSpanMock(this: HTMLElement, options?: any) {
    const span = document.createElement('span');
    if (options?.cls) {
        span.className = options.cls;
    }
    if (options?.text) {
        span.textContent = options.text;
    }
    this.appendChild(span);
    (span as any).createEl = createElMock.bind(span);
    return span;
}

describe('ProjectPlannerSettingTab', () => {
    let settingTab: ProjectPlannerSettingTab;
    let mockApp: any;
    let mockPlugin: any;
    let containerEl: HTMLElement;

    beforeEach(() => {
        // Create a container element with Obsidian-specific methods
        containerEl = document.createElement('div');
        (containerEl as any).empty = jest.fn(function(this: HTMLElement) {
            this.innerHTML = '';
        });
        (containerEl as any).createDiv = jest.fn(function(this: HTMLElement, options?: any) {
            const div = document.createElement('div');
            if (options?.cls) {
                div.className = options.cls;
            }
            if (options?.text) {
                div.textContent = options.text;
            }
            this.appendChild(div);
            // Add Obsidian methods to child too
            (div as any).createEl = createElMock.bind(div);
            (div as any).createDiv = (containerEl as any).createDiv.bind(div);
            (div as any).createSpan = createSpanMock.bind(div);
            return div;
        });
        (containerEl as any).createEl = createElMock.bind(containerEl);
        (containerEl as any).createSpan = createSpanMock.bind(containerEl);
        
        mockApp = {
            workspace: {
                trigger: jest.fn(),
            },
        };

        mockPlugin = {
            app: mockApp,
            manifest: {
                version: '0.6.12',
            },
            settings: JSON.parse(JSON.stringify({
                ...DEFAULT_SETTINGS,
                projects: [
                    { id: 'proj-1', name: 'Project 1', createdDate: '2026-01-01', lastUpdatedDate: '2026-01-01' },
                    { id: 'proj-2', name: 'Project 2', createdDate: '2026-01-01', lastUpdatedDate: '2026-01-01' },
                ],
                activeProjectId: 'proj-1',
            })),
            saveSettings: jest.fn().mockResolvedValue(undefined),
            taskStore: {
                refresh: jest.fn(),
            },
            initializeTaskSync: jest.fn(),
            initializeDailyNoteScanner: jest.fn(),
            syncAllTasksToMarkdown: jest.fn(),
            dailyNoteScanner: {
                scanAllNotes: jest.fn(),
            },
            openDependencyGraph: jest.fn(),
            createTaskNotes: jest.fn(),
        };

        settingTab = new ProjectPlannerSettingTab(mockApp, mockPlugin);
        // Override containerEl
        (settingTab as any).containerEl = containerEl;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Constructor and Initialization', () => {
        it('should initialize with plugin reference', () => {
            expect(settingTab.plugin).toBe(mockPlugin);
        });

        it('should extend PluginSettingTab', () => {
            expect(settingTab).toBeInstanceOf(Object);
        });
    });

    describe('Display Method', () => {
        it('should clear container before rendering', () => {
            containerEl.innerHTML = '<div>Old content</div>';
            settingTab.display();
            expect(containerEl.querySelector('div')).toBeTruthy();
        });

        it('should create header with version', () => {
            settingTab.display();
            
            const header = containerEl.querySelector('.planner-settings-header');
            expect(header).toBeTruthy();
            
            const h2 = containerEl.querySelector('h2');
            expect(h2?.textContent).toBe('Project Planner Settings');
            
            const versionBadge = containerEl.querySelector('.planner-version-badge');
            expect(versionBadge?.textContent).toBe('v0.6.12');
        });

        it('should create changelog link', () => {
            settingTab.display();
            
            const changelogLink = containerEl.querySelector('.planner-changelog-link') as HTMLAnchorElement;
            expect(changelogLink).toBeTruthy();
            expect(changelogLink?.href).toContain('github.com');
            expect(changelogLink?.getAttribute('target')).toBe('_blank');
            expect(changelogLink?.getAttribute('rel')).toBe('noopener noreferrer');
        });

        it('should render all settings sections', () => {
            settingTab.display();
            
            // Check that Setting constructor was called multiple times
            expect(Setting).toHaveBeenCalled();
        });
    });

    describe('Project Management', () => {
        beforeEach(() => {
            settingTab.display();
        });

        it('should add new project when clicking add button', async () => {
            const initialProjectCount = mockPlugin.settings.projects.length;
            
            // Find and trigger the add project button
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const addProjectSetting = settingInstances.find((s: any) => 
                s._buttonHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Projects')
            );
            
            if (addProjectSetting?._buttonHandler) {
                await addProjectSetting._buttonHandler();
            }
            
            expect(mockPlugin.settings.projects.length).toBe(initialProjectCount + 1);
            expect(mockPlugin.settings.projects[initialProjectCount].name).toBe('New Project');
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });

        it('should update project name', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            
            // Find a project name text input
            const projectSetting = settingInstances.find((s: any) => 
                s._textHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Project 1')
            );
            
            if (projectSetting?._textHandler) {
                await projectSetting._textHandler('Updated Project Name');
            }
            
            const updatedProject = mockPlugin.settings.projects.find((p: any) => p.id === 'proj-1');
            expect(updatedProject.name).toBe('Updated Project Name');
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });

        it('should trim project name and use default if empty', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const projectSetting = settingInstances.find((s: any) => 
                s._textHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Project 1')
            );
            
            if (projectSetting?._textHandler) {
                await projectSetting._textHandler('   ');
            }
            
            const updatedProject = mockPlugin.settings.projects.find((p: any) => p.id === 'proj-1');
            expect(updatedProject.name).toBe('Untitled Project');
        });

        it('should delete project', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            
            // Find delete button for project 2
            const projectSetting = settingInstances.find((s: any) => 
                s._extraButtonHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Project 2')
            );
            
            if (projectSetting?._extraButtonHandler) {
                await projectSetting._extraButtonHandler();
            }
            
            expect(mockPlugin.settings.projects.length).toBe(1);
            expect(mockPlugin.settings.projects.find((p: any) => p.id === 'proj-2')).toBeUndefined();
        });

        it('should not delete last remaining project', async () => {
            mockPlugin.settings.projects = [{ id: 'only-proj', name: 'Only Project' }];
            settingTab.display();
            
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const projectSetting = settingInstances.find((s: any) => 
                s._extraButtonHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Only Project')
            );
            
            if (projectSetting?._extraButtonHandler) {
                await projectSetting._extraButtonHandler();
            }
            
            expect(mockPlugin.settings.projects.length).toBe(1);
        });

        it('should switch active project when deleting current active', async () => {
            mockPlugin.settings.activeProjectId = 'proj-2';
            settingTab.display();
            
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const projectSetting = settingInstances.find((s: any) => 
                s._extraButtonHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Project 2')
            );
            
            if (projectSetting?._extraButtonHandler) {
                await projectSetting._extraButtonHandler();
            }
            
            expect(mockPlugin.settings.activeProjectId).toBe('proj-1');
        });
    });

    describe('View Settings', () => {
        beforeEach(() => {
            settingTab.display();
        });

        it('should update default view', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const defaultViewSetting = settingInstances.find((s: any) => 
                s._dropdownHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Default view')
            );
            
            if (defaultViewSetting?._dropdownHandler) {
                await defaultViewSetting._dropdownHandler('board');
            }
            
            expect(mockPlugin.settings.defaultView).toBe('board');
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });

        it('should toggle show completed tasks', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const showCompletedSetting = settingInstances.find((s: any) => 
                s._toggleHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Show completed tasks in Grid View')
            );
            
            if (showCompletedSetting?._toggleHandler) {
                await showCompletedSetting._toggleHandler(false);
            }
            
            expect(mockPlugin.settings.showCompleted).toBe(false);
        });

        it('should toggle open views in new tab', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const newTabSetting = settingInstances.find((s: any) => 
                s._toggleHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Open views in new tab')
            );
            
            if (newTabSetting?._toggleHandler) {
                await newTabSetting._toggleHandler(true);
            }
            
            expect(mockPlugin.settings.openViewsInNewTab).toBe(true);
        });
    });

    describe('Date Format', () => {
        beforeEach(() => {
            settingTab.display();
        });

        it('should update date format and refresh views', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const dateFormatSetting = settingInstances.find((s: any) => 
                s._dropdownHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Date display format')
            );
            
            if (dateFormatSetting?._dropdownHandler) {
                await dateFormatSetting._dropdownHandler('us');
            }
            
            expect(mockPlugin.settings.dateFormat).toBe('us');
            expect(mockPlugin.taskStore.refresh).toHaveBeenCalled();
        });
    });

    describe('Ribbon Icons', () => {
        beforeEach(() => {
            settingTab.display();
        });

        it('should toggle grid view ribbon icon', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const ribbonSetting = settingInstances.find((s: any) => 
                s._toggleHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Grid view icon')
            );
            
            if (ribbonSetting?._toggleHandler) {
                await ribbonSetting._toggleHandler(false);
            }
            
            expect(mockPlugin.settings.showRibbonIconGrid).toBe(false);
        });

        it('should toggle dashboard view ribbon icon', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const ribbonSetting = settingInstances.find((s: any) => 
                s._toggleHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Dashboard view icon')
            );
            
            if (ribbonSetting?._toggleHandler) {
                await ribbonSetting._toggleHandler(false);
            }
            
            expect(mockPlugin.settings.showRibbonIconDashboard).toBe(false);
        });
    });

    describe('Markdown Sync', () => {
        beforeEach(() => {
            settingTab.display();
        });

        it('should enable markdown sync and initialize', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const markdownSyncSetting = settingInstances.find((s: any) => 
                s._toggleHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Enable markdown sync')
            );
            
            if (markdownSyncSetting?._toggleHandler) {
                await markdownSyncSetting._toggleHandler(true);
            }
            
            expect(mockPlugin.settings.enableMarkdownSync).toBe(true);
            expect(mockPlugin.initializeTaskSync).toHaveBeenCalled();
        });

        it('should update projects base path', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const basePathSetting = settingInstances.find((s: any) => 
                s._textHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Projects base folder')
            );
            
            if (basePathSetting?._textHandler) {
                await basePathSetting._textHandler('My Projects');
            }
            
            expect(mockPlugin.settings.projectsBasePath).toBe('My Projects');
        });

        it('should use default base path if empty', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const basePathSetting = settingInstances.find((s: any) => 
                s._textHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Projects base folder')
            );
            
            if (basePathSetting?._textHandler) {
                await basePathSetting._textHandler('   ');
            }
            
            expect(mockPlugin.settings.projectsBasePath).toBe('Project Planner');
        });

        it('should toggle auto-create task notes', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const autoCreateSetting = settingInstances.find((s: any) => 
                s._toggleHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Auto-create task notes')
            );
            
            if (autoCreateSetting?._toggleHandler) {
                await autoCreateSetting._toggleHandler(false);
            }
            
            expect(mockPlugin.settings.autoCreateTaskNotes).toBe(false);
        });

        it('should trigger sync all tasks', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const syncNowSetting = settingInstances.find((s: any) => 
                s._buttonHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Sync all tasks now')
            );
            
            if (syncNowSetting?._buttonHandler) {
                await syncNowSetting._buttonHandler();
            }
            
            expect(mockPlugin.syncAllTasksToMarkdown).toHaveBeenCalled();
        });
    });

    describe('Daily Note Sync', () => {
        beforeEach(() => {
            settingTab.display();
        });

        it('should enable daily note sync and initialize scanner', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const dailyNoteSetting = settingInstances.find((s: any) => 
                s._toggleHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Enable daily note sync')
            );
            
            if (dailyNoteSetting?._toggleHandler) {
                await dailyNoteSetting._toggleHandler(true);
            }
            
            expect(mockPlugin.settings.enableDailyNoteSync).toBe(true);
            expect(mockPlugin.initializeDailyNoteScanner).toHaveBeenCalled();
        });

        it('should update tag pattern', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const tagPatternSetting = settingInstances.find((s: any) => 
                s._textHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Tag pattern')
            );
            
            if (tagPatternSetting?._textHandler) {
                await tagPatternSetting._textHandler('#task');
            }
            
            expect(mockPlugin.settings.dailyNoteTagPattern).toBe('#task');
        });

        it('should use default tag pattern if empty', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const tagPatternSetting = settingInstances.find((s: any) => 
                s._textHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Tag pattern')
            );
            
            if (tagPatternSetting?._textHandler) {
                await tagPatternSetting._textHandler('   ');
            }
            
            expect(mockPlugin.settings.dailyNoteTagPattern).toBe('#planner');
        });

        it('should update scan folders from comma-separated list', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const scanFoldersSetting = settingInstances.find((s: any) => 
                s._textHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Scan folders')
            );
            
            if (scanFoldersSetting?._textHandler) {
                await scanFoldersSetting._textHandler('Daily Notes, Journal, Work');
            }
            
            expect(mockPlugin.settings.dailyNoteScanFolders).toEqual(['Daily Notes', 'Journal', 'Work']);
        });

        it('should filter empty folder names', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const scanFoldersSetting = settingInstances.find((s: any) => 
                s._textHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Scan folders')
            );
            
            if (scanFoldersSetting?._textHandler) {
                await scanFoldersSetting._textHandler('Daily Notes, , Work, ');
            }
            
            expect(mockPlugin.settings.dailyNoteScanFolders).toEqual(['Daily Notes', 'Work']);
        });

        it('should trigger scan all notes', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const scanNowSetting = settingInstances.find((s: any) => 
                s._buttonHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Scan now')
            );
            
            if (scanNowSetting?._buttonHandler) {
                await scanNowSetting._buttonHandler();
            }
            
            expect(mockPlugin.dailyNoteScanner.scanAllNotes).toHaveBeenCalled();
        });
    });

    describe('Actions', () => {
        beforeEach(() => {
            settingTab.display();
        });

        it('should open dependency graph', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const graphSetting = settingInstances.find((s: any) => 
                s._buttonHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Open dependency graph')
            );
            
            if (graphSetting?._buttonHandler) {
                await graphSetting._buttonHandler();
            }
            
            expect(mockPlugin.openDependencyGraph).toHaveBeenCalled();
        });

        it('should create task notes', async () => {
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const createNotesSetting = settingInstances.find((s: any) => 
                s._buttonHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Create task notes')
            );
            
            if (createNotesSetting?._buttonHandler) {
                await createNotesSetting._buttonHandler();
            }
            
            expect(mockPlugin.createTaskNotes).toHaveBeenCalled();
        });
    });

    describe('Tags Management', () => {
        beforeEach(() => {
            settingTab.display();
        });

        it('should add new tag', async () => {
            const initialTagCount = mockPlugin.settings.availableTags.length;
            const settingInstances = (Setting as jest.Mock).mock.instances;
            
            const addTagSetting = settingInstances.find((s: any) => 
                s._buttonHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Manage tags')
            );
            
            if (addTagSetting?._buttonHandler) {
                await addTagSetting._buttonHandler();
            }
            
            expect(mockPlugin.settings.availableTags.length).toBe(initialTagCount + 1);
            expect(mockPlugin.settings.availableTags[initialTagCount].name).toBe('New tag');
        });

        it('should manage tags with add functionality', async () => {
            const initialTagCount = mockPlugin.settings.availableTags.length;
            const settingInstances = (Setting as jest.Mock).mock.instances;
            
            const addTagSetting = settingInstances.find((s: any) => 
                s._buttonHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Manage tags')
            );
            
            // Add a new tag
            if (addTagSetting?._buttonHandler) {
                await addTagSetting._buttonHandler();
            }
            
            expect(mockPlugin.settings.availableTags.length).toBe(initialTagCount + 1);
            expect(mockPlugin.settings.availableTags[initialTagCount].name).toBe('New tag');
            expect(mockPlugin.settings.availableTags[initialTagCount].color).toBe('#3b82f6');
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });
    });

    describe('Statuses Management', () => {
        beforeEach(() => {
            settingTab.display();
        });

        it('should add new status', async () => {
            const initialStatusCount = mockPlugin.settings.availableStatuses.length;
            const settingInstances = (Setting as jest.Mock).mock.instances;
            
            const addStatusSetting = settingInstances.find((s: any) => 
                s._buttonHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Manage statuses')
            );
            
            if (addStatusSetting?._buttonHandler) {
                await addStatusSetting._buttonHandler();
            }
            
            expect(mockPlugin.settings.availableStatuses.length).toBe(initialStatusCount + 1);
            expect(mockPlugin.settings.availableStatuses[initialStatusCount].name).toBe('New status');
        });

        it('should not delete last status', async () => {
            mockPlugin.settings.availableStatuses = [
                { id: 'status-1', name: 'Only Status', color: '#ff0000' },
            ];
            settingTab.display();
            
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const statusSetting = settingInstances.find((s: any) => s._extraButtonHandler);
            
            if (statusSetting?._extraButtonHandler) {
                await statusSetting._extraButtonHandler();
            }
            
            expect(mockPlugin.settings.availableStatuses.length).toBe(1);
        });
    });

    describe('Priorities Management', () => {
        beforeEach(() => {
            settingTab.display();
        });

        it('should add new priority', async () => {
            const initialPriorityCount = mockPlugin.settings.availablePriorities.length;
            const settingInstances = (Setting as jest.Mock).mock.instances;
            
            const addPrioritySetting = settingInstances.find((s: any) => 
                s._buttonHandler && s.setName.mock.calls.some((call: any) => call[0] === 'Manage priorities')
            );
            
            if (addPrioritySetting?._buttonHandler) {
                await addPrioritySetting._buttonHandler();
            }
            
            expect(mockPlugin.settings.availablePriorities.length).toBe(initialPriorityCount + 1);
            expect(mockPlugin.settings.availablePriorities[initialPriorityCount].name).toBe('New priority');
        });

        it('should not delete last priority', async () => {
            mockPlugin.settings.availablePriorities = [
                { id: 'priority-1', name: 'Only Priority', color: '#ff0000' },
            ];
            settingTab.display();
            
            const settingInstances = (Setting as jest.Mock).mock.instances;
            const prioritySetting = settingInstances.find((s: any) => s._extraButtonHandler);
            
            if (prioritySetting?._extraButtonHandler) {
                await prioritySetting._extraButtonHandler();
            }
            
            expect(mockPlugin.settings.availablePriorities.length).toBe(1);
        });
    });
});
