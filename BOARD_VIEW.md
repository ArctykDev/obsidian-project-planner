# Board View (Kanban)

## Overview

The Board View provides a Microsoft Planner-style Kanban board for visualizing and managing tasks across different stages. It offers an intuitive drag-and-drop interface with cards organized in custom buckets that are independent from task status.

## Features

### **Custom Buckets**

- Per-project bucket configuration (independent from status)
- Drag and drop to reorder buckets
- Add, rename, and delete buckets per project
- Default buckets: "To Do", "In Progress", "Done"
- Each bucket shows task count (active + completed)

### **Dual Task Sections**

Each bucket has two sections:

- **Active Tasks**: Incomplete tasks (checkboxes, status tracking)
- **Completed Tasks**: Collapsible section for finished tasks
- Toggle completed section visibility per bucket

### **Leaf Tasks Only**

- Board displays only leaf tasks (tasks without children)
- Parent tasks remain in Grid View for hierarchical editing
- Keeps board focused on actionable items

### **Smart Filtering**

- Priority filter dropdown (All, Low, Medium, High, Critical)
- Search filter for task titles
- Filters apply across all buckets

### **Task Cards Display**

Each card shows:

- **Title** - Task name (clickable to open details)
- **Priority Indicators** - 🔥 Critical / ⚡ High priority badges
- **Tags** - Colored labels for categorization
- **Status** - Current task status with color coding
- **Due Date** - With overdue (red) and today (blue) highlighting
- **Subtask Progress** - Checklist completion (✓ 2/5)
- **Dependencies** - 🔗 indicator for linked tasks
- **Attachments** - 📎 indicator for links/files
- **Completion Checkbox** - Click to mark complete (moves to completed section)
- **Context Menu** - Right-click for delete option

### **Smart Columns**

- Automatically created from custom statuses in settings
- Default columns: To Do, In Progress, Done
- Each column shows task count
- "+ Add task" button at bottom of each column

### **Drag and Drop**

- **Tasks**: Drag cards between buckets to reassign
- **Buckets**: Drag bucket headers to reorder columns
- Visual feedback during drag (opacity, hover states)
- Bucket highlights when dragging task over it
- Automatic bucket assignment on task drop
- Bucket order persists per project

## Usage

### **Opening Board View**

**Via Ribbon:**

- Click the 📋 board icon in the left sidebar

**Via Command Palette:**

- Press `Ctrl/Cmd + P`
- Type "Open Board View"
- Press Enter

**Via Keyboard:**

- Assign a hotkey in Settings → Hotkeys → "Open Board View"

### **Managing Tasks**

**Create Task:**

1. Click "Add Task" in header to create with default bucket
2. Click "+ Add task" at bottom of specific bucket
3. New tasks appear in active section of target bucket

**Move Task:**

1. Click and drag a task card
2. Hover over target bucket
3. Release to drop and update bucket assignment

**Complete Task:**

1. Click checkbox on task card
2. Task moves to completed section of same bucket
3. Click again to mark incomplete (returns to active section)

**Edit Task:**

- Click card title to open Task Details panel
- Edit all properties including bucket assignment
- Changes sync instantly to the card

**Delete Task:**

- Right-click card for context menu
- Select "Delete" option
- Confirm deletion

**Toggle Completed:**

- Click "▼ Completed (X)" header in any bucket
- Collapsed state saves per bucket per project
- Helps focus on active work

### **Global Navigation**

The board view includes the same global header as Grid View:

- **Project Dropdown** - Switch between projects
- **Add Task** - Quick task creation
- **📋 Hub** - Open project hub documentation
- **⚙️ Settings** - Open plugin settings

## Microsoft Planner Style

The Board View mimics Microsoft Planner's clean, modern design:

### **Visual Elements**

- Rounded cards with subtle shadows
- Hover animations (lift effect)
- Color-coded tags and priorities
- Clean typography and spacing

### **Color Indicators**

- **Overdue Dates**: Red background, bold text
- **Today's Dates**: Blue background, bold text
- **Completed Subtasks**: Green background
- **Priority Badges**: Emoji indicators (🔥⚡)

### **Layout**

- Fixed column width (320px) for consistency
- Scrollable columns for long task lists
- Horizontal scroll for many columns
- Responsive card heights based on content

## Bucket Configuration

Buckets are configured per project and independent from task status:

### **Managing Buckets**

1. Click bucket header to select
2. Drag bucket headers left/right to reorder
3. Add new bucket: Click "+" button in toolbar
4. Rename bucket: Edit name inline in bucket header
5. Delete bucket: Select bucket, click delete (tasks remain, bucketId cleared)

### **Bucket vs Status**

Important distinction:

- **Status**: Task lifecycle state (To Do, In Progress, Done, etc.) - shown on cards
- **Bucket**: Visual grouping for organization - determines column placement
- Tasks can have any status in any bucket
- Change status via task details panel or Grid View
- Change bucket via drag-and-drop or task details dropdown

### **Per-Project Buckets**

- Each project has its own bucket configuration
- Switching projects loads that project's buckets
- Default buckets created automatically for new projects
- Buckets saved in project settings

## Customization Tips

### **Organize Workflows**

Use buckets to match your workflow:

- **By Phase**: "Planning", "Development", "Testing", "Deployed"
- **By Team**: "Backend", "Frontend", "Design", "QA"
- **By Sprint**: "Backlog", "Sprint 1", "Sprint 2", "Done"
- **By Priority**: "Critical", "This Week", "Next Week", "Someday"

### **Combine Status and Buckets**

- Use status for lifecycle tracking (visible on cards)
- Use buckets for organizational grouping (column placement)
- Example: "Design" bucket can have tasks with "In Progress" or "Done" status

### **Use Completed Sections**

- Keep completed tasks in each bucket for context
- Collapse completed sections to reduce clutter
- Use filters to find specific completed items

### **Use Tags for Categories**

Add colored tags for:

- Feature areas (Frontend, Backend, Design)
- Priority levels (if not using built-in priorities)
- Team members or assignments

### **Set Due Dates**

- Red indicators show overdue items
- Blue highlights show tasks due today
- Great for time-sensitive work

### **Track Progress with Subtasks**

- Break tasks into checklist items
- Card shows completion percentage
- Green badge when all subtasks complete

## Keyboard Shortcuts

While the board doesn't have specific keyboard shortcuts, you can:

- Use standard Obsidian navigation (`Ctrl/Cmd + Tab`, etc.)
- Click cards to open details and use all keyboard editing
- Assign custom hotkeys in Settings

## Integration

### **Task Details Panel**

- Clicking any card opens the Task Details panel (right sidebar)
- Edit all properties without leaving the board
- Bucket dropdown selector for reassignment
- Changes sync instantly to the card

### **Grid View**

- Same tasks appear in both views
- Board shows leaf tasks only; Grid shows full hierarchy
- Parent tasks must be managed in Grid View
- Switch between views seamlessly with global header

### **Project Hub**

- Click "📋 Hub" to view project documentation
- Hub includes links back to tasks via URI protocol
- Use `obsidian://open-planner-task?id=...&project=...` for deep linking

### **Markdown Sync** (v0.6.2+)

- Tasks sync bidirectionally with markdown notes in vault
- Board changes update corresponding markdown files
- Markdown edits sync back to board view
- See MARKDOWN_SYNC.md for details

## Performance

The board is optimized for smooth performance:

- Renders only visible cards
- Efficient drag and drop with HTML5 API
- Minimal re-renders on updates
- Handles hundreds of tasks smoothly

## Tips & Best Practices

1. **Limit Bucket Count**: 3-7 buckets work best for visual clarity
2. **Use Completed Sections**: Keep context without clutter by collapsing completed
3. **Leverage Filters**: Use priority and search filters to focus on specific work
4. **Drag Efficiently**: Quickly triage and organize tasks by dragging between buckets
5. **Separate Status and Buckets**: Use status for lifecycle, buckets for organization
6. **Hide Parents**: Board shows leaf tasks only - manage hierarchies in Grid View
7. **Per-Project Layouts**: Each project can have unique bucket configurations

## Comparison to Grid View

| Feature           | Board View             | Grid View                  |
| ----------------- | ---------------------- | -------------------------- |
| Layout            | Kanban buckets         | Hierarchical table         |
| Tasks Displayed   | Leaf tasks only        | All tasks (with hierarchy) |
| Organization      | Custom buckets         | Parent/child relationships |
| Best For          | Visual workflow        | Detailed editing           |
| Task Movement     | Drag & drop            | Manual field changes       |
| Metadata Display  | Visual badges on cards | Full table columns         |
| Filtering         | Priority + search      | Multi-field filter bar     |
| Bulk Edit         | Via detail panel       | Inline editing             |
| Status Management | Card indicator         | Status column              |
| Bucket Assignment | Drag to bucket         | Bucket column dropdown     |

Use **Board View** for visual task organization and quick bucket reassignment.
Use **Grid View** for hierarchical task management and detailed bulk editing.

## Troubleshooting

**Cards not showing?**

- Check if tasks are leaf tasks (tasks with children only appear in Grid View)
- Verify tasks match current filters (priority, search)
- Ensure correct project is selected in dropdown

**Parent tasks missing?**

- Parent tasks are intentionally hidden in Board View
- Use Grid View to manage hierarchical task structures
- Board displays leaf tasks only for focused workflow

**Drag and drop not working?**

- Ensure you're dragging the card body (not clicking text fields)
- Release mouse over the bucket's active or completed section
- Try dragging bucket headers to reorder instead

**Bucket order not saving?**

- Bucket order is saved per project automatically
- Switching projects loads that project's bucket configuration
- Try closing and reopening the view if changes don't persist

**Completed section issues?**

- Collapsed state saves per bucket per project
- Toggle using the "▼ Completed (X)" header
- If tasks don't move to completed, check task's `completed` field

**Performance issues?**

- Large projects (500+ tasks) may render slowly
- Use filters to reduce visible tasks
- Consider archiving or moving completed tasks to separate project
