export type TaskStatus =
  | "Not Started"
  | "In Progress"
  | "Blocked"
  | "Completed";

// Checklist item in the Task Details panel
export interface PlannerSubtask {
  id: string;
  title: string;
  completed: boolean;
}

// Main grid task (can be parent or child)
export interface PlannerTask {
  id: string;
  title: string;
  completed: boolean;

  // NEW HIERARCHY FIELDS (for the grid parent/child structure)
  parentId?: string | null;   // undefined/null = top-level task (acts as a parent row)
  collapsed?: boolean;        // true = children hidden in grid

  // Existing fields
  status: TaskStatus;
  priority?: "Low" | "Medium" | "High" | "Critical";
  startDate?: string;
  dueDate?: string;
  description?: string;

  // Existing checklist in Task Details (NOT the grid children)
  subtasks?: PlannerSubtask[];
}
