# Changelog

All notable changes to Obsidian Project Planner will be documented in this file.

## [0.6.4] - 2026-01-20

### Added

#### Card Preview Options
- **Card Preview Setting**: New per-task setting in Task Details to control what displays on board cards
  - **Hide**: Default mode - no extra content on card
  - **Show Checklist**: Display inline checklist with interactive checkboxes directly on card
  - **Show Description**: Display task description with full Markdown rendering on card
- **Interactive Card Checklists**: Check/uncheck checklist items directly on board cards
  - Real-time synchronization with Task Details panel
  - Updates immediately without requiring page refresh
- **Markdown Description Rendering**: Task descriptions on cards now render with full Markdown support
  - Headings, lists, links, code blocks, blockquotes
  - Styled to match Task Details description rendering
  - Scrollable container with 100px max height

### Improved

#### Board View UI Enhancements (Microsoft Planner Style)
- **"Add Task" Button Positioning**: Moved to top of bucket columns (matches MS Planner)
- **Card Layout Improvements**:
  - Tags now display at the very top of cards (MS Planner style)
  - Checkbox aligned on same row as task title
  - Improved checkbox vertical alignment with title text
  - Cards align to top of bucket columns
- **Real-time Updates**: Task Details panel now updates immediately when checklist items are changed on cards

### Fixed

#### Code Quality & CSS Improvements
- **CSS Custom Properties**: Added CSS variables for all colors for better theme consistency
  - Priority colors: `--planner-priority-low/medium/high/critical`
  - Status colors: `--planner-status-not-started/in-progress/blocked/completed`
  - Accent colors: `--planner-accent-red/blue`
- **CSS Cleanup**:
  - Removed duplicate padding declaration in `.planner-grid-wrapper`
  - Replaced 14 hardcoded color values with CSS variables
  - Fixed odd line break in `.planner-board-column-header`
  - Removed 3 unnecessary `!important` declarations
  - Removed duplicate code block at end of stylesheet
- **TaskDetailView Updates**: Simplified canonical task retrieval to use plugin's taskStore directly for better reliability

### Technical

- Enhanced `PlannerTask` type with `cardPreview` property (`"none" | "checklist" | "description"`)
- Added `MarkdownRenderer` integration to BoardView for description rendering
- Converted multiple BoardView rendering methods to async to support Markdown rendering
- Added TaskStore subscription to TaskDetailView for real-time updates
- Added comprehensive CSS styles for Markdown elements in card descriptions

## [0.6.3] - 2026-01-14

### Added

#### Daily Note Task Tagging

- **Automatic Task Import from Daily Notes**: New feature to automatically scan any markdown note in your vault for tagged tasks and import them into projects
  - Tag tasks with `#planner` to add to default project
  - Tag tasks with `#planner/ProjectName` to add to specific project
  - **Debounced file watching** - Waits 1 second after last change before scanning for better performance
  - Supports both direct project names with spaces (`#planner/Project Planner`) and hyphenated format (`#planner/Project-Planner`)
- **Easy Manual Refresh**: Multiple ways to manually trigger scanning:
  - **Ribbon Icon**: Scan icon (📡) in left sidebar for one-click refresh
  - **Command Palette**: "Scan Daily Notes for Tagged Tasks" command
  - **Settings Button**: "Scan Now" button in settings panel
- **Smart Task Parsing**: Automatically extracts metadata from task text:
  - **Priority indicators**: `!!!` (Critical), `!!` (High), `!` (Medium), or text like `(high)`, `(low)`
  - **Due dates**: Multiple formats supported - `📅 2026-01-20`, `due: 2026-01-20`, `@2026-01-20`
  - **Additional tags**: Automatically matches hashtags with configured tags in settings
  - **Completion status**: Imports `[x]` as completed, `[ ]` as not started
- **New Settings Panel**: "Daily Note Task Tagging" section with:
  - **Enable Daily Note Sync**: Toggle to activate/deactivate the feature
  - **Tag Pattern**: Customizable tag pattern (default: `#planner`)
  - **Scan Folders**: Optional folder filtering (comma-separated list)
  - **Default Project**: Required dropdown to select which project receives untagged tasks
  - **Scan Now**: Manual trigger button to import all tagged tasks from vault
- **Task Metadata**: Imported tasks include:
  - Automatic link back to source note
  - Description showing "Imported from: [[Note Name]]"
  - **Location-based tracking** - Tasks tracked by file path + line number
  - **No duplicates on edit** - Editing task content updates existing task instead of creating duplicates
  - Support for task updates (re-importing updates existing tasks)

### Technical

- **DailyNoteTaskScanner**: New utility class (`src/utils/DailyNoteTaskScanner.ts`) managing:
  - **Debounced file watching** - 1-second delay after changes to batch scans efficiently
  - **Location-based task tracking** - Uses file path + line number to prevent duplicates when editing
  - File watching using Obsidian's vault events (create, modify)
  - Regex-based task detection and parsing
  - Project name extraction with flexible space/hyphen handling
  - Automatic cleanup of removed tasks from location map
- **User-Friendly Refresh Options**:
  - Ribbon icon for quick manual scanning
  - Command palette integration
  - Notification feedback showing tasks imported count
- **TaskStore Enhancement**: New `addTaskToProject()` method to add tasks to specific projects (not just active project)
- **Settings Extensions**: Added four new settings properties:
  - `enableDailyNoteSync`: boolean
  - `dailyNoteTagPattern`: string
  - `dailyNoteScanFolders`: string[]
  - `dailyNoteDefaultProject`: string
- **Console Logging**: Comprehensive debugging output with `[DailyNoteScanner]` prefix showing:
  - Initialization details (tag pattern, folders, available projects)
  - Task detection and import progress
  - Error messages with context for troubleshooting

### Documentation

- **DAILY_NOTE_TAGGING.md**: Complete 389-line guide covering:
  - Quick start instructions
  - Basic and advanced usage examples
  - Configuration options and settings
  - Best practices for daily notes, meeting notes, and project journals
  - Comprehensive troubleshooting with console output examples
  - Debugging tips and common error solutions
  - Complete daily note template example

### Fixed

- **Duplicate task prevention** - Tasks are now tracked by file location (path + line number) instead of content hash, preventing duplicates when you edit task text
- Improved project name matching to support both spaces and hyphens consistently
- Added validation and error messages when default project is not configured

---

## [0.6.2] - 2026-01-13

### Added

#### Bidirectional Markdown Sync

- **Full Bidirectional Sync**: Complete two-way synchronization between plugin JSON data and vault markdown notes
  - Tasks sync to individual markdown files in `{ProjectName}/Tasks/` folders
  - YAML frontmatter contains all task metadata (status, priority, dates, dependencies, etc.)
  - Markdown body includes description, subtasks (checkbox lists), and links
  - Real-time automatic sync using metadata cache and vault event watchers
- **Markdown Content Parsing**: Full parsing of markdown files including:
  - Description text (content before first heading)
  - Subtasks from checkbox lists (`- [ ] item` format)
  - Wiki links (`[[Page]]`) and external links (`[text](url)`)
- **Sync Settings**: Three configurable options in plugin settings:
  - `enableMarkdownSync`: Toggle sync feature on/off
  - `autoCreateTaskNotes`: Automatically create markdown files when tasks are created in UI
  - `syncOnStartup`: Perform initial sync of all tasks when plugin loads
- **Manual Sync Button**: "Sync All Tasks Now" button in settings for bulk synchronization
- **Console Debugging**: Extensive logging with `[TaskSync]` prefix for troubleshooting sync operations

#### Project Metadata Tracking

- **Created/Updated Timestamps**: Projects now track creation and last updated dates
- **Dashboard Project Display**: Dashboard shows project metadata with timestamps and task counts
- **Clickable Project Cards**: Dashboard project cards navigate to Grid view for that project

#### UI Improvements

- **Filter Label Visibility**: Active filters now show clear labels in Grid view header
- **Dashboard Enhancements**: Improved project card layout and metadata display

### Fixed

- **Symmetric Sync**: Markdown-to-plugin sync now captures all content (previously only YAML was synced back)
- **Live Sync**: Watchers trigger automatically without requiring manual sync button clicks
- **Sync Loop Prevention**: Set-based tracking prevents infinite sync loops between UI and markdown changes

### Technical

- **TaskSync Utility**: New `src/utils/TaskSync.ts` class managing all sync operations
- **Metadata Cache Events**: Primary event listener using `metadataCache.on('changed')` for reliable YAML detection
- **Vault Event Handlers**: Backup watchers for file create, modify, and delete operations
- **TaskStore Methods**: New `addTaskFromObject()` and helper methods (`getTaskById`, `getTasks`) for sync integration
- **Sync State Tracking**: `syncInProgress` Set with 200ms timeout to prevent circular updates

### Documentation

- **MARKDOWN_SYNC.md**: Complete guide to bidirectional sync feature, YAML format, and troubleshooting
- **View Descriptions**: Updated documentation with high-level descriptions of all six views
- **Plugin Introduction**: New comprehensive overview paragraph for documentation

---

## [0.6.1] - 2026-01-07

### Added

- **View Tab Opening Behavior**: New `openViewsInNewTab` setting to control whether views open in the same tab or create new tabs
  - When disabled (default): Clicking view buttons replaces content in the active tab
  - When enabled: Each view button creates a new tab
- **Bucket Selection in Task Details**: Added dropdown selector to assign tasks to buckets directly from the task details panel
- **Bucket Column in Grid View**: New hideable "Bucket" column in grid view for quick bucket assignment and visibility

### Fixed

- **Workspace Initialization**: Fixed plugin initialization error by waiting for workspace layout to be ready before opening default view
- **Tab Reuse Logic**: Corrected `openViewsInNewTab` setting behavior to properly reuse active leaf or create new tabs based on user preference

---

## [0.6.0] - 2026-01-07

### Added

#### New Views

- **Dashboard View**: New dashboard component with KPI metrics and project overview (Foundation for v0.7.0 KPI expansion)
- **Dependency Graph View**: Visual representation of task dependencies with interactive graph visualization
- **Header Component**: Reusable header component for consistent UI across views

#### Task Management

- **Bucket Selection in Task Details**: Added dropdown selector to assign tasks to buckets directly from the task details panel
- **Bucket Column in Grid View**: New hideable "Bucket" column in grid view for quick bucket assignment and visibility
- **Project Hub Manager**: New utility for creating and managing project hub notes with task integration

#### Settings & Configuration

- **View Tab Opening Behavior**: New `openViewsInNewTab` setting to control whether views open in the same tab or create new tabs
  - When disabled (default): Clicking view buttons replaces content in the active tab
  - When enabled: Each view button creates a new tab

#### Infrastructure

- **GitHub Actions Release Workflow**: Automated build and release process that:
  - Triggers on version tags (e.g., `v0.6.0`)
  - Builds the plugin automatically
  - Extracts version from manifest.json
  - Uploads `main.js`, `manifest.json`, and `styles.css` as release assets
  - Supports BRAT plugin installation

### Fixed

- **Workspace Initialization**: Fixed plugin initialization error by waiting for workspace layout to be ready before opening default view
- **Tab Reuse Logic**: Corrected `openViewsInNewTab` setting behavior to properly reuse active leaf or create new tabs based on user preference
- **Plugin Release Distribution**: Added proper GitHub Actions workflow to include compiled artifacts in releases for BRAT compatibility

### Changed

- **Grid View Column Management**: Enhanced column system with new bucket column alongside existing columns (status, priority, tags, dates, dependencies)
- **Task Detail Panel**: Expanded task properties with bucket selection interface

### Technical

- **TypeScript Improvements**: Enhanced type definitions and interfaces for better type safety
- **Workspace API Integration**: Better integration with Obsidian workspace APIs for view management
- **Build Pipeline**: Improved build configuration with proper manifest handling

### Dependencies

No new dependencies added in this release.

---

## [0.5.0] - Previous Release

See git history for previous changelog entries.

---

## Upcoming Roadmap

- **v0.7.0**: Dashboard KPI expansion and enhancements
- **v0.8.0**: Core Obsidian plugin integrations
- **v0.9.0**: UX/UI refinements and plugin settings
- **v1.0.0**: Official release with stability improvements
