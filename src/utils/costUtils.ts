import type { PlannerTask } from "../types";
import type { PlannerProject } from "../settings";

/**
 * Cost Tracking Utility Functions
 *
 * Provides derived cost calculations for tasks and projects.
 * Supports two cost modes:
 * - "fixed": user enters costEstimate / costActual directly
 * - "hourly": cost is derived from effort hours × hourly rate
 */

// ---------------------------------------------------------------------------
// Per-task calculations
// ---------------------------------------------------------------------------

/** Resolve the effective hourly rate for a task, falling back to project default. */
export function getEffectiveRate(task: PlannerTask, project?: PlannerProject): number {
  return task.hourlyRate ?? project?.defaultHourlyRate ?? 0;
}

/** Get the estimated cost for a single task (not rolled up). */
export function getTaskEstimatedCost(task: PlannerTask, project?: PlannerProject): number {
  if (task.costType === "hourly") {
    const rate = getEffectiveRate(task, project);
    const totalEffort = (task.effortCompleted ?? 0) + (task.effortRemaining ?? 0);
    return totalEffort * rate;
  }
  return task.costEstimate ?? 0;
}

/** Get the actual cost incurred for a single task (not rolled up). */
export function getTaskActualCost(task: PlannerTask, project?: PlannerProject): number {
  if (task.costType === "hourly") {
    const rate = getEffectiveRate(task, project);
    return (task.effortCompleted ?? 0) * rate;
  }
  return task.costActual ?? 0;
}

/** Get the cost variance (positive = under budget). */
export function getTaskCostVariance(task: PlannerTask, project?: PlannerProject): number {
  return getTaskEstimatedCost(task, project) - getTaskActualCost(task, project);
}

// ---------------------------------------------------------------------------
// Roll-up calculations (for parent tasks)
// ---------------------------------------------------------------------------

/** Sum estimated cost across an array of child tasks. */
export function rollUpEstimatedCost(children: PlannerTask[], project?: PlannerProject): number {
  return children.reduce((sum, child) => sum + getTaskEstimatedCost(child, project), 0);
}

/** Sum actual cost across an array of child tasks. */
export function rollUpActualCost(children: PlannerTask[], project?: PlannerProject): number {
  return children.reduce((sum, child) => sum + getTaskActualCost(child, project), 0);
}

// ---------------------------------------------------------------------------
// Project-level calculations
// ---------------------------------------------------------------------------

export interface ProjectCostSummary {
  budgetTotal: number;
  totalEstimated: number;
  totalActual: number;
  budgetRemaining: number;
  budgetUsedPercent: number;
  overBudgetTasks: PlannerTask[];
}

/**
 * Compute a full cost summary for a project.
 * Only sums leaf tasks (tasks that are not parents) to avoid double-counting.
 */
export function getProjectCostSummary(
  tasks: PlannerTask[],
  project?: PlannerProject
): ProjectCostSummary {
  const budgetTotal = project?.budgetTotal ?? 0;

  // Identify parent IDs to exclude them from summation (avoid double-counting)
  const parentIds = new Set(
    tasks.filter(t => t.parentId).map(t => t.parentId!)
  );
  const leafTasks = tasks.filter(t => !parentIds.has(t.id));

  let totalEstimated = 0;
  let totalActual = 0;
  const overBudgetTasks: PlannerTask[] = [];

  for (const task of leafTasks) {
    const est = getTaskEstimatedCost(task, project);
    const act = getTaskActualCost(task, project);
    totalEstimated += est;
    totalActual += act;
    if (est > 0 && act > est) {
      overBudgetTasks.push(task);
    }
  }

  const budgetRemaining = budgetTotal - totalActual;
  const budgetUsedPercent = budgetTotal > 0
    ? Math.round((totalActual / budgetTotal) * 100)
    : 0;

  return {
    budgetTotal,
    totalEstimated,
    totalActual,
    budgetRemaining,
    budgetUsedPercent,
    overBudgetTasks,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format a number as currency with the project's symbol. */
export function formatCurrency(amount: number, currencySymbol?: string): string {
  const symbol = currencySymbol || "$";
  if (amount < 0) {
    return `-${symbol}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Format variance with +/- prefix. */
export function formatVariance(variance: number, currencySymbol?: string): string {
  const symbol = currencySymbol || "$";
  const abs = Math.abs(variance);
  const formatted = abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  if (variance > 0) return `+${symbol}${formatted}`;
  if (variance < 0) return `-${symbol}${formatted}`;
  return `${symbol}0`;
}

// ---------------------------------------------------------------------------
// Cost breakdown grouping (for reports)
// ---------------------------------------------------------------------------

export interface CostBreakdownRow {
  label: string;
  estimated: number;
  actual: number;
  variance: number;
  taskCount: number;
}

/** Group tasks by a key function and compute cost breakdown per group. */
export function getCostBreakdown(
  tasks: PlannerTask[],
  groupFn: (task: PlannerTask) => string,
  project?: PlannerProject
): CostBreakdownRow[] {
  // Only leaf tasks
  const parentIds = new Set(
    tasks.filter(t => t.parentId).map(t => t.parentId!)
  );
  const leafTasks = tasks.filter(t => !parentIds.has(t.id));

  const groups = new Map<string, PlannerTask[]>();
  for (const task of leafTasks) {
    const key = groupFn(task);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(task);
  }

  const rows: CostBreakdownRow[] = [];
  for (const [label, groupTasks] of groups) {
    const estimated = groupTasks.reduce((s, t) => s + getTaskEstimatedCost(t, project), 0);
    const actual = groupTasks.reduce((s, t) => s + getTaskActualCost(t, project), 0);
    rows.push({
      label,
      estimated,
      actual,
      variance: estimated - actual,
      taskCount: groupTasks.length,
    });
  }

  // Sort by actual cost descending
  rows.sort((a, b) => b.actual - a.actual);
  return rows;
}
