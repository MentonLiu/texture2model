import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GENERATOR_OPTIONS } from '../src/constants';
import { planModel } from '../src/domain/model_planner';
import { writeModel } from '../src/blockbench/model_writer';
import type { DecodedImage, GeneratorOptions } from '../src/types';

type MockCubeData = {
  name: string;
  from: number[];
  to: number[];
  box_uv: boolean;
  autouv: number;
  faces: Partial<Record<CubeFaceDirection, CubeFaceOptions>>;
};

function installHost() {
  const project = { texture_width: 16, texture_height: 8 };
  const format = {
    edit_mode: true,
    image_editor: false,
    box_uv: false,
    optional_box_uv: true,
    single_texture: false,
    per_group_texture: false,
    per_texture_uv_size: false
  };
  const root: MockGroup[] = [];
  let editAspects: UndoAspects | undefined;
  let nextId = 0;
  let failOnCubeInit = 0;

  class MockTexture {
    static all: MockTexture[] = [];
    readonly uuid = `texture_${++nextId}`;
    readonly name: string;
    uv_width = 16;
    uv_height = 16;
    dataURL = '';
    addedWithUndo: boolean | undefined;

    constructor(data: { name: string }) {
      this.name = data.name;
    }

    fromDataURL(dataURL: string): this {
      this.dataURL = dataURL;
      return this;
    }

    add(undo: boolean): this {
      expect(editAspects?.textures?.some((texture) => texture.uuid === this.uuid)).toBe(true);
      this.addedWithUndo = undo;
      MockTexture.all.push(this);
      return this;
    }

    getUVWidth(): number {
      return format.per_texture_uv_size ? this.uv_width : project.texture_width;
    }

    getUVHeight(): number {
      return format.per_texture_uv_size ? this.uv_height : project.texture_height;
    }
  }

  class MockGroup {
    static all: MockGroup[] = [];
    readonly uuid = `group_${++nextId}`;
    readonly name: string;
    readonly children: MockCube[] = [];

    constructor(data: { name: string }) {
      this.name = data.name;
    }

    addTo(parent: 'root'): this {
      expect(parent).toBe('root');
      expect(editAspects?.groups?.some((group) => group.uuid === this.uuid)).toBe(true);
      root.push(this);
      return this;
    }

    init(): this {
      MockGroup.all.push(this);
      return this;
    }
  }

  class MockCube {
    static all: MockCube[] = [];
    readonly uuid = `cube_${++nextId}`;
    readonly data: MockCubeData;
    parent: MockGroup | undefined;

    constructor(data: MockCubeData) {
      this.data = data;
    }

    addTo(group: MockGroup): this {
      expect(editAspects?.elements?.some((element) => element.uuid === this.uuid)).toBe(true);
      this.parent = group;
      group.children.push(this);
      return this;
    }

    init(): this {
      MockCube.all.push(this);
      if (failOnCubeInit && MockCube.all.length === failOnCubeInit) {
        throw new Error('Cube initialization failed');
      }
      return this;
    }
  }

  const undo = {
    initEdit: vi.fn((aspects: UndoAspects) => { editAspects = aspects; }),
    finishEdit: vi.fn((message: string, aspects: UndoAspects) => {
      void message;
      void aspects;
      editAspects = undefined;
    }),
    cancelEdit: vi.fn((revertChanges: boolean) => {
      if (revertChanges) {
        const cubeIds = new Set(editAspects?.elements?.map((cube) => cube.uuid));
        const groupIds = new Set(editAspects?.groups?.map((group) => group.uuid));
        const textureIds = new Set(editAspects?.textures?.map((texture) => texture.uuid));
        MockCube.all = MockCube.all.filter((cube) => !cubeIds.has(cube.uuid));
        for (const group of MockGroup.all) {
          group.children.splice(0, group.children.length,
            ...group.children.filter((cube) => !cubeIds.has(cube.uuid)));
        }
        MockGroup.all = MockGroup.all.filter((group) => !groupIds.has(group.uuid));
        root.splice(0, root.length, ...root.filter((group) => !groupIds.has(group.uuid)));
        MockTexture.all = MockTexture.all.filter((texture) => !textureIds.has(texture.uuid));
      }
      editAspects = undefined;
    })
  };
  const canvas = { updateView: vi.fn() };
  vi.stubGlobal('Project', project);
  vi.stubGlobal('Format', format);
  vi.stubGlobal('Texture', MockTexture);
  vi.stubGlobal('Group', MockGroup);
  vi.stubGlobal('Cube', MockCube);
  vi.stubGlobal('Undo', undo);
  vi.stubGlobal('Canvas', canvas);

  return {
    project, format, root, undo, canvas, MockTexture, MockGroup, MockCube,
    failOnCubeInit(value: number) { failOnCubeInit = value; }
  };
}

function imageFixture(): DecodedImage {
  return {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 0, 0, 0, 0
    ]),
    fileName: 'sprite.png',
    dataURL: 'data:image/png;base64,c3ByaXRl',
    mimeType: 'image/png',
    imageData: {} as ImageData,
    visiblePixelCount: 3
  };
}

const options: GeneratorOptions = {
  ...DEFAULT_GENERATOR_OPTIONS,
  centerModel: false,
  groupName: 'sprite_texture_model'
};

afterEach(() => vi.unstubAllGlobals());

describe('Blockbench model writer', () => {
  it('writes independent cubes and a source texture in one Undo edit', async () => {
    const host = installHost();
    host.MockTexture.all.push(new host.MockTexture({ name: 'sprite.png' }));
    host.MockGroup.all.push(new host.MockGroup({ name: 'sprite_texture_model' }));
    const image = imageFixture();
    const plan = await planModel(image, options, { yieldToUI: async () => {} });

    writeModel(image, plan, options);

    expect(host.undo.initEdit).toHaveBeenCalledTimes(1);
    expect(host.undo.finishEdit).toHaveBeenCalledTimes(1);
    expect(host.undo.cancelEdit).not.toHaveBeenCalled();
    const aspects = host.undo.finishEdit.mock.calls[0]![1];
    expect(aspects).toMatchObject({ outliner: true, selected_texture: true });
    expect(aspects.textures).toHaveLength(1);
    expect(aspects.groups).toHaveLength(1);
    expect(aspects.elements).toHaveLength(3);
    expect(host.canvas.updateView).not.toHaveBeenCalled();

    const texture = host.MockTexture.all[1];
    expect(texture).toMatchObject({ name: 'sprite_2.png', addedWithUndo: false });
    expect(texture?.dataURL).toBe(image.dataURL);
    const group = host.root[0];
    expect(group?.name).toBe('sprite_texture_model_2');
    expect(group?.children).toHaveLength(3);
    expect(host.MockCube.all.every((cube) => cube.parent === group)).toBe(true);

    const expectedUVs = [[0, 0, 8, 4], [8, 0, 16, 4], [0, 4, 8, 8]];
    for (const [index, cube] of host.MockCube.all.entries()) {
      expect(cube.data).toMatchObject({ box_uv: false, autouv: 0 });
      expect(cube.data.to.map((coordinate, axis) => coordinate - cube.data.from[axis]!))
        .toEqual([1, 1, 1]);
      expect(Object.keys(cube.data.faces)).toHaveLength(6);
      for (const face of Object.values(cube.data.faces)) {
        expect(face).toMatchObject({ enabled: true, texture: texture?.uuid });
        expect(face?.uv).toEqual(expectedUVs[index]);
      }
    }
  });

  it('rejects an incompatible project before starting Undo', async () => {
    const host = installHost();
    host.format.single_texture = true;
    const image = imageFixture();
    const plan = await planModel(image, options, { yieldToUI: async () => {} });

    expect(() => writeModel(image, plan, options)).toThrow(/independent texture/);
    expect(host.undo.initEdit).not.toHaveBeenCalled();
    expect(host.MockTexture.all).toHaveLength(0);
  });

  it('rejects a plan above the configured Cube limit before starting Undo', async () => {
    const host = installHost();
    const image: DecodedImage = {
      ...imageFixture(),
      width: 1001,
      height: 1,
      data: new Uint8ClampedArray(Array.from({ length: 1001 }, () => [1, 2, 3, 255]).flat()),
      visiblePixelCount: 1001
    };
    const limitedOptions = { ...options, maxVoxels: 1000 };
    const plan = await planModel(image, limitedOptions, { yieldToUI: async () => {} });

    expect(() => writeModel(image, plan, limitedOptions)).toThrow(/above the limit/);
    expect(host.undo.initEdit).not.toHaveBeenCalled();
    expect(host.MockTexture.all).toHaveLength(0);
  });

  it('rolls back texture, group and partially initialized cubes on failure', async () => {
    const host = installHost();
    host.failOnCubeInit(2);
    const image = imageFixture();
    const plan = await planModel(image, options, { yieldToUI: async () => {} });

    expect(() => writeModel(image, plan, options)).toThrow('Cube initialization failed');
    expect(host.undo.cancelEdit).toHaveBeenCalledExactlyOnceWith(true);
    expect(host.undo.finishEdit).not.toHaveBeenCalled();
    expect(host.MockTexture.all).toHaveLength(0);
    expect(host.MockGroup.all).toHaveLength(0);
    expect(host.MockCube.all).toHaveLength(0);
    expect(host.root).toHaveLength(0);
  });
});
