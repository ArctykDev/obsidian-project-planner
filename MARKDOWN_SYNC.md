# Bidirectional Markdown Sync

The Project Planner plugin supports bidirectional synchronization between its internal JSON data storage and markdown notes in your vault.

## How It Works

### Automatic Sync (JSON → Markdown)

When **Auto-Create Task Notes** is enabled, the plugin automatically creates/updates markdown files whenever you:

- Add a new task
- Update an existing task
- Delete a task (removes the markdown file)

Task files are stored at: `{ProjectName}/Tasks/{TaskTitle}.md`

### Automatic Sync (Markdown → JSON)

When **Enable Markdown Sync** is enabled, the plugin watches for changes in your project's Tasks folder:

- **Modify** a task note → Updates the task in the plugin (triggers when Obsidian parses the saved file)
- **Create** a new task note → Adds the task to the plugin (1 second delay for metadata cache)
- **Delete** a task note → Removes the task from the plugin

**Note:** The plugin uses Obsidian's metadata cache `changed` event to detect modifications. This event fires automatically when Obsidian finishes parsing a saved file, ensuring reliable YAML frontmatter detection without manual intervention.

### Initial Sync

When **Sync on Startup** is enabled, the plugin scans your project folders when it loads and imports any task markdown files it finds.

## Task Markdown Format

Tasks are stored as markdown files with YAML frontmatter:

```markdown
---
id: abc123-def456-ghi789
title: Implement login feature
status: In Progress
completed: false
priority: High
bucketId: bucket-1
startDate: 2026-01-10
dueDate: 2026-01-20
tags:
  - frontend
  - authentication
dependencies:
  - FS:task-id-predecessor
---

This is the task description. It can contain any markdown content.

## Subtasks

- [x] Design login UI
- [ ] Implement authentication logic
- [ ] Add password reset

## Dependencies

- FS: [[Predecessor Task Name]]

## Links

- [[Related Design Document]]
- [https://example.com](https://example.com)

---

_Task from Project: My Project_
```

## YAML Frontmatter Fields

### Required Fields

- `id` - Unique identifier (UUID format)
- `title` - Task name
- `status` - Current status (e.g., "Not Started", "In Progress", "Completed")
- `completed` - Boolean flag

### Optional Fields

- `parentId` - ID of parent task (for hierarchical tasks)
- `priority` - Priority level (e.g., "Low", "Medium", "High", "Critical")
- `bucketId` - Board view bucket assignment
- `startDate` - ISO 8601 date string
- `dueDate` - ISO 8601 date string
- `tags` - Array of tag IDs
- `collapsed` - Boolean for collapsing child tasks in grid view
- `dependencies` - Array of dependency strings in format `{TYPE}:{TASK_ID}`
  - Types: `FS` (Finish-to-Start), `SS` (Start-to-Start), `FF` (Finish-to-Finish), `SF` (Start-to-Finish)

## Settings

### Enable Markdown Sync

Enables the bidirectional sync system. When disabled, markdown files won't be watched for changes.

### Auto-Create Task Notes

Automatically create/update markdown notes when tasks are modified in the plugin UI.

### Sync on Startup

Scan project folders and import task markdown files when the plugin loads.

### Sync All Tasks Now

Manually trigger a one-time sync of all tasks to markdown files (useful for initial setup or after bulk changes).

## Creating Tasks from Markdown

You can manually create a new task by:

1. Creating a new markdown file in `{ProjectName}/Tasks/`
2. Adding YAML frontmatter with required fields (`id`, `title`, `status`, `completed`)
3. The plugin will detect the new file and import it

**Example minimal new task:**

```markdown
---
id: 550e8400-e29b-41d4-a716-446655440000
title: My New Task
status: Not Started
completed: false
---

Task description goes here.
```

**Tip:** Generate a UUID using any online UUID generator or a command like:

```powershell
[guid]::NewGuid().ToString()
```

## Conflict Resolution

The sync system uses a "sync in progress" Set with a 200ms timeout to prevent infinite loops:

- When a task is modified in the UI, it's added to `syncInProgress` Set before writing markdown
- When a markdown file is modified, the task ID is added to `syncInProgress` before updating the plugin
- If a task is already in the Set, sync operations are skipped
- Task IDs are removed from the Set after 200ms
- The last write wins in case of simultaneous edits from different sources

## Use Cases

### Manual Task Management

Edit task notes directly in markdown editors like Typora or Obsidian's source mode.

### Bulk Operations

Use scripts or find-and-replace across multiple task files to update tags, priorities, or other fields.

### Version Control

Commit task markdown files to git for team collaboration and change tracking.

### Templates

Create task templates as markdown files and copy/modify them to create new tasks.

### Integration

Use other Obsidian plugins (like Dataview or Templater) to query and manipulate task data.

## Limitations

**Note:** Full bidirectional sync is now implemented! All task fields, including description, subtasks, and links, sync between the plugin and markdown files.

**Known edge cases:**

- If you manually edit markdown and plugin data simultaneously, the last save wins
- Subtask IDs are regenerated when syncing from markdown (titles and completion state are preserved)
- Link IDs are regenerated when syncing from markdown (titles and URLs are preserved)
- New file creation has a 1-second delay to allow Obsidian's metadata cache to populate
- Parent tasks with children can be created in markdown, but only leaf tasks appear in Board View

## Troubleshooting

**Tasks not syncing from markdown:**

- Check that "Enable Markdown Sync" is enabled in settings
- Verify the file is in the correct location: `{ProjectName}/Tasks/` (matches exact project name)
- Ensure YAML frontmatter has required fields (`id`, `title`, `status`, `completed`)
- Wait a moment after saving - the metadata cache event fires after Obsidian parses the file
- Open the Developer Console (Ctrl+Shift+I / Cmd+Option+I) and look for `[TaskSync]` messages:
  - You should see "Setting up watchers for: {ProjectName}/Tasks" on plugin load
  - When you edit a file, you should see "Metadata changed: {filepath}"
  - When syncing, you should see "Updating task from markdown: {task title}"
- Try reloading the plugin (Ctrl+R / Cmd+R) after enabling sync settings
- Verify the project is active (selected in the project dropdown)

**Duplicate tasks:**

- Each task must have a unique `id`
- If you copy a task file, make sure to generate a new UUID for the `id` field

**Sync conflicts:**

- If editing both the plugin and markdown simultaneously, the last save wins
- Consider using the "Sync All Tasks Now" button to force a full refresh

**Debugging sync issues:**

1. Open Developer Console (Ctrl+Shift+I / Cmd+Option+I)
2. Filter for `TaskSync` to see sync activity
3. Check plugin load messages:
   - Look for "Setting up watchers for: {ProjectName}/Tasks"
   - Look for "Starting initial sync" and "Found X files to sync"
4. Edit a markdown file in the Tasks folder and save
5. You should see log messages showing the file being detected:
   - "Metadata changed: {filepath}" when file is saved
   - "Updating task from markdown: {task title}" during sync
6. If no messages appear:
   - Verify "Enable Markdown Sync" is enabled in settings
   - Check file path matches `{ProjectName}/Tasks/` exactly
   - Try toggling "Enable Markdown Sync" off and back on
   - Reload the plugin (Ctrl+R / Cmd+R)
7. For performance issues, check how many tasks are being synced at startup
