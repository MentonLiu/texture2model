export type ProcessingMode = 'pixel' | 'row' | 'column';
export type ModelOrientation = 'upright' | 'flat';
export type PixelGroup = 'outer' | 'inner';

export interface PixelGrouping {
  enabled: boolean;
  outerScale: Vector3;
  innerScale: Vector3;
}

export interface RgbaPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Pixel data in image order, beginning at the top-left corner. */
export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface DecodedImage extends PixelImage {
  fileName: string;
  dataURL: string;
  mimeType: string;
  imageData: ImageData;
  /** Pixels whose original alpha is greater than zero. */
  visiblePixelCount: number;
}

export interface ModelPlannerOptions {
  processingMode: ProcessingMode;
  /** Omitted by older callers: defaults to upright. */
  orientation?: ModelOrientation;
  grouping?: PixelGrouping;
  voxelSize: number;
  alphaThreshold: number;
  includeTransparent: boolean;
  centerModel: boolean;
}

export interface GeneratorOptions extends ModelPlannerOptions {
  groupName: string;
  maxVoxels: number;
}

export type Vector3 = [number, number, number];

export interface ModelBounds {
  min: Vector3;
  max: Vector3;
  size: Vector3;
}

/** One independent cube in a ModelPlan, with its source image texel. */
export interface VoxelPlan {
  x: number;
  y: number;
  z: number;
  sourceX: number;
  sourceY: number;
  group?: PixelGroup;
  /** Actual dimensions after per-group scaling; omitted for unscaled legacy plans. */
  size?: Vector3;
  rgba: RgbaPixel;
}

/** Pure data: no Blockbench, DOM, or THREE objects. */
export interface ModelPlan {
  width: number;
  height: number;
  voxelSize: number;
  /** Older plans without this field are upright. */
  orientation?: ModelOrientation;
  grouping?: PixelGrouping;
  voxelCount: number;
  bounds: ModelBounds;
  voxels: VoxelPlan[];
}

export interface ImagePixelCounts {
  totalPixels: number;
  visiblePixels: number;
  eligiblePixels: number;
  voxelCount: number;
}

export type UVRect = [number, number, number, number];
