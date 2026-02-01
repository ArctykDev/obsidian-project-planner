# Changelog

All notable changes to Obsidian Project Planner will be documented in this file.

## [0.6.10] - 2026-02-01

### Improved

#### Grid View Inline Edit Polish
- **MS Planner-Level Smoothness**: Refined task title editing with optimistic updates and seamless transitions
  - **No Disappearing Tasks**: Implemented optimistic UI updates - title changes appear instantly without flicker
  - **Smooth Fade Transitions**: Input field fades out (150ms) as updated text fades in simultaneously
  - **Instant Feedback**: New value displays immediately before background save completes
  - **Scroll Preservation**: Viewport position maintained during title edits
  - **Escape Key Polish**: Smooth fade back to original value on Escape (no harsh replacement)
  - **Enter Key Handling**: Prevents default behavior for clean save action
  - **Opacity Transitions**: Seamless cross-fade between editing and display states
  - **Background Sync**: TaskStore updates happen after UI transition for perceived instant response
  - Eliminates the "disappear and reappear" effect when renaming tasks

#### Grid View Add New Task Polish
- **MS Planner-Level Smoothness**: Enhanced task creation with professional polish and seamless transitions
  - **Smooth Row Appearance**: New tasks slide in and fade in with cubic-bezier easing (300ms animation)
  - **Coordinated Focus Timing**: Editor activation precisely timed to coordinate with row animation (150ms delay)
  - **Inline Editor Fade-In**: Input field smoothly fades in when activated (150ms opacity transition)
  - **Auto-Selection**: Task title automatically selected for immediate editing
  - **Hover Lift Effect**: Editable fields have subtle upward lift on hover (1px translateY)
  - **Input Transitions**: Border color and opacity animate smoothly during focus (200ms ease)
  - **No Jitters**: Eliminated visual jumps through requestAnimationFrame coordination
  - **Seamless Flow**: From task creation → row animation → editor activation → text selection happens in one fluid motion

#### Grid View Drag-and-Drop Polish
- **MS Planner-Level Smoothness**: Enhanced drag-and-drop with professional polish and refinement
  - **Smooth Animations**: Ghost element fades in on drag start and fades out on drop (100ms transitions)
  - **Drop Indicator Transitions**: Line indicator smoothly animates position and opacity changes when switching zones
  - **Performance Optimization**: Throttled drop zone calculations to 60fps while keeping ghost movement instant
  - **Row Highlight Transitions**: Smooth fade effects on drop target highlighting (120ms ease-out)
  - **Enhanced Drag Handle**: Subtle scale effects on hover (1.1x) and active (0.95x) with opacity transitions
  - **Auto-Scroll**: Viewport automatically scrolls when dragging near top/bottom edges (80px threshold)
  - **Visual Feedback**: Row transitions and borders smoothly animate during zone changes
  - **Reduced Class Toggling**: Optimized to only update highlights when target row changes
  - All transitions use consistent easing curves for unified feel

### Fixed

#### Grid View Date Formatting
- **Start Date Neutral Styling**: Removed conditional formatting from Start Date column
  - Start dates now always display with neutral gray styling
  - Conditional formatting (red for overdue, blue for today) only applies to Due Date column
  - Provides clearer visual distinction between start and due dates

#### Grid View Column Resizing
- **Expandable Table**: Fixed column resizing constraints on smaller viewports
  - Changed table from fixed `width: 100%` to `min-width: 100%` with `width: max-content`
  - Table now expands horizontally when columns are resized beyond viewport width
  - Horizontal scrolling activates automatically when table exceeds viewport
  - Column resizing now works consistently across all viewport sizes

## [0.6.9] - 2026-01-31

### Fixed

#### Grid View Scroll Preservation
- **Smooth Interactions**: Fixed page jumping to top after drag-and-drop operations
  - Scroll position is now automatically preserved during all TaskStore operations
  - Eliminated jitter when checking/unchecking tasks
  - Smooth scroll preservation for status changes, priority updates, and all inline edits
  - Implemented automatic scroll restoration after subscription-based re-renders

#### Grid View Task Creation
- **New Task Visibility**: Fixed newly created tasks sometimes disappearing or flickering when pressing Enter
  - Eliminated all redundant render() calls after TaskStore operations (30+ instances removed)
  - TaskStore's subscription pattern now exclusively handles re-rendering
  - Prevented race conditions between manual renders and subscription-based renders
  - Increased focus timeout to ensure DOM updates complete before activating inline editor
  - Applied to: inline editors, delete operations, drag-drop, context menus, clipboard operations, and hierarchy changes

#### Markdown Sync Improvements
- **Task Rename Handling**: Fixed duplicate markdown notes being created when renaming tasks
  - Old task file is now properly deleted when task title changes
  - New file created with updated title in one atomic operation
  - Prevents orphaned markdown files in vault
- **Bidirectional Title Sync**: Fixed task title changes in markdown files not syncing back to plugin
  - Changing `title:` in markdown frontmatter now updates task in plugin
  - Markdown file is automatically renamed to match new title
  - Full bidirectional sync for task titles now working correctly

#### Grid View Enhancements
- **Show Completed Tasks Toggle**: Fixed toggle in settings not actually filtering tasks
  - Setting now properly hides completed tasks when disabled
  - Only affects Grid View as intended (Board, Timeline, Dashboard unaffected)
  - Updated setting description to clarify Grid View-only behavior
- **Horizontal Scrolling**: Enabled horizontal scrolling for Grid View
  - Table now scrolls horizontally when many columns are visible
  - Prevents column overflow and data truncation
  - Both vertical and horizontal scrolling now work correctly
- **Subtask Drag-and-Drop**: Fixed subtasks being pushed out of parent when reordering
  - Reordering subtasks within their parent now preserves parent-child relationship
  - Dragging subtask to another parent's children correctly adopts new parent
  - Improved parent determination logic based on drop target context

## [0.6.7] - 2026-01-28

### Added

#### Board View Enhancements
- **Bucket Menu Button**: Hover over any bucket header to reveal a "..." menu button
  - Quick access to bucket actions (rename, change color, add bucket, delete)
  - Matches Grid View's inline menu button pattern
  - Right-click context menu still available for keyboard-free workflow
- **Inline Bucket Editing**: Double-click bucket names to edit them inline
  - Press Enter to save, Escape to cancel
  - Works for both regular buckets and the Unassigned bucket
  - Real-time updates with automatic save

#### Enhanced Context Menu Functionality
- **Cut, Copy, Paste Operations**: Task context menu now supports clipboard operations
  - **Cut**: Mark a task for moving to a new location (right-click → Cut)
  - **Copy**: Duplicate a task with all properties (right-click → Copy)
  - **Paste**: Insert cut/copied task below current task (right-click → Paste)
  - Cut tasks are moved and clipboard is cleared after paste
  - Copied tasks create duplicates with all properties except dependencies
  - Clipboard state persists across right-clicks until paste is performed
- **Copy Link to Task**: Generate deep links to tasks
  - Creates `obsidian://` URI for opening specific tasks
  - Links include task ID and project ID for precise navigation
  - Automatically copies link to clipboard with confirmation notice
  - Works across all devices with same vault
- **Open Markdown Task Note**: Quick access to task markdown files
  - Opens the corresponding markdown note for synced tasks
  - Only enabled when markdown sync is active
  - **Auto-creates note if it doesn't exist** - no more "note not found" errors
  - Automatically generates markdown file with full task metadata
  - Shows "Creating task note..." notification during creation
  - Follows project folder structure (ProjectName/TaskTitle.md)
- **Available in Multiple Views**: Context menu enhancements available in:
  - Grid View (hierarchical task list)
  - Timeline/Gantt View (timeline bars and task list)

#### Ribbon Icon Customization
- **Configurable Ribbon Icons**: Users can now choose which ribbon icons to display
  - Settings panel to toggle visibility for each view's ribbon icon
  - Grid view icon (enabled by default)
  - Dashboard view icon (disabled by default)
  - Board view icon (disabled by default)
  - Dependency Graph icon (disabled by default)
  - Daily Note scan icon (disabled by default, requires daily note sync to be enabled)
  - Changes take effect after reloading Obsidian
  - Reduces sidebar clutter by hiding unused view shortcuts

### Fixed

#### Code Quality & Plugin Compliance
- **Memory Leak Prevention**: Fixed memory leak in Dependency Graph View
  - Added proper cleanup of window resize event listener
  - Animation frame now properly cancelled and nullified on view close
  - Event handlers use class properties instead of `(this as any)` pattern
- **Type Safety Improvements**: Removed unsafe type assertions throughout codebase
  - Eliminated all `(plugin as any)` assertions in Header.ts, DependencyGraphView.ts, and GanttView.ts
  - Direct property access now enforces TypeScript strict mode checking
  - Better IDE autocomplete and compile-time error detection
- **Data Persistence**: Gantt view column width now uses plugin settings instead of localStorage
  - Added `ganttLeftColumnWidth` to plugin settings
  - Column width syncs across devices with Obsidian Sync
  - Removed reliance on browser localStorage API
- **Error Handling**: Added proper error handling for vault operations
  - File creation/modification wrapped in try/catch blocks
  - Type checking with `instanceof TFile` before modifying files
  - User-friendly error notices instead of silent failures
- **External Links**: Updated changelog link to GitHub releases page
  - No longer points to non-existent projectplanner.md domain
  - Links directly to plugin repository releases

#### Timeline View Improvements
- **Synchronized Scrolling**: Task list and timeline now scroll together vertically
  - Scrolling the task list automatically scrolls the timeline to match
  - Scrolling the timeline automatically scrolls the task list to match
  - Smooth synchronized scrolling with no lag or jumping
- **Proper Height Constraints**: Timeline view now respects viewport height
  - Maximum height set to prevent overflow outside view
  - Both task list and timeline scroll independently when content exceeds view height
  - Horizontal scrolling preserved for wide timelines
- **Improved Scrollbar Styling**: Consistent thin scrollbars across both columns
  - Custom styled scrollbars for better visual consistency
  - Hover effects for better interactivity

### Technical Improvements
- **Obsidian API Compliance**: All file operations use proper Obsidian vault API
- **TypeScript Strict Mode**: Full compliance with TypeScript strict type checking
- **Resource Cleanup**: Proper cleanup of event listeners and animation frames
- **Build Verification**: All code compiles without errors or warnings

## [0.6.6] - 2026-01-25

### Added

#### Settings
- **Projects Base Path Setting**: New setting to control where project folders are created
  - Defaults to "Project Planner"
  - Allows organizing all projects under a common parent folder
  - Configurable per vault

### Fixed

#### Dashboard View
- **Completed Task Filtering**: Fixed completed tasks appearing in non-Completed cards
  - Critical Priority card now excludes completed tasks
  - High Priority stats now exclude completed tasks
  - Overdue, Due Today, and Due This Week cards properly filter completed tasks
- **All Projects Display**: Fixed "Show All Projects" toggle not displaying tasks
  - Added `getAllForProject()` method to TaskStore
  - Each project now correctly displays its own tasks when viewing all projects
- **Bottom Stats Cards**: Converted static stats to clickable KPI cards
  - High Priority, Has Dependencies, and Not Started are now clickable
  - Each opens a modal showing the filtered tasks
  - All exclude completed tasks (except Not Started which shows by status)
- **Task Status Updates**: Added status badges to task modals with real-time updates
  - Checking/unchecking tasks immediately updates status badge
  - Strike-through toggles instantly
  - Status badge uses same styling as Grid/Board views

#### Grid View
- **Subtask Indentation**: Fixed inconsistent indentation for subtasks
  - Removed CSS override that was conflicting with JavaScript-calculated indentation
  - Indentation now consistent at all nesting levels (8px base + 20px per level)
  - Fixed indentation breaking when column width is reduced
  - Added `white-space: nowrap` and proper vertical alignment

#### Markdown Sync
- **Auto-Create Task Notes**: Fixed task notes not being created automatically
  - Added sync call to `updateTask()` method (was only in `addTask()`)
  - Added error handling with console logging for sync failures
  - Task notes now create/update in real-time for both new and modified tasks
- **Folder Creation**: Fixed ENOENT errors when creating task notes
  - Plugin now automatically creates parent folders if they don't exist
  - No manual folder setup required
- **Bidirectional Sync**: Fixed markdown changes not syncing back to plugin
  - File watchers now use `projectsBasePath` setting
  - Changes to task notes (priority, status, etc.) now sync back immediately
  - `initialSync`, `watchProjectFolder`, and related methods updated
- **Template Cleanup**: Removed duplicate newline before footer separator
  - Cleaner markdown output
  - Footer now appears as single instance

## [0.6.5] - 2026-01-22

### Added

#### Task Timestamps
- **Created Date Field**: Tasks now track when they were created
  - Automatically set to current date when creating new tasks
  - Preserved when syncing from markdown files
  - Displayed as read-only column in Grid View
- **Last Modified Date Field**: Tasks track when they were last updated
  - Automatically updated on any task change
  - Preserved when syncing from markdown files
  - Displayed as read-only column in Grid View
- **Smart Date Defaults**: New tasks automatically set start date to today

#### Grid View Columns
- **Created Column**: Shows task creation date (hideable, read-only)
- **Modified Column**: Shows last modification date (hideable, read-only)
- Both columns use monospace font and muted color for easy scanning

### Changed

#### Date Format Improvements
- **Simplified Date Storage**: Changed from ISO format (`2026-01-15T00:00:00.000Z`) to simple `YYYY-MM-DD` format
  - Cleaner data files
  - Easier to read and edit manually
  - Maintains backward compatibility with old ISO format
- **Sync on Startup Default**: Now defaults to `false` (was `true`)
  - Prevents duplicate tasks when using Obsidian Sync
  - File watching still works with this disabled

### Fixed

#### Plugin Startup Behavior
- **Removed Auto-Open on Startup**: Plugin no longer automatically opens a tab when Obsidian starts
  - Matches standard Obsidian plugin behavior
  - Views still restore from workspace state if previously open
  - Views only open when explicitly triggered by user (ribbon icons, commands, URI links)

#### Obsidian Sync Duplicate Prevention
- **Initial Sync Throttling**: Added 5-minute cooldown between initial syncs
  - Prevents repeated scans when syncing across multiple devices
  - Tracks last sync timestamp per project
- **Increased Sync Lock Timeouts**: Extended from 200ms to 1000ms
  - Better handles Obsidian Sync delays
  - Reduces race conditions between devices
- **Batched File Processing**: Initial sync now processes files with 100ms delays
  - Prevents overwhelming the system
  - Better handles large task folders
- **Timestamp Preservation**: Fixed `lastModifiedDate` being overwritten during sync
  - Markdown files now preserve their original timestamps
  - More accurate modification tracking
- **Sync on Startup Warning**: Added clear warning in settings
  - "⚠️ WARNING: If using Obsidian Sync, disable this to prevent duplicate tasks across devices"
  - Explains that file watching continues even when disabled
- **Better Duplicate Detection**: Improved task ID matching to prevent re-imports

### Technical

- Added `lastSyncTimestamp` to `PlannerProject` interface for sync throttling
- Enhanced `TaskSync` with better logging for debugging sync issues
- Modified `addTaskFromObject` to preserve incoming timestamps
- Added `getTodayDate()` helper function for consistent YYYY-MM-DD formatting
- Updated `TaskDetailView` date input to handle both ISO and YYYY-MM-DD formats
- Updated `TaskSync` YAML frontmatter to include `createdDate` and `lastModifiedDate`

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
