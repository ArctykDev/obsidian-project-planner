import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type ProjectPlannerPlugin from "../main";
import type { PlannerTask } from "../types";
import { renderPlannerHeader } from "./Header";

export const VIEW_TYPE_DEPENDENCY_GRAPH = "project-planner-dependency-graph";

interface GraphNode {
    id: string;
    task: PlannerTask;
    x: number;
    y: number;
    vx: number;
    vy: number;
}

interface GraphEdge {
    source: string;
    target: string;
    type: string;
}

export class DependencyGraphView extends ItemView {
    private plugin: ProjectPlannerPlugin;
    private canvas: HTMLCanvasElement | null = null;
    private nodes: GraphNode[] = [];
    private edges: GraphEdge[] = [];
    private selectedNode: GraphNode | null = null;
    private dragNode: GraphNode | null = null;
    private animationFrame: number | null = null;
    private unsubscribe: (() => void) | null = null;
    private resizeHandler: (() => void) | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: ProjectPlannerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_DEPENDENCY_GRAPH;
    }

    getDisplayText() {
        return "Dependency Graph";
    }

    getIcon() {
        return "git-fork";
    }

    async onOpen() {
        const container = this.containerEl;
        container.empty();
        container.addClass("planner-graph-wrapper");

        // Render global navigation header (shared)
        renderPlannerHeader(container as HTMLElement, this.plugin, {
            active: "graph",
            onProjectChange: async () => {
                await this.plugin.taskStore.load();
                await this.refresh();
            }
        });

        // Graph-specific controls
        const graphControls = container.createDiv("planner-graph-controls-bar");

        const refreshBtn = graphControls.createEl("button", {
            text: "Refresh",
            cls: "planner-graph-btn"
        });
        refreshBtn.onclick = () => this.refresh();

        const resetBtn = graphControls.createEl("button", {
            text: "Reset Layout",
            cls: "planner-graph-btn"
        });
        resetBtn.onclick = () => this.resetLayout();

        // Canvas container
        const canvasContainer = container.createDiv("planner-graph-canvas-container");
        this.canvas = canvasContainer.createEl("canvas", {
            cls: "planner-graph-canvas"
        });

        // Set canvas size
        this.resizeCanvas();
        this.resizeHandler = () => this.resizeCanvas();
        window.addEventListener("resize", this.resizeHandler);

        // Setup mouse events
        this.setupMouseEvents();

        // Load and render
        await this.plugin.taskStore.ensureLoaded();
        this.unsubscribe = this.plugin.taskStore.subscribe(() => this.refresh());
        await this.refresh();
    }

    async onClose() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        if (this.resizeHandler) {
            window.removeEventListener("resize", this.resizeHandler);
            this.resizeHandler = null;
        }
        this.containerEl.empty();
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    // Old custom header removed in favor of shared helper

    private resizeCanvas() {
        if (!this.canvas) return;
        const container = this.canvas.parentElement;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    }

    private setupMouseEvents() {
        if (!this.canvas) return;

        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        this.canvas.onmousedown = (e) => {
            const rect = this.canvas!.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Find clicked node
            for (const node of this.nodes) {
                const dx = x - node.x;
                const dy = y - node.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 30) {
                    this.dragNode = node;
                    isDragging = true;
                    offsetX = dx;
                    offsetY = dy;
                    this.selectedNode = node;
                    this.render();
                    return;
                }
            }

            this.selectedNode = null;
            this.render();
        };

        this.canvas.onmousemove = (e) => {
            if (isDragging && this.dragNode) {
                const rect = this.canvas!.getBoundingClientRect();
                this.dragNode.x = e.clientX - rect.left - offsetX;
                this.dragNode.y = e.clientY - rect.top - offsetY;
                this.dragNode.vx = 0;
                this.dragNode.vy = 0;
                this.render();
            }
        };

        this.canvas.onmouseup = () => {
            isDragging = false;
            this.dragNode = null;
        };

        // Double click to open task details
        this.canvas.ondblclick = (e) => {
            if (!this.selectedNode) return;

            const detailLeaves = this.app.workspace.getLeavesOfType("project-planner-task-detail");
            if (detailLeaves.length > 0) {
                const detailView: any = detailLeaves[0].view;
                if (detailView.setTask) {
                    detailView.setTask(this.selectedNode.task);
                }
            }
        };
    }

    async refresh() {
        const tasks = this.getAllTasks();
        this.buildGraph(tasks);
        this.startSimulation();
    }

    private getAllTasks(): PlannerTask[] {
        const store = (this.plugin as any).taskStore;
        if (!store) return [];
        return store.getAll();
    }

    private buildGraph(tasks: PlannerTask[]) {
        this.nodes = [];
        this.edges = [];

        // Only include tasks that have dependencies or are dependencies
        const tasksWithDeps = tasks.filter(t => {
            const hasDeps = (t.dependencies || []).length > 0;
            const isDep = tasks.some(other =>
                (other.dependencies || []).some(d => d.predecessorId === t.id)
            );
            return hasDeps || isDep;
        });

        if (tasksWithDeps.length === 0) {
            // Show message if no dependencies
            this.nodes = [];
            this.edges = [];
            this.render();
            return;
        }

        // Create nodes
        const width = this.canvas?.width || 800;
        const height = this.canvas?.height || 600;

        tasksWithDeps.forEach((task, index) => {
            const angle = (index / tasksWithDeps.length) * Math.PI * 2;
            const radius = Math.min(width, height) / 3;

            this.nodes.push({
                id: task.id,
                task,
                x: width / 2 + Math.cos(angle) * radius,
                y: height / 2 + Math.sin(angle) * radius,
                vx: 0,
                vy: 0
            });
        });

        // Create edges
        tasksWithDeps.forEach(task => {
            (task.dependencies || []).forEach(dep => {
                this.edges.push({
                    source: dep.predecessorId,
                    target: task.id,
                    type: dep.type
                });
            });
        });
    }

    private startSimulation() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        let iterations = 0;
        const maxIterations = 300;

        const animate = () => {
            if (iterations < maxIterations) {
                this.applyForces();
                this.render();
                iterations++;
                this.animationFrame = requestAnimationFrame(animate);
            }
        };

        animate();
    }

    private applyForces() {
        const repulsionStrength = 5000;
        const attractionStrength = 0.01;
        const damping = 0.8;

        // Repulsion between all nodes
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const node1 = this.nodes[i];
                const node2 = this.nodes[j];

                const dx = node2.x - node1.x;
                const dy = node2.y - node1.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                const force = repulsionStrength / (distance * distance);
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;

                node1.vx -= fx;
                node1.vy -= fy;
                node2.vx += fx;
                node2.vy += fy;
            }
        }

        // Attraction along edges
        this.edges.forEach(edge => {
            const source = this.nodes.find(n => n.id === edge.source);
            const target = this.nodes.find(n => n.id === edge.target);

            if (source && target) {
                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                const force = distance * attractionStrength;
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;

                source.vx += fx;
                source.vy += fy;
                target.vx -= fx;
                target.vy -= fy;
            }
        });

        // Update positions
        this.nodes.forEach(node => {
            if (node !== this.dragNode) {
                node.x += node.vx;
                node.y += node.vy;
                node.vx *= damping;
                node.vy *= damping;

                // Keep nodes within bounds
                const margin = 50;
                if (this.canvas) {
                    node.x = Math.max(margin, Math.min(this.canvas.width - margin, node.x));
                    node.y = Math.max(margin, Math.min(this.canvas.height - margin, node.y));
                }
            }
        });
    }

    private render() {
        if (!this.canvas) return;

        const ctx = this.canvas.getContext("2d");
        if (!ctx) return;

        // Clear
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Check if empty
        if (this.nodes.length === 0) {
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text-muted");
            ctx.font = "14px var(--font-interface)";
            ctx.textAlign = "center";
            ctx.fillText("No task dependencies to visualize", this.canvas.width / 2, this.canvas.height / 2);
            ctx.fillText("Create dependencies in the Task Details panel", this.canvas.width / 2, this.canvas.height / 2 + 25);
            return;
        }

        // Draw edges
        this.edges.forEach(edge => {
            const source = this.nodes.find(n => n.id === edge.source);
            const target = this.nodes.find(n => n.id === edge.target);

            if (source && target) {
                this.drawEdge(ctx, source, target, edge.type);
            }
        });

        // Draw nodes
        this.nodes.forEach(node => {
            this.drawNode(ctx, node, node === this.selectedNode);
        });
    }

    private drawEdge(ctx: CanvasRenderingContext2D, source: GraphNode, target: GraphNode, type: string) {
        // Edge colors by type
        const colors: Record<string, string> = {
            FS: "#0a84ff", // Finish-to-Start (blue)
            SS: "#2f9e44", // Start-to-Start (green)
            FF: "#ff8c00", // Finish-to-Finish (orange)
            SF: "#d70022"  // Start-to-Finish (red)
        };

        ctx.strokeStyle = colors[type] || "#666";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);

        // Calculate arrow
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const angle = Math.atan2(dy, dx);
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Shorten line to not overlap nodes
        const startX = source.x + Math.cos(angle) * 30;
        const startY = source.y + Math.sin(angle) * 30;
        const endX = target.x - Math.cos(angle) * 30;
        const endY = target.y - Math.sin(angle) * 30;

        // Draw line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Draw arrowhead
        const arrowSize = 10;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
            endX - arrowSize * Math.cos(angle - Math.PI / 6),
            endY - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            endX - arrowSize * Math.cos(angle + Math.PI / 6),
            endY - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = colors[type] || "#666";
        ctx.fill();

        // Draw type label
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--background-primary");
        ctx.fillRect(midX - 15, midY - 8, 30, 16);
        ctx.fillStyle = colors[type] || "#666";
        ctx.font = "10px var(--font-interface)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(type, midX, midY);
    }

    private drawNode(ctx: CanvasRenderingContext2D, node: GraphNode, isSelected: boolean) {
        const task = node.task;

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, 30, 0, Math.PI * 2);

        // Status-based colors
        const statusColors: Record<string, string> = {
            "Not Started": "#6c757d",
            "In Progress": "#0a84ff",
            "Blocked": "#d70022",
            "Completed": "#2f9e44"
        };

        ctx.fillStyle = statusColors[task.status] || "#6c757d";
        ctx.fill();

        if (isSelected) {
            ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--interactive-accent");
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        // Task title
        ctx.fillStyle = "#ffffff";
        ctx.font = "12px var(--font-interface)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const maxWidth = 50;
        const title = task.title.length > 8 ? task.title.substring(0, 8) + "..." : task.title;
        ctx.fillText(title, node.x, node.y);

        // Full title on hover (simplified - just show below node)
        if (isSelected) {
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--background-primary");
            const textWidth = ctx.measureText(task.title).width + 10;
            ctx.fillRect(node.x - textWidth / 2, node.y + 40, textWidth, 20);
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text-normal");
            ctx.fillText(task.title, node.x, node.y + 50);
        }
    }

    private resetLayout() {
        const tasks = this.getAllTasks();
        this.buildGraph(tasks);
        this.startSimulation();
    }
}
