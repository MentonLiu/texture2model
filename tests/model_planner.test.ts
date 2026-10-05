import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATOR_OPTIONS } from '../src/constants';
import { CancellationToken, TaskCancelledError } from '../src/domain/cancellation';
import { countImagePixels, planModel } from '../src/domain/model_planner';
import type { PixelImage } from '../src/types';

const rgbTransparent2x2: PixelImage = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 0, 0, 0, 0
  ])
};

describe('model planner', () => {
  it('makes one cube per visible pixel and skips a fully transparent pixel', async () => {
    const plan = await planModel(rgbTransparent2x2, {
      ...DEFAULT_GENERATOR_OPTIONS,
      centerModel: false
    });
    expect(plan.voxelCount).toBe(3);
    expect(plan.voxels.map(({ sourceX, sourceY }) => [sourceX, sourceY])).toEqual([
      [0, 0], [1, 0], [0, 1]
    ]);
    expect(plan.voxels.map(({ x, y, z }) => [x, y, z])).toEqual([
      [0, 1, 0], [1, 1, 0], [0, 0, 0]
    ]);
    expect(plan.bounds.size).toEqual([2, 2, 1]);
  });

  it('includes transparent pixels without changing their original alpha', async () => {
    const plan = await planModel(rgbTransparent2x2, {
      ...DEFAULT_GENERATOR_OPTIONS,
      includeTransparent: true
    });
    expect(plan.voxelCount).toBe(4);
    expect(plan.voxels[3]?.rgba.a).toBe(0);
  });

  it('keeps width and height distinct for a non-square image', async () => {
    const image: PixelImage = {
      width: 4,
      height: 2,
      data: new Uint8ClampedArray(Array.from({ length: 8 }, () => [1, 2, 3, 255]).flat())
    };
    const plan = await planModel(image, { ...DEFAULT_GENERATOR_OPTIONS, centerModel: false });
    expect([plan.width, plan.height, plan.voxelCount]).toEqual([4, 2, 8]);
    expect(plan.bounds.size).toEqual([4, 2, 1]);
    expect(plan.voxels[0]?.y).toBe(1);
    expect(plan.voxels[4]?.y).toBe(0);
  });

  it('centers the actual occupied cubes without changing their spacing', async () => {
    const image: PixelImage = {
      width: 4,
      height: 2,
      data: new Uint8ClampedArray([
        0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255
      ])
    };
    const plan = await planModel(image, { ...DEFAULT_GENERATOR_OPTIONS, voxelSize: 2 });
    expect(plan.bounds.min).toEqual([-3, -2, -1]);
    expect(plan.bounds.max).toEqual([3, 2, 1]);
    expect(plan.voxels.map((voxel) => voxel.x)).toEqual([-3, 1]);
  });

  it('produces identical plans in row and pixel modes', async () => {
    const row = await planModel(rgbTransparent2x2, {
      ...DEFAULT_GENERATOR_OPTIONS,
      processingMode: 'row'
    });
    const pixel = await planModel(rgbTransparent2x2, {
      ...DEFAULT_GENERATOR_OPTIONS,
      processingMode: 'pixel'
    }, { pixelBatchSize: 1 });
    expect(pixel).toEqual(row);
  });

  it('applies strict alpha greater-than threshold and counts source visibility', async () => {
    const image: PixelImage = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([1, 2, 3, 0, 4, 5, 6, 1])
    };
    expect(countImagePixels(image, 0, false)).toEqual({
      totalPixels: 2,
      visiblePixels: 1,
      eligiblePixels: 1,
      voxelCount: 1
    });
    expect(countImagePixels(image, 1, true).voxelCount).toBe(2);
    const plan = await planModel(image, { ...DEFAULT_GENERATOR_OPTIONS, alphaThreshold: 1 });
    expect(plan.voxelCount).toBe(0);
    expect(plan.bounds.size).toEqual([0, 0, 0]);
  });

  it('invalidates an old asynchronous planning task', async () => {
    const token = new CancellationToken();
    let progress = 0;
    await expect(planModel(rgbTransparent2x2, DEFAULT_GENERATOR_OPTIONS, {
      token,
      onProgress(processed) { progress = processed; },
      async yieldToUI() { token.cancel(); }
    })).rejects.toBeInstanceOf(TaskCancelledError);
    expect(progress).toBe(4);
  });

  it('batches many complete rows and preserves pixel-mode output', async () => {
    const width = 2;
    const height = 4_096;
    const image: PixelImage = {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4)
    };
    for (let index = 3; index < image.data.length; index += 4) image.data[index] = 255;
    let rowYields = 0;
    const rowProgress: number[] = [];
    const row = await planModel(image, DEFAULT_GENERATOR_OPTIONS, {
      onProgress(processed) { rowProgress.push(processed); },
      async yieldToUI() { rowYields += 1; }
    });
    const pixel = await planModel(image, {
      ...DEFAULT_GENERATOR_OPTIONS,
      processingMode: 'pixel'
    }, { async yieldToUI() { /* The scheduling mode must not change the plan. */ } });
    expect(rowYields).toBe(16);
    expect(rowYields).toBeLessThan(height / 100);
    expect(rowProgress.every((processed) => processed % width === 0)).toBe(true);
    expect(rowProgress[rowProgress.length - 1]).toBe(width * height);
    expect(row).toEqual(pixel);
  });
});
