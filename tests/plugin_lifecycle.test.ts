import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('plugin lifecycle', () => {
  it('registers one top-level menu and cleans every component on unload/reload', async () => {
    let lifecycle: { onload?(): void; onunload?(): void } | undefined;
    const actions: ActionMock[] = [];
    const menus: MenuMock[] = [];
    const dialogs: DialogMock[] = [];
    const styles: Array<{ delete: ReturnType<typeof vi.fn> }> = [];

    class ActionMock {
      deleted = false;
      constructor(readonly id: string, readonly options: { click(): void }) {
        actions.push(this);
      }
      delete(): void { this.deleted = true; }
    }
    class MenuMock {
      deleted = false;
      constructor(
        readonly id: string,
        readonly items: ActionMock[],
        readonly options: { name: string }
      ) {
        menus.push(this);
      }
      delete(): void { this.deleted = true; }
    }
    class DialogMock {
      deleted = false;
      shown = false;
      constructor(readonly options: { title: string }) {
        dialogs.push(this);
      }
      show(): this { this.shown = true; return this; }
      delete(): void { this.deleted = true; }
    }

    const addMenu = vi.fn();
    vi.stubGlobal('BBPlugin', {
      register(id: string, options: typeof lifecycle) {
        expect(id).toBe('texture_model');
        lifecycle = options;
      }
    });
    vi.stubGlobal('Action', ActionMock);
    vi.stubGlobal('BarMenu', MenuMock);
    vi.stubGlobal('Dialog', DialogMock);
    vi.stubGlobal('document', { createElement: () => ({ innerHTML: '' }) });
    vi.stubGlobal('MenuBar', { addMenu });
    vi.stubGlobal('Blockbench', {
      addCSS() {
        const style = { delete: vi.fn() };
        styles.push(style);
        return style;
      },
      showMessageBox: vi.fn()
    });

    await import('../src/index');
    expect(lifecycle).toBeDefined();
    lifecycle?.onload?.();
    expect(menus[0]?.options.name).toBe('纹理模型');
    expect(menus[0]?.items).toHaveLength(2);
    expect(addMenu).toHaveBeenCalledWith(menus[0], 'tools');
    actions.find((action) => action.id === 'texture_model_open_generator')?.options.click();
    expect(dialogs[0]?.shown).toBe(true);

    lifecycle?.onunload?.();
    expect(actions.slice(0, 2).every((action) => action.deleted)).toBe(true);
    expect(menus[0]?.deleted).toBe(true);
    expect(dialogs[0]?.deleted).toBe(true);
    expect(styles[0]?.delete).toHaveBeenCalledTimes(1);

    lifecycle?.onload?.();
    expect(menus).toHaveLength(2);
    expect(menus[1]?.deleted).toBe(false);
    expect(actions.filter((action) => !action.deleted)).toHaveLength(2);
    lifecycle?.onunload?.();
    expect(actions.every((action) => action.deleted)).toBe(true);
    expect(menus.every((menu) => menu.deleted)).toBe(true);
    expect(styles.every((style) => style.delete.mock.calls.length === 1)).toBe(true);
  });
});
