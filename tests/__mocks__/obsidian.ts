// Mock Obsidian API for testing
// This allows tests to run without the full Obsidian environment

export class Plugin {
  app: any;
  manifest: any;
  
  constructor(app: any, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  addRibbonIcon(icon: string, title: string, callback: () => void) {}
  addCommand(command: any) {}
  addSettingTab(tab: any) {}
  registerView(type: string, viewCreator: any) {}
  registerExtensions(extensions: string[], type: string) {}
  
  async loadData() {
    return {};
  }
  
  async saveData(data: any) {}
}

export class ItemView {
  containerEl: HTMLElement;
  app: any;
  leaf: any;

  constructor(leaf: any) {
    this.leaf = leaf;
    this.containerEl = document.createElement('div');
  }

  getViewType(): string {
    return 'mock-view';
  }

  getDisplayText(): string {
    return 'Mock View';
  }

  async onOpen() {}
  async onClose() {}
}

export class PluginSettingTab {
  app: any;
  plugin: any;
  containerEl: HTMLElement;

  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }

  display() {}
  hide() {}
}

export class Setting {
  settingEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
    this.controlEl = document.createElement('div');
    containerEl.appendChild(this.settingEl);
  }

  setName(name: string) {
    return this;
  }

  setDesc(desc: string) {
    return this;
  }

  setHeading() {
    return this;
  }

  addText(cb: (component: any) => void) {
    const component = {
      setValue: jest.fn().mockReturnThis(),
      setPlaceholder: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    };
    cb(component);
    return this;
  }

  addToggle(cb: (component: any) => void) {
    const component = {
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    };
    cb(component);
    return this;
  }

  addDropdown(cb: (component: any) => void) {
    const component = {
      addOption: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    };
    cb(component);
    return this;
  }

  addButton(cb: (component: any) => void) {
    const component = {
      setButtonText: jest.fn().mockReturnThis(),
      setCta: jest.fn().mockReturnThis(),
      onClick: jest.fn().mockReturnThis(),
      setIcon: jest.fn().mockReturnThis(),
      setTooltip: jest.fn().mockReturnThis(),
    };
    cb(component);
    return this;
  }

  addColorPicker(cb: (component: any) => void) {
    const component = {
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    };
    cb(component);
    return this;
  }

  addExtraButton(cb: (component: any) => void) {
    const component = {
      setIcon: jest.fn().mockReturnThis(),
      setTooltip: jest.fn().mockReturnThis(),
      onClick: jest.fn().mockReturnThis(),
    };
    cb(component);
    return this;
  }
}

export class Menu {
  addItem(cb: (item: any) => void) {
    const item = {
      setTitle: jest.fn().mockReturnThis(),
      setIcon: jest.fn().mockReturnThis(),
      onClick: jest.fn().mockReturnThis(),
    };
    cb(item);
    return this;
  }

  showAtMouseEvent(event: MouseEvent) {}
}

export class Notice {
  constructor(message: string, timeout?: number) {}
}

export class TFile {
  path: string;
  name: string;
  
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
  }
}

export class TFolder {
  path: string;
  name: string;
  
  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || '';
  }
}

export class Vault {
  async read(file: TFile): Promise<string> {
    return '';
  }

  async create(path: string, data: string): Promise<TFile> {
    return new TFile(path);
  }

  async modify(file: TFile, data: string): Promise<void> {}

  async delete(file: TFile): Promise<void> {}

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    return null;
  }
}

export class WorkspaceLeaf {
  view: any;

  async setViewState(state: any): Promise<void> {}
}

export class Workspace {
  activeLeaf: WorkspaceLeaf | null = null;

  getLeavesOfType(type: string): WorkspaceLeaf[] {
    return [];
  }

  getLeaf(newLeaf?: boolean | string): WorkspaceLeaf {
    return new WorkspaceLeaf();
  }

  revealLeaf(leaf: WorkspaceLeaf) {}

  trigger(event: string, ...args: any[]) {}
}

export class MarkdownRenderer {
  static async renderMarkdown(
    markdown: string,
    el: HTMLElement,
    sourcePath: string,
    component: any
  ): Promise<void> {
    el.innerHTML = markdown;
  }
}

export function setIcon(el: HTMLElement, icon: string) {
  el.setAttribute('data-icon', icon);
}

export const moment = {
  tz: {
    guess: () => 'UTC'
  }
};
