import type { ModelBounds, ModelPlannerOptions, PixelGroup, PixelGrouping, PixelImage, Vector3, VoxelPlan } from '../types';
import { ModelValidationError } from './validation';

const BATCH_SIZE = 2_048;
const ELIGIBLE = 1;
const EXTERIOR = 2;
const OUTER_RING = 3;

export function resolveGrouping(options: { grouping?: PixelGrouping }): PixelGrouping {
  if (!options.grouping?.enabled) {
    return { enabled: false, outerScale: [1, 1, 1], innerScale: [1, 1, 1] };
  }
  return {
    enabled: true,
    outerScale: [...options.grouping.outerScale],
    innerScale: [...options.grouping.innerScale]
  };
}

/** Alpha-threshold silhouette, independent of transparent-voxel inclusion.
 * Four-connected exterior flood fill; enclosed transparent holes are not exterior. */
export function* outerRingSteps(
  image: PixelImage,
  options: ModelPlannerOptions
): Generator<void, Uint8Array> {
  const count = image.width * image.height;
  const mask = new Uint8Array(count);
  const queue = new Uint32Array(count);
  let tail = 0;
  for (let index = 0; index < count; index += 1) {
    const x = index % image.width;
    const y = Math.floor(index / image.width);
    const eligible = (image.data[index * 4 + 3] ?? 0) > options.alphaThreshold;
    const edge = x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1;
    if (eligible) mask[index] = edge ? OUTER_RING : ELIGIBLE;
    else if (edge) {
      mask[index] = EXTERIOR;
      queue[tail++] = index;
    }
    if ((index + 1) % BATCH_SIZE === 0) yield;
  }
  const visit = (index: number): void => {
    if (mask[index] === 0) {
      mask[index] = EXTERIOR;
      queue[tail++] = index;
    } else if (mask[index] === ELIGIBLE) mask[index] = OUTER_RING;
  };
  for (let head = 0; head < tail; head += 1) {
    const index = queue[head] ?? 0;
    const x = index % image.width;
    if (x > 0) visit(index - 1);
    if (x < image.width - 1) visit(index + 1);
    if (index >= image.width) visit(index - image.width);
    if (index < count - image.width) visit(index + image.width);
    if ((head + 1) % BATCH_SIZE === 0) yield;
  }
  return mask;
}

/** Synchronous counterpart for the writer's preflight, before opening Undo. */
export function outerRingMask(image: PixelImage, options: ModelPlannerOptions): Uint8Array {
  const steps = outerRingSteps(image, options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export function pixelGroup(mask: Uint8Array, index: number): PixelGroup {
  return mask[index] === OUTER_RING ? 'outer' : 'inner';
}

export function groupScale(grouping: PixelGrouping, group: PixelGroup): Vector3 {
  return group === 'outer' ? grouping.outerScale : grouping.innerScale;
}

export function voxelDimensions(voxel: VoxelPlan, size: number): Vector3 {
  return voxel.size ?? [size, size, size];
}

export function voxelBounds(voxels: VoxelPlan[], size: number): ModelBounds {
  if (voxels.length === 0) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  const min: Vector3 = [Infinity, Infinity, Infinity];
  const max: Vector3 = [-Infinity, -Infinity, -Infinity];
  for (const voxel of voxels) {
    const dimensions = voxelDimensions(voxel, size);
    const position = [voxel.x, voxel.y, voxel.z];
    for (const axis of [0, 1, 2] as const) {
      min[axis] = Math.min(min[axis], position[axis] ?? 0);
      max[axis] = Math.max(max[axis], (position[axis] ?? 0) + dimensions[axis]);
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/** Scale each subgroup about its own occupied center after whole-model centering. */
export function scalePixelGroups(voxels: VoxelPlan[], size: number, grouping: PixelGrouping): ModelBounds {
  if (grouping.enabled) {
    for (const group of ['outer', 'inner'] as const) {
      const members = voxels.filter((voxel) => voxel.group === group);
      const bounds = voxelBounds(members, size);
      const scale = groupScale(grouping, group);
      const center = bounds.min.map((value, axis) => (value + (bounds.max[axis] ?? 0)) / 2);
      for (const voxel of members) {
        voxel.x = (center[0] ?? 0) + (voxel.x - (center[0] ?? 0)) * scale[0];
        voxel.y = (center[1] ?? 0) + (voxel.y - (center[1] ?? 0)) * scale[1];
        voxel.z = (center[2] ?? 0) + (voxel.z - (center[2] ?? 0)) * scale[2];
        voxel.size = [size * scale[0], size * scale[1], size * scale[2]];
        if (![voxel.x, voxel.y, voxel.z, ...voxel.size].every(Number.isFinite) ||
            !voxel.size.every((value) => value > 0)) {
          throw new ModelValidationError('Group scales produce invalid geometry.', 'error.group_scale');
        }
      }
    }
  }
  const bounds = voxelBounds(voxels, size);
  if (![...bounds.min, ...bounds.max, ...bounds.size].every(Number.isFinite)) {
    throw new ModelValidationError('Group scales produce invalid bounds.', 'error.group_scale');
  }
  return bounds;
}
