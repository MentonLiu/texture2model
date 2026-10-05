import type { GeneratorOptions } from './types';

export const DEFAULT_MAX_VOXELS = 20_000;
export const MIN_MAX_VOXELS = 1_000;
export const MAX_MAX_VOXELS = 100_000;
export const PERFORMANCE_WARNING_VOXELS = 8_000;
export const DEFAULT_PIXEL_BATCH_SIZE = 256;

export const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  processingMode: 'row',
  voxelSize: 1,
  alphaThreshold: 0,
  includeTransparent: false,
  centerModel: true,
  groupName: 'texture_model',
  maxVoxels: DEFAULT_MAX_VOXELS
};

export const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp'
] as const;
