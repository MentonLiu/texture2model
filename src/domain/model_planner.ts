import { DEFAULT_PIXEL_BATCH_SIZE } from '../constants';
import type {
  ImagePixelCounts,
  ModelBounds,
  ModelPlan,
  ModelPlannerOptions,
  PixelImage,
  VoxelPlan
} from '../types';
import { CancellationToken } from './cancellation';
import {
  ModelValidationError,
  validateAlphaThreshold,
  validatePixelImage,
  validatePlannerOptions
} from './validation';

export interface PlanTaskOptions {
  token?: CancellationToken;
  onProgress?: (processedPixels: number, totalPixels: number) => void;
  yieldToUI?: () => Promise<void>;
  pixelBatchSize?: number;
}

function nextUIFrame(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

/** Fast count for the dialog, without allocating a ModelPlan. */
export function countImagePixels(
  image: PixelImage,
  alphaThreshold: number,
  includeTransparent: boolean
): ImagePixelCounts {
  validatePixelImage(image);
  validateAlphaThreshold(alphaThreshold);
  const totalPixels = image.width * image.height;
  let visiblePixels = 0;
  let eligiblePixels = 0;
  for (let index = 3; index < image.data.length; index += 4) {
    const alpha = image.data[index] ?? 0;
    if (alpha > 0) visiblePixels += 1;
    if (alpha > alphaThreshold) eligiblePixels += 1;
  }
  return {
    totalPixels,
    visiblePixels,
    eligiblePixels,
    voxelCount: includeTransparent ? totalPixels : eligiblePixels
  };
}

/**
 * Produces independent voxels in row-major source-image order. Both processing
 * modes run the same pixel mapping; only their UI yield points differ.
 */
export async function planModel(
  image: PixelImage,
  options: ModelPlannerOptions,
  task: PlanTaskOptions = {}
): Promise<ModelPlan> {
  validatePixelImage(image);
  validatePlannerOptions(options);
  const batchSize = task.pixelBatchSize ?? DEFAULT_PIXEL_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new ModelValidationError('Pixel batch size must be a positive integer.');
  }
  task.token?.throwIfCancelled();

  const totalPixels = image.width * image.height;
  const voxels: VoxelPlan[] = [];
  const yieldToUI = task.yieldToUI ?? nextUIFrame;
  let processedPixels = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let sourceY = 0; sourceY < image.height; sourceY += 1) {
    for (let sourceX = 0; sourceX < image.width; sourceX += 1) {
      const offset = (sourceY * image.width + sourceX) * 4;
      const alpha = image.data[offset + 3] ?? 0;
      if (options.includeTransparent || alpha > options.alphaThreshold) {
        const x = sourceX * options.voxelSize;
        const y = (image.height - 1 - sourceY) * options.voxelSize;
        voxels.push({
          x,
          y,
          z: 0,
          sourceX,
          sourceY,
          rgba: {
            r: image.data[offset] ?? 0,
            g: image.data[offset + 1] ?? 0,
            b: image.data[offset + 2] ?? 0,
            a: alpha
          }
        });
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + options.voxelSize);
        maxY = Math.max(maxY, y + options.voxelSize);
      }
      processedPixels += 1;
      if (options.processingMode === 'pixel' && processedPixels % batchSize === 0) {
        task.onProgress?.(processedPixels, totalPixels);
        await yieldToUI();
        task.token?.throwIfCancelled();
      }
    }
    if (options.processingMode === 'row') {
      task.onProgress?.(processedPixels, totalPixels);
      await yieldToUI();
      task.token?.throwIfCancelled();
    }
  }

  if (options.processingMode === 'pixel' && processedPixels % batchSize !== 0) {
    task.onProgress?.(processedPixels, totalPixels);
  }
  task.token?.throwIfCancelled();

  const bounds: ModelBounds = voxels.length === 0
    ? { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] }
    : {
      min: [minX, minY, 0],
      max: [maxX, maxY, options.voxelSize],
      size: [maxX - minX, maxY - minY, options.voxelSize]
    };

  if (options.centerModel && voxels.length > 0) {
    const offsetX = -(minX + maxX) / 2;
    const offsetY = -(minY + maxY) / 2;
    const offsetZ = -options.voxelSize / 2;
    for (const voxel of voxels) {
      voxel.x += offsetX;
      voxel.y += offsetY;
      voxel.z += offsetZ;
    }
    bounds.min = [minX + offsetX, minY + offsetY, offsetZ];
    bounds.max = [maxX + offsetX, maxY + offsetY, options.voxelSize + offsetZ];
  }

  return {
    width: image.width,
    height: image.height,
    voxelSize: options.voxelSize,
    voxelCount: voxels.length,
    bounds,
    voxels
  };
}
