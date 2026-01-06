# Obsidian Graph Integration Features

This document describes the new Obsidian Graph integration features added to the Project Planner plugin.

## Features Overview

### 1. 🌐 Task Dependency Graph Visualization

A visual, interactive canvas showing your task dependencies as a directed graph.

**How to use:**

- Click the git-fork icon in the ribbon, or
- Use Command Palette: "Open Dependency Graph"
- Double-click nodes to open task details
- Drag nodes to rearrange the layout
- Click "Reset Layout" to run the force-directed layout algorithm again

**Visual Legend:**

- **Node Colors**: Status-based (Not Started=gray, In Progress=blue, Blocked=red, Completed=green)
- **Edge Colors**: Dependency type
  - Blue: Finish-to-Start (FS)
  - Green: Start-to-Start (SS)
  - Orange: Finish-to-Finish (FF)
  - Red: Start-to-Finish (SF)
- **Edge Labels**: Show dependency type (FS/SS/FF/SF)

### 2. 🔗 Bi-Directional Linking

Automatically create backlinks between tasks and Obsidian notes.

**How to use:**

1. Add links to tasks using the "Links & Attachments" section in Task Details
2. Use `[[Page Name]]` format for Obsidian internal links
3. Run Command: "Create Notes for All Tasks"
4. The plugin will:
   - Create individual note files for each task in `Tasks/[Project Name]/`
   - Add backlinks to any notes referenced in task links
   - Maintain a "Linked from Project Planner" section in target notes

**What gets created:**

- Task notes with full task details, tags, links, and dependencies
- Backlink sections in referenced notes showing which tasks link to them

### 3. 📊 Project Hub Pattern

Generate comprehensive project hub notes that serve as central nodes in your graph.

**How to use:**

- Use Command Palette: "Create/Update Project Hub"
- Hub notes are created/updated at: `Project Hubs/[Project Name] Hub.md`

**Hub includes:**

- Project progress overview with visual progress bar
- Tasks organized by status (In Progress, Blocked, Not Started, Completed)
- High priority tasks section
- Overdue tasks alerts
- Dependency overview
- Links to all related Obsidian notes

**Graph Benefits:**

- Hub becomes a central node connecting to all related content
- Easy navigation from hub to any task or note
- Provides high-level project view in graph

### 4. 🎯 Graph Filtering (Built-in)

The task notes and hub automatically include metadata that works with Obsidian's built-in graph filters:

**Filter by:**

- **Tags**: Task tags are converted to Obsidian tags (e.g., `#urgent`, `#bug-fix`)
- **Links**: Follow connections between tasks, hubs, and notes
- **Status**: Use tag format for statuses if needed
- **File location**: Filter by `Tasks/` or `Project Hubs/` folders

**Example filters:**

```
path:Tasks/
tag:#critical
file:(Hub)
```

## Workflow Examples

### Workflow 1: Project Kickoff

1. Create your project in Project Planner
2. Add tasks with dependencies
3. Run "Create/Update Project Hub" to generate overview
4. Open graph view to see project structure
5. Share the hub note link with team

### Workflow 2: Sprint Planning

1. Add links from tasks to requirement docs using `[[Doc Name]]`
2. Run "Create Notes for All Tasks" to create task notes
3. View dependency graph to identify critical path
4. Check hub for high-priority and blocked tasks

### Workflow 3: Documentation

1. Link tasks to implementation notes as you work
2. Hub automatically aggregates all linked notes
3. Bi-directional links let you navigate from notes back to tasks
4. Graph view shows knowledge connections

## Command Reference

| Command                    | Description                                 | Shortcut        |
| -------------------------- | ------------------------------------------- | --------------- |
| Open Project Planner       | Open main grid view                         | Ribbon icon 📅  |
| Open Dependency Graph      | Visual task dependency viewer               | Ribbon icon 🔀  |
| Create/Update Project Hub  | Generate/update hub note                    | Command palette |
| Create Notes for All Tasks | Create individual task notes with backlinks | Command palette |

## File Structure

All plugin-generated notes are organized under a `Project Planner` folder:

```
Project Planner/
  ├─ Hubs/
  │   └─ My Project Hub.md          # Central project overview
  └─ Tasks/
      └─ My Project/
          ├─ Implement feature.md   # Individual task notes
          ├─ Fix bug.md
          └─ Write docs.md
```

## Tips

1. **Keep Hub Updated**: Run "Create/Update Project Hub" regularly to keep overview fresh
2. **Use Obsidian Links**: Prefer `[[Page]]` format over external URLs for better graph integration
3. **Leverage Graph View**: Use Obsidian's local graph on hub notes to see project scope
4. **Tag Strategically**: Use task tags that align with your vault's tag system
5. **Dependency Visualization**: Open graph view when planning complex dependency chains

## Integration with Obsidian Core

These features leverage Obsidian's native capabilities:

- **Graph View**: All generated notes appear as nodes
- **Backlinks Panel**: Shows task connections automatically
- **Search**: Task notes are fully searchable
- **Daily Notes**: Link daily notes to tasks for time tracking
- **Dataview**: Query task notes using frontmatter (if extended)

## Future Enhancements

Potential additions:

- Frontmatter in task notes for Dataview queries
- Timeline visualization integrated with graph
- Custom graph views filtered by project
- Gantt chart export to markdown
- Integration with Obsidian Projects plugin

---

_For more information, see the main README or open an issue on GitHub._
