# Board View (Kanban)

## Overview

The Board View provides a Microsoft Planner-style Kanban board for visualizing and managing tasks across different stages. It offers an intuitive drag-and-drop interface with cards organized in columns (buckets) based on task status.

## Features

### **Visual Kanban Layout**

- Column-based organization (buckets)
- Task cards with rich metadata
- Drag and drop between columns
- Real-time task count per column

### **Task Cards Display**

Each card shows:

- **Title** - Task name
- **Priority Indicators** - 🔥 Critical / ⚡ High priority badges
- **Tags** - Colored labels for categorization
- **Due Date** - With overdue (red) and today (blue) highlighting
- **Subtask Progress** - Checklist completion (✓ 2/5)
- **Dependencies** - 🔗 indicator for linked tasks
- **Attachments** - 📎 indicator for links/files

### **Smart Columns**

- Automatically created from custom statuses in settings
- Default columns: To Do, In Progress, Done
- Each column shows task count
- "+ Add task" button at bottom of each column

### **Drag and Drop**

- Drag cards between columns to change status
- Visual feedback during drag (opacity, hover states)
- Column highlights when dragging over
- Automatic status update on drop

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

1. Click "Add Task" in header for new task with default status
2. Or click "+ Add task" at bottom of specific column

**Move Task:**

1. Click and drag a task card
2. Hover over target column
3. Release to drop and update status

**Edit Task:**

- Click any card to open Task Details panel
- Edit all task properties in the detail view

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

## Column Configuration

Columns are automatically generated from your Status settings:

1. Go to Settings → Project Planner → Statuses
2. Add, edit, or delete statuses
3. Each status becomes a column in Board View
4. Column order matches status order in settings

## Customization Tips

### **Organize by Status**

Use meaningful status names that reflect your workflow:

- "Backlog", "To Do", "In Progress", "Review", "Done"
- "Not Started", "Active", "Blocked", "Completed"

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

- Clicking any card opens the Task Details panel
- Edit all properties without leaving the board
- Changes sync instantly to the card

### **Grid View**

- Same tasks appear in both views
- Switch between grid and board seamlessly
- Global header provides consistent navigation

### **Project Hub**

- Click "📋 Hub" to view project documentation
- Hub includes links back to tasks
- Use URI links to jump to specific tasks

## Performance

The board is optimized for smooth performance:

- Renders only visible cards
- Efficient drag and drop with HTML5 API
- Minimal re-renders on updates
- Handles hundreds of tasks smoothly

## Tips & Best Practices

1. **Keep Columns Focused**: Limit to 3-7 columns for best workflow
2. **Use Visual Indicators**: Leverage priorities, tags, and dates for quick scanning
3. **Regular Grooming**: Move completed tasks to "Done" column regularly
4. **Combine with Hub**: Use board for active work, hub for overview
5. **Drag Efficiently**: You can quickly triage tasks by dragging through columns

## Comparison to Grid View

| Feature       | Board View       | Grid View            |
| ------------- | ---------------- | -------------------- |
| Layout        | Kanban columns   | Sortable table       |
| Best For      | Visual workflow  | Detailed editing     |
| Task Movement | Drag & drop      | Manual status change |
| Metadata      | Visual badges    | Full table columns   |
| Filtering     | By column        | Filter bar           |
| Bulk Edit     | Via detail panel | Inline editing       |

Use **Board View** for visual task flow and quick status updates.
Use **Grid View** for detailed task management and bulk operations.

## Troubleshooting

**Cards not showing?**

- Check if tasks have matching status names
- Verify project is selected in dropdown

**Drag and drop not working?**

- Ensure you're dragging the card (not clicking text)
- Release mouse over the column content area

**Column order wrong?**

- Edit status order in Settings → Statuses
- Reopen board view to refresh

**Performance issues?**

- Large projects (500+ tasks) may be slower
- Consider archiving completed tasks
- Filter by project to reduce visible tasks
