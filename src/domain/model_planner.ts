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

// Batch short rows/columns to avoid a browser timer for each tiny line.
const LINE_BATCH_MAX_LINES = 256;
const LINE_BATCH_MAX_PIXELS = 2_048;

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
 * Pixel and row modes traverse rows; column mode traverses columns. All modes
 * use the same source coordinates, geometry, and UV mapping.
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
    throw new ModelValidationError(
      'Pixel batch size must be a positive integer.', 'error.pixel_batch'
    );
  }
  task.token?.throwIfCancelled();

  const totalPixels = image.width * image.height;
  const voxels: VoxelPlan[] = [];
  const yieldToUI = task.yieldToUI ?? nextUIFrame;
  let processedPixels = 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const orientation = options.orientation ?? 'upright';
  const flat = orientation === 'flat';
  let linesSinceYield = 0;
  let pixelsAtLastLineYield = 0;
  const byColumn = options.processingMode === 'column';
  const lineCount = byColumn ? image.width : image.height;
  const lineLength = byColumn ? image.height : image.width;

  for (let line = 0; line < lineCount; line += 1) {
    task.token?.throwIfCancelled();
    for (let pixel = 0; pixel < lineLength; pixel += 1) {
      const sourceX = byColumn ? line : pixel;
      const sourceY = byColumn ? pixel : line;
      const offset = (sourceY * image.width + sourceX) * 4;
      const alpha = image.data[offset + 3] ?? 0;
      if (options.includeTransparent || alpha > options.alphaThreshold) {
        const x = sourceX * options.voxelSize;
        const y = flat ? 0 : (image.height - 1 - sourceY) * options.voxelSize;
        const z = flat ? sourceY * options.voxelSize : 0;
        voxels.push({
          x,
          y,
          z,
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
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x + options.voxelSize);
        maxY = Math.max(maxY, y + options.voxelSize);
        maxZ = Math.max(maxZ, z + options.voxelSize);
      }
      processedPixels += 1;
      if (options.processingMode === 'pixel' && processedPixels % batchSize === 0) {
        task.onProgress?.(processedPixels, totalPixels);
        await yieldToUI();
        task.token?.throwIfCancelled();
      }
    }
    if (options.processingMode !== 'pixel') {
      linesSinceYield += 1;
      if (linesSinceYield >= LINE_BATCH_MAX_LINES ||
          processedPixels - pixelsAtLastLineYield >= LINE_BATCH_MAX_PIXELS ||
          line === lineCount - 1) {
        task.onProgress?.(processedPixels, totalPixels);
        await yieldToUI();
        task.token?.throwIfCancelled();
        linesSinceYield = 0;
        pixelsAtLastLineYield = processedPixels;
      }
    }
  }

  if (options.processingMode === 'pixel' && processedPixels % batchSize !== 0) {
    task.onProgress?.(processedPixels, totalPixels);
  }
  task.token?.throwIfCancelled();

  const bounds: ModelBounds = voxels.length === 0
    ? { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] }
    : {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
      size: [maxX - minX, maxY - minY, maxZ - minZ]
    };

  if (options.centerModel && voxels.length > 0) {
    const offsetX = -(minX + maxX) / 2;
    const offsetY = -(minY + maxY) / 2;
    const offsetZ = -(minZ + maxZ) / 2;
    for (const voxel of voxels) {
      voxel.x += offsetX;
      voxel.y += offsetY;
      voxel.z += offsetZ;
    }
    bounds.min = [minX + offsetX, minY + offsetY, minZ + offsetZ];
    bounds.max = [maxX + offsetX, maxY + offsetY, maxZ + offsetZ];
  }

  return {
    width: image.width,
    height: image.height,
    voxelSize: options.voxelSize,
    orientation,
    voxelCount: voxels.length,
    bounds,
    voxels
  };
}
