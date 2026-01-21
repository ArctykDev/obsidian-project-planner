// Status definition
export interface PlannerStatus {
  id: string;
  name: string;
  color: string;
}

// Priority definition
export interface PlannerPriority {
  id: string;
  name: string;
  color: string;
}

// Tag/Label definition
export interface PlannerTag {
  id: string;
  name: string;
  color: string;
}

// For backwards compatibility
export type TaskStatus = string;

// Task dependency types (standard project management)
export type DependencyType = "FS" | "SS" | "FF" | "SF";

// Task dependency definition
export interface TaskDependency {
  predecessorId: string;  // ID of the task that must be completed/started first
  type: DependencyType;   // FS = Finish-to-Start, SS = Start-to-Start, FF = Finish-to-Finish, SF = Start-to-Finish
}

// Task link/attachment definition (similar to Microsoft Planner)
export interface TaskLink {
  id: string;
  title: string;
  url: string;
  type: "obsidian" | "external"; // Obsidian internal link or external URL
}

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
  status: string; // status name (not ID)
  priority?: string; // priority name (not ID)
  bucketId?: string; // Board view bucket assignment (independent of status)
  startDate?: string;
  dueDate?: string;
  description?: string;

  // Tags/Labels
  tags?: string[]; // array of tag IDs

  // Task dependencies (project management)
  dependencies?: TaskDependency[];

  // Links/Attachments (Microsoft Planner style)
  links?: TaskLink[];

  // Existing checklist in Task Details (NOT the grid children)
  subtasks?: PlannerSubtask[];

  // Card preview setting (what to show on board card)
  cardPreview?: "none" | "checklist" | "description";
}
