import { DailyNoteTaskScanner } from '../../src/utils/DailyNoteTaskScanner';

describe('DailyNoteTaskScanner', () => {
    let scanner: DailyNoteTaskScanner;
    let mockApp: any;
    let mockPlugin: any;

    beforeEach(() => {
        mockApp = {
            vault: {
                getMarkdownFiles: jest.fn(() => []),
            },
            metadataCache: {
                getFileCache: jest.fn(() => null),
            },
        };

        mockPlugin = {
            app: mockApp,
            settings: {
                dailyNoteTagPattern: '#planner',
                dailyNoteDefaultProject: 'default-project',
                projects: [
                    { id: 'work-proj', name: 'Work Project' },
                    { id: 'personal-proj', name: 'Personal Project' },
                    { id: 'multi-word', name: 'My Multi Word Project' },
                ],
            },
            taskStore: {
                getTaskById: jest.fn(),
                addTaskToProject: jest.fn(),
                updateTask: jest.fn(),
            },
        };

        scanner = new DailyNoteTaskScanner(mockApp, mockPlugin);
    });

    describe('extractProjectFromTag', () => {
        it('should extract project name with hyphens and convert to spaces', () => {
            const result = (scanner as any).extractProjectFromTag('- [ ] Task #planner/Work-Project');
            expect(result).toBe('Work Project');
        });

        it('should extract project name and stop at whitespace', () => {
            const result = (scanner as any).extractProjectFromTag('- [ ] Task #planner/Work-Project some text');
            expect(result).toBe('Work Project');
        });

        it('should extract multi-word project name with hyphens', () => {
            const result = (scanner as any).extractProjectFromTag('- [ ] Task #planner/My-Multi-Word-Project');
            expect(result).toBe('My Multi Word Project');
        });

        it('should handle project name before another tag', () => {
            const result = (scanner as any).extractProjectFromTag('- [ ] Task #urgent #planner/Work-Project #important');
            expect(result).toBe('Work Project');
        });

        it('should handle project name at end of line', () => {
            const result = (scanner as any).extractProjectFromTag('- [ ] Task #planner/Personal-Project');
            expect(result).toBe('Personal Project');
        });

        it('should return null when no project specified', () => {
            const result = (scanner as any).extractProjectFromTag('- [ ] Task #planner');
            expect(result).toBeNull();
        });

        it('should handle single word project names', () => {
            const result = (scanner as any).extractProjectFromTag('- [ ] Task #planner/Work');
            expect(result).toBe('Work');
        });
    });

    describe('findProjectId', () => {
        it('should find project by name (case insensitive)', () => {
            const result = (scanner as any).findProjectId('work project');
            expect(result).toBe('work-proj');
        });

        it('should find project with exact case', () => {
            const result = (scanner as any).findProjectId('Work Project');
            expect(result).toBe('work-proj');
        });

        it('should find multi-word project', () => {
            const result = (scanner as any).findProjectId('My Multi Word Project');
            expect(result).toBe('multi-word');
        });

        it('should return default project when name is null', () => {
            const result = (scanner as any).findProjectId(null);
            expect(result).toBe('default-project');
        });

        it('should return null when project not found', () => {
            const result = (scanner as any).findProjectId('Nonexistent Project');
            expect(result).toBeNull();
        });
    });
});
