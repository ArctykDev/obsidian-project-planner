# Changelog

All notable changes to Obsidian Project Planner will be documented in this file.

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
