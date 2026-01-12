# Obsidian Project Planner - AI Agent Instructions

## Project Overview

Microsoft Planner-style project management plugin for Obsidian with multiple views (Grid, Board, Gantt/Timeline, Dashboard, Dependency Graph). Built as an Obsidian plugin using TypeScript with Rollup bundling.

## Architecture

### Core Components

- **main.ts**: Plugin entry point - registers 6 view types and manages plugin lifecycle
- **TaskStore** ([src/stores/taskStore.ts](src/stores/taskStore.ts)): Centralized reactive state manager for all tasks
  - Uses pub/sub pattern: views subscribe to get notified of changes
  - Multi-project storage with legacy migration: `tasksByProject: Record<string, PlannerTask[]>`
  - Non-destructive saves: merges with existing plugin data to preserve settings
- **ProjectHubManager** ([src/utils/ProjectHubManager.ts](src/utils/ProjectHubManager.ts)): Generates/updates Project Hub markdown notes in vault

### View System

All views follow the same pattern:

1. Extend `ItemView` from Obsidian API
2. Subscribe to TaskStore in `onOpen()`: `this.taskStore.subscribe(() => this.render())`
3. Unsubscribe in `onClose()` to prevent memory leaks
4. Each has unique `VIEW_TYPE` constant exported (e.g., `VIEW_TYPE_BOARD`, `VIEW_TYPE_GANTT`)

**Registered Views:**

- Grid View (`project-planner-view`) - Main hierarchical task table
- Board View (`project-planner-board-view`) - Kanban-style buckets
- Gantt View (`project-planner-gantt-view`) - Timeline visualization
- Dashboard View (`project-planner-dashboard-view`) - KPIs and metrics
- Dependency Graph View (`project-planner-dependency-graph`) - Task relationships
- Task Detail View (`project-planner-task-detail`) - Right sidebar panel

### Data Model

**PlannerTask** ([src/types.ts](src/types.ts)) is the core entity:

- Hierarchical support: `parentId` for parent/child relationships (Grid view)
- Status and Priority are **names**, not IDs (e.g., `"In Progress"`, `"High"`)
- `bucketId` for Board view is independent of `status` field
- Bidirectional sync: `completed` boolean syncs with `status === "Completed"`
- Task dependencies use project management types: `FS|SS|FF|SF` (Finish-to-Start, etc.)
- Links can be `"obsidian"` or `"external"` type

## Critical Patterns

### State Management

```typescript
// TaskStore is the single source of truth
await this.taskStore.updateTask(id, { status: "Completed" });
// This triggers emit() → all subscribed views re-render
```

**IMPORTANT**: Always use `taskStore.updateTask()` - never mutate tasks directly. Status changes automatically sync the `completed` flag.

### Data Persistence

- Settings and tasks stored together in `data.json` via `plugin.loadData()` / `saveData()`
- TaskStore uses non-destructive save pattern - reads existing data, merges updates
- Legacy migration: single `tasks` array → `tasksByProject` multi-project structure
- Active project determined by `settings.activeProjectId`

### Settings Structure

- `availableStatuses`, `availablePriorities`, `availableTags` are arrays of `{id, name, color}` objects
- Projects array contains `PlannerProject` with optional `buckets` (Board view)
- Settings live in same JSON as tasks - handle carefully in save operations

## Development Workflow

### Building

```bash
npm run dev      # Watch mode with live reload
npm run build    # Production build
npm run clean    # Remove build artifacts
```

Output: `main.js` + `main.js.map` + `styles.css` copied to plugin root (Rollup config)

### Plugin Manifest

- `manifest.json` defines plugin metadata (version, minAppVersion)
- `versions.json` tracks compatibility
- Update both when bumping version

### Testing in Obsidian

1. Build with `npm run build` or `npm run dev`
2. Output files land in plugin root (same as manifest.json)
3. Obsidian auto-reloads on file changes in dev mode

### Stylesheet Handling

- Source: [src/styles.css](src/styles.css)
- Rollup copies to root during build
- Plugin has fallback: if stylesheet link missing, injects inline via `ensureStylesheetLoaded()`

## Obsidian Plugin Conventions

### View Activation

```typescript
// Open in new tab or reuse based on settings
const openInNewTab = forceNewTab || this.settings?.openViewsInNewTab;
const leaf = openInNewTab
  ? this.app.workspace.getLeaf("tab")
  : this.app.workspace.activeLeaf ?? this.app.workspace.getLeaf(true);

await leaf.setViewState({ type: VIEW_TYPE_BOARD, active: true });
this.app.workspace.revealLeaf(leaf);
```

### URI Protocol Handler

Plugin registers `obsidian://open-planner-task?id=...&project=...` for deep linking to tasks.

### Vault File Operations

Use Obsidian's vault API, not Node.js fs:

```typescript
const file = this.plugin.app.vault.getAbstractFileByPath(path);
await this.plugin.app.vault.create(path, content);
await this.plugin.app.vault.modify(file, content);
```

## Code Style Notes

- TypeScript strict mode enabled
- ES2020 target, ESNext modules
- Use `crypto.randomUUID()` for ID generation
- External dependency: only `obsidian` package (provided by runtime)
- Views use `containerEl` from ItemView for DOM manipulation

## Common Gotchas

1. **Status vs Completed**: Task status is a string name, not ID. Completed is auto-synced boolean
2. **Multi-project storage**: Always read/write via TaskStore - it handles project isolation
3. **View lifecycle**: Must unsubscribe from TaskStore to avoid memory leaks
4. **Settings in data.json**: Don't overwrite entire data file - merge carefully
5. **Stylesheet injection**: Plugin handles missing stylesheet link automatically
