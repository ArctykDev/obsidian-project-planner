import { TaskStore } from '../../src/stores/taskStore';
import type { PlannerTask } from '../../src/types';

// Mock plugin
const createMockPlugin = () => ({
  settings: {
    activeProjectId: 'test-project',
    projects: [{ id: 'test-project', name: 'Test Project' }]
  },
  loadData: jest.fn().mockResolvedValue({}),
  saveData: jest.fn().mockResolvedValue(undefined),
});

describe('TaskStore', () => {
  let taskStore: TaskStore;
  let mockPlugin: any;

  beforeEach(() => {
    mockPlugin = createMockPlugin();
    taskStore = new TaskStore(mockPlugin);
  });

  describe('addTask', () => {
    it('should add a new task', async () => {
      await taskStore.load();
      
      const task = await taskStore.addTask('New Task');
      
      expect(task).toMatchObject({
        title: 'New Task',
        status: 'Not Started',
        priority: 'Medium',
      });
      expect(task.id).toBeDefined();
      expect(task.createdDate).toBeDefined();
    });

    it('should add task to the store', async () => {
      await taskStore.load();
      
      await taskStore.addTask('Task 1');
      const tasks = taskStore.getAll();
      
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Task 1');
    });
  });

  describe('updateTask', () => {
    it('should update an existing task', async () => {
      await taskStore.load();
      const task = await taskStore.addTask('Original Title');
      
      await taskStore.updateTask(task.id, { title: 'Updated Title' });
      
      const updated = taskStore.getAll()[0];
      expect(updated.title).toBe('Updated Title');
      expect(updated.lastModifiedDate).toBeDefined();
    });

    it('should auto-complete when status set to Completed', async () => {
      await taskStore.load();
      const task = await taskStore.addTask('Test Task');
      
      await taskStore.updateTask(task.id, { status: 'Completed' });
      
      const updated = taskStore.getAll()[0];
      expect(updated.completed).toBe(true);
    });
  });

  describe('deleteTask', () => {
    it('should remove a task', async () => {
      await taskStore.load();
      const task = await taskStore.addTask('To Delete');
      
      await taskStore.deleteTask(task.id);
      
      expect(taskStore.getAll()).toHaveLength(0);
    });
  });

  describe('toggleCollapsed', () => {
    it('should toggle collapsed state', async () => {
      await taskStore.load();
      const task = await taskStore.addTask('Parent Task');
      
      await taskStore.toggleCollapsed(task.id);
      expect(taskStore.getAll()[0].collapsed).toBe(true);
      
      await taskStore.toggleCollapsed(task.id);
      expect(taskStore.getAll()[0].collapsed).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('should notify subscribers on changes', async () => {
      await taskStore.load();
      const listener = jest.fn();
      
      taskStore.subscribe(listener);
      await taskStore.addTask('New Task');
      
      expect(listener).toHaveBeenCalled();
    });

    it('should allow unsubscribing', async () => {
      await taskStore.load();
      const listener = jest.fn();
      
      const unsubscribe = taskStore.subscribe(listener);
      unsubscribe();
      
      await taskStore.addTask('New Task');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('setOrder', () => {
    it('should reorder tasks', async () => {
      await taskStore.load();
      const task1 = await taskStore.addTask('Task 1');
      const task2 = await taskStore.addTask('Task 2');
      const task3 = await taskStore.addTask('Task 3');
      
      await taskStore.setOrder([task3.id, task1.id, task2.id]);
      
      const tasks = taskStore.getAll();
      expect(tasks[0].id).toBe(task3.id);
      expect(tasks[1].id).toBe(task1.id);
      expect(tasks[2].id).toBe(task2.id);
    });

    it('should filter out invalid IDs during reorder', async () => {
      await taskStore.load();
      const task1 = await taskStore.addTask('Task 1');
      const task2 = await taskStore.addTask('Task 2');
      
      await taskStore.setOrder([task2.id, 'invalid-id', task1.id]);
      
      const tasks = taskStore.getAll();
      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe(task2.id);
      expect(tasks[1].id).toBe(task1.id);
    });
  });

  describe('getTaskById', () => {
    it('should return task by ID', async () => {
      await taskStore.load();
      const task = await taskStore.addTask('Find Me');
      
      const found = taskStore.getTaskById(task.id);
      
      expect(found).toBeDefined();
      expect(found?.title).toBe('Find Me');
    });

    it('should return undefined for non-existent ID', async () => {
      await taskStore.load();
      
      const found = taskStore.getTaskById('non-existent');
      
      expect(found).toBeUndefined();
    });
  });

  describe('getTasks', () => {
    it('should return all tasks', async () => {
      await taskStore.load();
      await taskStore.addTask('Task 1');
      await taskStore.addTask('Task 2');
      
      const tasks = taskStore.getTasks();
      
      expect(tasks).toHaveLength(2);
    });
  });

  describe('getAllForProject', () => {
    it('should return tasks for specific project', async () => {
      await taskStore.load();
      await taskStore.addTask('Task 1');
      await taskStore.addTask('Task 2');
      
      const tasks = taskStore.getAllForProject('test-project');
      
      expect(tasks).toHaveLength(2);
    });

    it('should return empty array for non-existent project', async () => {
      await taskStore.load();
      
      const tasks = taskStore.getAllForProject('non-existent');
      
      expect(tasks).toEqual([]);
    });
  });

  describe('makeSubtask', () => {
    it('should make task a subtask of another', async () => {
      await taskStore.load();
      const parent = await taskStore.addTask('Parent');
      const child = await taskStore.addTask('Child');
      
      await taskStore.makeSubtask(child.id, parent.id);
      
      const updated = taskStore.getTaskById(child.id);
      expect(updated?.parentId).toBe(parent.id);
    });

    it('should do nothing for non-existent task', async () => {
      await taskStore.load();
      const parent = await taskStore.addTask('Parent');
      
      await taskStore.makeSubtask('non-existent', parent.id);
      
      // Should not throw error
      expect(taskStore.getAll()).toHaveLength(1);
    });
  });

  describe('promoteSubtask', () => {
    it('should promote subtask to top-level', async () => {
      await taskStore.load();
      const parent = await taskStore.addTask('Parent');
      const child = await taskStore.addTask('Child');
      await taskStore.makeSubtask(child.id, parent.id);
      
      await taskStore.promoteSubtask(child.id);
      
      const updated = taskStore.getTaskById(child.id);
      expect(updated?.parentId).toBeNull();
    });

    it('should do nothing for non-existent task', async () => {
      await taskStore.load();
      
      await taskStore.promoteSubtask('non-existent');
      
      // Should not throw error
      expect(taskStore.getAll()).toHaveLength(0);
    });
  });

  describe('deleteTask', () => {
    it('should promote children when parent is deleted', async () => {
      await taskStore.load();
      const parent = await taskStore.addTask('Parent');
      const child1 = await taskStore.addTask('Child 1');
      const child2 = await taskStore.addTask('Child 2');
      await taskStore.makeSubtask(child1.id, parent.id);
      await taskStore.makeSubtask(child2.id, parent.id);
      
      await taskStore.deleteTask(parent.id);
      
      const tasks = taskStore.getAll();
      expect(tasks).toHaveLength(2);
      expect(tasks.find(t => t.id === child1.id)?.parentId).toBeNull();
      expect(tasks.find(t => t.id === child2.id)?.parentId).toBeNull();
    });
  });

  describe('addTaskFromObject', () => {
    it('should add task from object', async () => {
      await taskStore.load();
      const task: PlannerTask = {
        id: 'custom-id',
        title: 'Custom Task',
        status: 'In Progress',
        priority: 'High',
        completed: false,
        createdDate: '2024-01-01',
        lastModifiedDate: '2024-01-02',
      };
      
      await taskStore.addTaskFromObject(task);
      
      const tasks = taskStore.getAll();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('custom-id');
      expect(tasks[0].title).toBe('Custom Task');
    });

    it('should update existing task instead of adding duplicate', async () => {
      await taskStore.load();
      const task = await taskStore.addTask('Original');
      
      await taskStore.addTaskFromObject({
        id: task.id,
        title: 'Updated via Object',
        status: 'Completed',
        completed: true,
      } as PlannerTask);
      
      const tasks = taskStore.getAll();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Updated via Object');
    });

    it('should set createdDate if not provided', async () => {
      await taskStore.load();
      const task: PlannerTask = {
        id: 'test-id',
        title: 'Test',
        status: 'Not Started',
        completed: false,
      };
      
      await taskStore.addTaskFromObject(task);
      
      const added = taskStore.getTaskById('test-id');
      expect(added?.createdDate).toBeDefined();
      expect(added?.lastModifiedDate).toBeDefined();
    });
  });

  describe('addTaskToProject', () => {
    it('should add task to specific project', async () => {
      mockPlugin.settings.projects.push({ id: 'project-2', name: 'Project 2' });
      await taskStore.load();
      
      const task: PlannerTask = {
        id: 'task-p2',
        title: 'Task for Project 2',
        status: 'Not Started',
        completed: false,
      };
      
      await taskStore.addTaskToProject(task, 'project-2');
      
      const tasks = taskStore.getAllForProject('project-2');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Task for Project 2');
    });

    it('should create project bucket if it does not exist', async () => {
      await taskStore.load();
      
      const task: PlannerTask = {
        id: 'task-new',
        title: 'Task for New Project',
        status: 'Not Started',
        completed: false,
      };
      
      await taskStore.addTaskToProject(task, 'new-project');
      
      const tasks = taskStore.getAllForProject('new-project');
      expect(tasks).toHaveLength(1);
    });

    it('should update existing task in project instead of duplicate', async () => {
      mockPlugin.settings.projects.push({ id: 'project-2', name: 'Project 2' });
      await taskStore.load();
      
      const task: PlannerTask = {
        id: 'task-p2',
        title: 'Original',
        status: 'Not Started',
        completed: false,
      };
      
      await taskStore.addTaskToProject(task, 'project-2');
      
      task.title = 'Updated';
      await taskStore.addTaskToProject(task, 'project-2');
      
      const tasks = taskStore.getAllForProject('project-2');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Updated');
    });

    it('should refresh active tasks if adding to active project', async () => {
      await taskStore.load();
      
      const task: PlannerTask = {
        id: 'task-active',
        title: 'Active Project Task',
        status: 'Not Started',
        completed: false,
      };
      
      await taskStore.addTaskToProject(task, 'test-project');
      
      const activeTasks = taskStore.getAll();
      expect(activeTasks).toHaveLength(1);
      expect(activeTasks[0].id).toBe('task-active');
    });
  });

  describe('isLoaded', () => {
    it('should return false before loading', () => {
      expect(taskStore.isLoaded()).toBe(false);
    });

    it('should return true after loading', async () => {
      await taskStore.load();
      expect(taskStore.isLoaded()).toBe(true);
    });
  });

  describe('ensureLoaded', () => {
    it('should load if not already loaded', async () => {
      expect(taskStore.isLoaded()).toBe(false);
      
      await taskStore.ensureLoaded();
      
      expect(taskStore.isLoaded()).toBe(true);
    });

    it('should not reload if already loaded', async () => {
      const loadSpy = jest.spyOn(mockPlugin, 'loadData');
      await taskStore.load();
      loadSpy.mockClear(); // Clear the initial load call
      
      await taskStore.ensureLoaded();
      
      expect(loadSpy).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should trigger subscribers without changes', async () => {
      await taskStore.load();
      const listener = jest.fn();
      taskStore.subscribe(listener);
      
      taskStore.refresh();
      
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('multi-project support', () => {
    it('should handle multiple projects independently', async () => {
      mockPlugin.settings.projects = [
        { id: 'project-1', name: 'Project 1' },
        { id: 'project-2', name: 'Project 2' }
      ];
      mockPlugin.settings.activeProjectId = 'project-1';
      
      await taskStore.load();
      await taskStore.addTask('Task in Project 1');
      
      const task2: PlannerTask = {
        id: 'task-p2',
        title: 'Task in Project 2',
        status: 'Not Started',
        completed: false,
      };
      await taskStore.addTaskToProject(task2, 'project-2');
      
      expect(taskStore.getAllForProject('project-1')).toHaveLength(1);
      expect(taskStore.getAllForProject('project-2')).toHaveLength(1);
    });
  });

  describe('legacy migration', () => {
    it('should migrate legacy single-project data', async () => {
      const legacyData = {
        tasks: [
          { id: '1', title: 'Legacy Task 1', status: 'Not Started', completed: false },
          { id: '2', title: 'Legacy Task 2', status: 'Completed', completed: true }
        ]
      };
      
      mockPlugin.loadData.mockResolvedValueOnce(legacyData);
      
      await taskStore.load();
      
      const tasks = taskStore.getAll();
      expect(tasks).toHaveLength(2);
      expect(tasks[0].title).toBe('Legacy Task 1');
      
      // Should have saved migrated data
      expect(mockPlugin.saveData).toHaveBeenCalled();
      const savedData = mockPlugin.saveData.mock.calls[0][0];
      expect(savedData.tasksByProject).toBeDefined();
      expect(savedData.tasksByProject['test-project']).toHaveLength(2);
    });

    it('should handle empty legacy data', async () => {
      mockPlugin.loadData.mockResolvedValueOnce({ tasks: [] });
      
      await taskStore.load();
      
      expect(taskStore.getAll()).toHaveLength(0);
    });
  });

  describe('updateTask edge cases', () => {
    it('should not update non-existent task', async () => {
      await taskStore.load();
      
      await taskStore.updateTask('non-existent', { title: 'Updated' });
      
      expect(taskStore.getAll()).toHaveLength(0);
    });

    it('should sync completed status when completed flag changes', async () => {
      await taskStore.load();
      const task = await taskStore.addTask('Test');
      
      await taskStore.updateTask(task.id, { completed: true });
      
      const updated = taskStore.getAll()[0];
      expect(updated.status).toBe('Completed');
      expect(updated.completed).toBe(true);
    });
  });
});
