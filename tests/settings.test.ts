import { DEFAULT_SETTINGS, formatDateForDisplay, parseDateInput } from "../src/settings";
import type { PlannerProject, BoardBucket } from "../src/settings";

describe("Settings", () => {
    describe("DEFAULT_SETTINGS", () => {
        it("should have empty projects array", () => {
            expect(DEFAULT_SETTINGS.projects).toEqual([]);
        });

        it("should have empty active project ID", () => {
            expect(DEFAULT_SETTINGS.activeProjectId).toBe("");
        });

        it("should default to grid view", () => {
            expect(DEFAULT_SETTINGS.defaultView).toBe("grid");
        });

        it("should show completed tasks by default", () => {
            expect(DEFAULT_SETTINGS.showCompleted).toBe(true);
        });

        it("should not open links in new tab by default", () => {
            expect(DEFAULT_SETTINGS.openLinksInNewTab).toBe(false);
        });

        it("should not open views in new tab by default", () => {
            expect(DEFAULT_SETTINGS.openViewsInNewTab).toBe(false);
        });

        it("should have empty tags array", () => {
            expect(DEFAULT_SETTINGS.availableTags).toEqual([]);
        });

        it("should have default statuses configured", () => {
            expect(DEFAULT_SETTINGS.availableStatuses).toHaveLength(4);
            expect(DEFAULT_SETTINGS.availableStatuses[0]).toEqual({
                id: "not-started",
                name: "Not Started",
                color: "#6c757d",
            });
            expect(DEFAULT_SETTINGS.availableStatuses[3]).toEqual({
                id: "completed",
                name: "Completed",
                color: "#2f9e44",
            });
        });

        it("should have default priorities configured", () => {
            expect(DEFAULT_SETTINGS.availablePriorities).toHaveLength(4);
            expect(DEFAULT_SETTINGS.availablePriorities[0]).toEqual({
                id: "low",
                name: "Low",
                color: "#6c757d",
            });
            expect(DEFAULT_SETTINGS.availablePriorities[3]).toEqual({
                id: "critical",
                name: "Critical",
                color: "#d70022",
            });
        });

        it("should enable markdown sync by default", () => {
            expect(DEFAULT_SETTINGS.enableMarkdownSync).toBe(true);
        });

        it("should auto-create task notes by default", () => {
            expect(DEFAULT_SETTINGS.autoCreateTaskNotes).toBe(true);
        });

        it("should not sync on startup by default", () => {
            expect(DEFAULT_SETTINGS.syncOnStartup).toBe(false);
        });

        it("should have default projects base path", () => {
            expect(DEFAULT_SETTINGS.projectsBasePath).toBe("Project Planner");
        });

        it("should not enable daily note sync by default", () => {
            expect(DEFAULT_SETTINGS.enableDailyNoteSync).toBe(false);
        });

        it("should have default daily note tag pattern", () => {
            expect(DEFAULT_SETTINGS.dailyNoteTagPattern).toBe("#planner");
        });

        it("should have empty daily note scan folders", () => {
            expect(DEFAULT_SETTINGS.dailyNoteScanFolders).toEqual([]);
        });

        it("should have empty daily note default project", () => {
            expect(DEFAULT_SETTINGS.dailyNoteDefaultProject).toBe("");
        });

        it("should default to ISO date format", () => {
            expect(DEFAULT_SETTINGS.dateFormat).toBe("iso");
        });

        it("should have default Gantt left column width", () => {
            expect(DEFAULT_SETTINGS.ganttLeftColumnWidth).toBe(300);
        });

        it("should show Grid ribbon icon by default", () => {
            expect(DEFAULT_SETTINGS.showRibbonIconGrid).toBe(true);
        });

        it("should not show Dashboard ribbon icon by default", () => {
            expect(DEFAULT_SETTINGS.showRibbonIconDashboard).toBe(false);
        });

        it("should not show Board ribbon icon by default", () => {
            expect(DEFAULT_SETTINGS.showRibbonIconBoard).toBe(false);
        });

        it("should not show Graph ribbon icon by default", () => {
            expect(DEFAULT_SETTINGS.showRibbonIconGraph).toBe(false);
        });

        it("should not show Daily Note Scan ribbon icon by default", () => {
            expect(DEFAULT_SETTINGS.showRibbonIconDailyNoteScan).toBe(false);
        });
    });

    describe("PlannerProject interface", () => {
        it("should support basic project structure", () => {
            const project: PlannerProject = {
                id: "test-id",
                name: "Test Project",
            };

            expect(project.id).toBe("test-id");
            expect(project.name).toBe("Test Project");
        });

        it("should support optional createdDate", () => {
            const project: PlannerProject = {
                id: "test-id",
                name: "Test Project",
                createdDate: "2024-01-01T00:00:00Z",
            };

            expect(project.createdDate).toBe("2024-01-01T00:00:00Z");
        });

        it("should support optional lastUpdatedDate", () => {
            const project: PlannerProject = {
                id: "test-id",
                name: "Test Project",
                lastUpdatedDate: "2024-01-02T00:00:00Z",
            };

            expect(project.lastUpdatedDate).toBe("2024-01-02T00:00:00Z");
        });

        it("should support optional lastSyncTimestamp", () => {
            const project: PlannerProject = {
                id: "test-id",
                name: "Test Project",
                lastSyncTimestamp: 1704153600000,
            };

            expect(project.lastSyncTimestamp).toBe(1704153600000);
        });

        it("should support optional buckets array", () => {
            const buckets: BoardBucket[] = [
                { id: "bucket-1", name: "To Do", color: "#6c757d" },
                { id: "bucket-2", name: "In Progress", color: "#0a84ff" },
            ];

            const project: PlannerProject = {
                id: "test-id",
                name: "Test Project",
                buckets,
            };

            expect(project.buckets).toHaveLength(2);
            expect(project.buckets?.[0].name).toBe("To Do");
        });

        it("should support optional unassignedBucketName", () => {
            const project: PlannerProject = {
                id: "test-id",
                name: "Test Project",
                unassignedBucketName: "Backlog",
            };

            expect(project.unassignedBucketName).toBe("Backlog");
        });

        it("should support optional completedSectionsCollapsed", () => {
            const project: PlannerProject = {
                id: "test-id",
                name: "Test Project",
                completedSectionsCollapsed: {
                    "bucket-1": true,
                    "bucket-2": false,
                },
            };

            expect(project.completedSectionsCollapsed?.["bucket-1"]).toBe(true);
            expect(project.completedSectionsCollapsed?.["bucket-2"]).toBe(false);
        });
    });

    describe("BoardBucket interface", () => {
        it("should support basic bucket structure", () => {
            const bucket: BoardBucket = {
                id: "bucket-1",
                name: "To Do",
            };

            expect(bucket.id).toBe("bucket-1");
            expect(bucket.name).toBe("To Do");
        });

        it("should support optional color", () => {
            const bucket: BoardBucket = {
                id: "bucket-1",
                name: "To Do",
                color: "#6c757d",
            };

            expect(bucket.color).toBe("#6c757d");
        });
    });

    describe("Settings validation", () => {
        it("should have valid status colors", () => {
            DEFAULT_SETTINGS.availableStatuses.forEach(status => {
                expect(status.color).toMatch(/^#[0-9a-f]{6}$/i);
            });
        });

        it("should have valid priority colors", () => {
            DEFAULT_SETTINGS.availablePriorities.forEach(priority => {
                expect(priority.color).toMatch(/^#[0-9a-f]{6}$/i);
            });
        });

        it("should have unique status IDs", () => {
            const ids = DEFAULT_SETTINGS.availableStatuses.map(s => s.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });

        it("should have unique priority IDs", () => {
            const ids = DEFAULT_SETTINGS.availablePriorities.map(p => p.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });

        it("should have valid defaultView value", () => {
            expect(["grid", "board", "gantt", "dashboard"]).toContain(DEFAULT_SETTINGS.defaultView);
        });

        it("should have valid dateFormat value", () => {
            expect(["iso", "us", "uk"]).toContain(DEFAULT_SETTINGS.dateFormat);
        });

        it("should have positive Gantt left column width", () => {
            expect(DEFAULT_SETTINGS.ganttLeftColumnWidth).toBeGreaterThan(0);
        });

        it("should have valid daily note tag pattern format", () => {
            expect(DEFAULT_SETTINGS.dailyNoteTagPattern).toMatch(/^#/);
        });
    });

    describe("Settings immutability", () => {
        it("should not mutate DEFAULT_SETTINGS when modified", () => {
            const original = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            
            // Attempt to modify (this shouldn't affect DEFAULT_SETTINGS in real usage)
            const copy = { ...DEFAULT_SETTINGS };
            copy.showCompleted = false;
            copy.dateFormat = "us";
            
            // DEFAULT_SETTINGS should remain unchanged
            expect(DEFAULT_SETTINGS.showCompleted).toBe(original.showCompleted);
            expect(DEFAULT_SETTINGS.dateFormat).toBe(original.dateFormat);
        });

        it("should create independent copies of nested arrays", () => {
            const copy = { ...DEFAULT_SETTINGS };
            copy.availableStatuses = [...copy.availableStatuses];
            copy.availableStatuses[0] = { ...copy.availableStatuses[0], name: "Modified" };
            
            // Original should remain unchanged
            expect(DEFAULT_SETTINGS.availableStatuses[0].name).toBe("Not Started");
        });
    });

    describe("Date formatting helpers", () => {
        // These are already tested in dateFormatting.test.ts
        // Adding a few integration tests here for completeness
        
        it("should format dates using default format from settings", () => {
            const result = formatDateForDisplay("2024-01-15", DEFAULT_SETTINGS.dateFormat);
            expect(result).toBe("2024-01-15"); // ISO format
        });

        it("should parse dates using default format from settings", () => {
            const result = parseDateInput("2024-01-15", DEFAULT_SETTINGS.dateFormat);
            expect(result).toBe("2024-01-15");
        });
    });
});
