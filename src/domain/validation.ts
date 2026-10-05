import {
  MAX_MAX_VOXELS,
  MIN_MAX_VOXELS,
  PERFORMANCE_WARNING_VOXELS
} from '../constants';
import type { ModelPlannerOptions, PixelImage } from '../types';

export class ModelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelValidationError';
  }
}

export function validatePixelImage(image: PixelImage): void {
  if (!Number.isSafeInteger(image.width) || image.width < 1 ||
      !Number.isSafeInteger(image.height) || image.height < 1) {
    throw new ModelValidationError('Image width and height must be positive integers.');
  }
  const pixelCount = image.width * image.height;
  if (!Number.isSafeInteger(pixelCount * 4) || image.data.length !== pixelCount * 4) {
    throw new ModelValidationError('Image RGBA data length does not match its dimensions.');
  }
}

export function validatePlannerOptions(options: ModelPlannerOptions): void {
  if (options.processingMode !== 'row' && options.processingMode !== 'pixel') {
    throw new ModelValidationError('Processing mode must be row or pixel.');
  }
  if (!Number.isFinite(options.voxelSize) || options.voxelSize <= 0) {
    throw new ModelValidationError('Voxel size must be greater than zero.');
  }
  validateAlphaThreshold(options.alphaThreshold);
  if (typeof options.includeTransparent !== 'boolean' ||
      typeof options.centerModel !== 'boolean') {
    throw new ModelValidationError('Transparency and centering settings must be boolean.');
  }
}

export function validateAlphaThreshold(alphaThreshold: number): void {
  if (!Number.isInteger(alphaThreshold) ||
      alphaThreshold < 0 || alphaThreshold > 255) {
    throw new ModelValidationError('Alpha threshold must be an integer from 0 to 255.');
  }
}

export function validateMaxVoxels(maxVoxels: number): void {
  if (!Number.isInteger(maxVoxels) || maxVoxels < MIN_MAX_VOXELS ||
      maxVoxels > MAX_MAX_VOXELS) {
    throw new ModelValidationError(
      `Maximum Cube count must be between ${MIN_MAX_VOXELS} and ${MAX_MAX_VOXELS}.`
    );
  }
}

export type VoxelLimitStatus = 'ok' | 'warning' | 'exceeded';

export function getVoxelLimitStatus(voxelCount: number, maxVoxels: number): VoxelLimitStatus {
  validateMaxVoxels(maxVoxels);
  if (!Number.isSafeInteger(voxelCount) || voxelCount < 0) {
    throw new ModelValidationError('Cube count must be a nonnegative integer.');
  }
  if (voxelCount > maxVoxels) return 'exceeded';
  if (voxelCount > PERFORMANCE_WARNING_VOXELS) return 'warning';
  return 'ok';
}
