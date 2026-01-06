# URI Linking Feature

## Overview

The URI linking feature allows you to create deep links to specific tasks in your Project Planner from anywhere in Obsidian. This makes it easy to reference tasks from meeting notes, daily logs, or any other page in your vault.

## How It Works

### URI Format

Tasks can be opened directly using this URI format:

```
obsidian://open-planner-task?id=TASK_ID&project=PROJECT_ID
```

- `id` - The unique identifier of the task (required)
- `project` - The project ID (optional, but recommended for faster loading)

### Copy Link from Task Details

1. Open a task in the Task Details panel
2. Click the **🔗 Copy Link** button in the header
3. The URI link is copied to your clipboard
4. Paste it anywhere in your notes

### Example Usage

In any Obsidian note, you can create a link like this:

```markdown
## Meeting Notes

- Follow up on [Design Homepage](obsidian://open-planner-task?id=abc-123&project=proj-456)
- Review [API Documentation](obsidian://open-planner-task?id=def-789&project=proj-456)
```

When you click these links, the Project Planner will:

1. Switch to the correct project (if needed)
2. Open the planner view (if not already open)
3. Open the task in the detail panel

## Automatic URI Links

### Task Notes

When you run the **"Create Notes for All Tasks"** command, each task note is created in `Project Planner/Tasks/[ProjectName]/` and automatically includes a "Open in Project Planner" link at the top:

```markdown
# Task Title

[🔗 Open in Project Planner](obsidian://open-planner-task?id=...)

> Task from [[Project Name Hub|Project Name]]
```

### Project Hub

When you run the **"Create/Update Project Hub"** command, all task entries in the hub become clickable links that open the task in the planner:

```markdown
## 📋 Tasks by Status

### 🔵 In Progress

- [ ] [**Design Homepage**](obsidian://open-planner-task?id=...)
- [ ] [**Setup API**](obsidian://open-planner-task?id=...)
```

## Benefits

1. **Seamless Integration** - Link to tasks from anywhere in your vault
2. **Context Switching** - Quickly jump from notes to task details
3. **Meeting Notes** - Reference specific tasks in meeting documentation
4. **Daily Notes** - Link today's work items to your daily log
5. **Project Documentation** - Embed task links in requirements or specs

## Tips

- **Markdown Links**: Use standard markdown link syntax for better readability

  ```markdown
  [Check this task](obsidian://open-planner-task?id=...)
  ```

- **Quick Access**: Keep task notes open in a separate pane while working

- **Bi-directional Navigation**:
  - From notes → Task Detail (via URI link)
  - From Task Detail → Notes (via the links/attachments feature)

## Commands

The following commands work with URI linking:

- **Create/Update Project Hub** - Generates hub with URI links
- **Create Notes for All Tasks** - Creates task notes with "Open in Planner" links
- **Copy Link** (in Task Detail) - Copy URI to clipboard

## Technical Details

- URIs use Obsidian's protocol handler system
- Task IDs are UUIDs generated when tasks are created
- Links work across vault instances (as long as the plugin is installed)
- Project switching happens automatically when opening cross-project links
