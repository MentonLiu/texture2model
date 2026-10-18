import { countImagePixels } from '../domain/model_planner';
import { defaultGroupName, uniqueGroupName } from '../domain/naming';
import { pixelToUVRect } from '../domain/pixel_to_uv';
import { outerRingMask, pixelGroup, resolveGrouping, scalePixelGroups, voxelBounds, voxelDimensions } from '../domain/pixel_groups';
import { tr } from '../i18n';
import {
  ModelValidationError,
  validateMaxVoxels,
  validatePixelImage,
  validatePlannerOptions
} from '../domain/validation';
import type { DecodedImage, GeneratorOptions, ModelPlan, PixelGroup, UVRect, VoxelPlan } from '../types';
import { writeTexture } from './texture_writer';

const FACE_DIRECTIONS: readonly CubeFaceDirection[] = [
  'north', 'south', 'east', 'west', 'up', 'down'
];

function sameNumber(actual: number, expected: number): boolean {
  return Number.isFinite(actual) &&
    Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected));
}

function validatePlan(image: DecodedImage, plan: ModelPlan, options: GeneratorOptions): void {
  validatePixelImage(image);
  validatePlannerOptions(options);
  validateMaxVoxels(options.maxVoxels);
  const grouping = resolveGrouping(options);
  const plannedGrouping = resolveGrouping(plan);
  if (grouping.enabled !== plannedGrouping.enabled ||
      !grouping.outerScale.every((value, axis) => sameNumber(value, plannedGrouping.outerScale[axis] ?? NaN)) ||
      !grouping.innerScale.every((value, axis) => sameNumber(value, plannedGrouping.innerScale[axis] ?? NaN))) {
    throw new ModelValidationError('Preview grouping settings are stale.', 'error.preview_stale');
  }
  if (typeof image.dataURL !== 'string' || !image.dataURL.startsWith('data:image/')) {
    throw new ModelValidationError(
      'The decoded image has no usable Data URL.', 'error.decoded_data_url'
    );
  }
  if (plan.width !== image.width || plan.height !== image.height ||
      plan.voxelSize !== options.voxelSize ||
      (plan.orientation ?? 'upright') !== (options.orientation ?? 'upright') ||
      !Number.isSafeInteger(plan.voxelCount) || plan.voxelCount !== plan.voxels.length) {
    throw new ModelValidationError(
      'Preview no longer matches the chosen image or settings.', 'error.preview_stale'
    );
  }
  const expectedCount = countImagePixels(
    image, options.alphaThreshold, options.includeTransparent
  ).voxelCount;
  if (plan.voxelCount !== expectedCount) {
    throw new ModelValidationError(
      'Preview no longer matches the transparency settings.', 'error.preview_transparency_stale'
    );
  }
  if (plan.voxelCount > options.maxVoxels) {
    throw new ModelValidationError(
      `The model needs ${plan.voxelCount} Cubes, above the limit of ${options.maxVoxels}.`,
      'error.cube_limit',
      [plan.voxelCount, options.maxVoxels]
    );
  }

  const size = options.voxelSize;
  const outerMask = grouping.enabled && plan.voxelCount > 0 ? outerRingMask(image, options) : undefined;
  let minSourceX = Infinity;
  let minSourceY = Infinity;
  let maxSourceX = -Infinity;
  let maxSourceY = -Infinity;
  let previousSourceIndex = -1;
  for (const voxel of plan.voxels) {
    const { sourceX, sourceY } = voxel;
    const sourceIndex = sourceY * image.width + sourceX;
    const traversalIndex = options.processingMode === 'column'
      ? sourceX * image.height + sourceY : sourceIndex;
    const pixelIndex = sourceIndex * 4;
    if (!Number.isInteger(sourceX) || !Number.isInteger(sourceY) ||
        sourceX < 0 || sourceX >= image.width || sourceY < 0 || sourceY >= image.height ||
        traversalIndex <= previousSourceIndex ||
        voxel.group !== (outerMask ? pixelGroup(outerMask, sourceIndex) : undefined) ||
        voxel.rgba.r !== image.data[pixelIndex] ||
        voxel.rgba.g !== image.data[pixelIndex + 1] ||
        voxel.rgba.b !== image.data[pixelIndex + 2] ||
        voxel.rgba.a !== image.data[pixelIndex + 3] ||
        (!options.includeTransparent && voxel.rgba.a <= options.alphaThreshold)) {
      throw new ModelValidationError('Preview pixel data is stale or invalid.', 'error.preview_pixels');
    }
    previousSourceIndex = traversalIndex;
    minSourceX = Math.min(minSourceX, sourceX);
    maxSourceX = Math.max(maxSourceX, sourceX);
    minSourceY = Math.min(minSourceY, sourceY);
    maxSourceY = Math.max(maxSourceY, sourceY);
  }

  if (plan.voxelCount === 0) {
    if ([...plan.bounds.min, ...plan.bounds.max, ...plan.bounds.size]
      .some((dimension) => !sameNumber(dimension, 0))) {
      throw new ModelValidationError(
        'Empty preview bounds are invalid.', 'error.preview_empty_bounds'
      );
    }
    return;
  }
  const minX = minSourceX * size;
  const maxX = (maxSourceX + 1) * size;
  const flat = options.orientation === 'flat';
  const minY = flat ? 0 : (image.height - 1 - maxSourceY) * size;
  const maxY = flat ? size : (image.height - minSourceY) * size;
  const minZ = flat ? minSourceY * size : 0;
  const maxZ = flat ? (maxSourceY + 1) * size : size;
  const offsetX = options.centerModel ? -(minX + maxX) / 2 : 0;
  const offsetY = options.centerModel ? -(minY + maxY) / 2 : 0;
  const offsetZ = options.centerModel ? -(minZ + maxZ) / 2 : 0;
  const expectedVoxels = plan.voxels.map((voxel): VoxelPlan => ({
    ...voxel,
    x: voxel.sourceX * size + offsetX,
    y: (flat ? 0 : (image.height - 1 - voxel.sourceY) * size) + offsetY,
    z: (flat ? voxel.sourceY * size : 0) + offsetZ,
    size: undefined
  }));
  const expectedBounds = scalePixelGroups(expectedVoxels, size, grouping);
  for (let index = 0; index < plan.voxels.length; index += 1) {
    const voxel = plan.voxels[index];
    const expected = expectedVoxels[index];
    if (!voxel || !expected) continue;
    const dimensions = voxelDimensions(voxel, size);
    const expectedDimensions = voxelDimensions(expected, size);
    if (!sameNumber(voxel.x, expected.x) || !sameNumber(voxel.y, expected.y) ||
        !sameNumber(voxel.z, expected.z) || dimensions.length !== 3 ||
        !dimensions.every((value, axis) => sameNumber(value, expectedDimensions[axis] ?? NaN))) {
      throw new ModelValidationError('Preview geometry is stale or invalid.', 'error.preview_geometry');
    }
  }
  for (let axis = 0; axis < 3; axis += 1) {
    if (!sameNumber(plan.bounds.min[axis] ?? NaN, expectedBounds.min[axis] ?? NaN) ||
        !sameNumber(plan.bounds.max[axis] ?? NaN, expectedBounds.max[axis] ?? NaN) ||
        !sameNumber(plan.bounds.size[axis] ?? NaN, expectedBounds.size[axis] ?? NaN)) {
      throw new ModelValidationError('Preview bounds are stale or invalid.', 'error.preview_bounds');
    }
  }
}

function preflightFormat(image: DecodedImage): void {
  if (typeof Project === 'undefined' || !Project ||
      typeof Format === 'undefined' || !Format) {
    throw new ModelValidationError('Open a Blockbench model project before generating.', 'error.open_project');
  }
  if (typeof Cube === 'undefined' || typeof Group === 'undefined' ||
      typeof Texture === 'undefined' || typeof Undo === 'undefined' ||
      typeof Canvas === 'undefined' || !Format.edit_mode || Format.image_editor) {
    throw new ModelValidationError(
      'The current project format does not support Cube editing.', 'error.cube_unsupported'
    );
  }
  if ((Format.box_uv && !Format.optional_box_uv) ||
      Format.single_texture || Format.per_group_texture) {
    throw new ModelValidationError(
      'The current project format cannot use an independent texture on every Cube face.',
      'error.per_face_uv_unsupported'
    );
  }
  if (!Format.per_texture_uv_size &&
      (!Number.isFinite(Project.texture_width) || Project.texture_width <= 0 ||
       !Number.isFinite(Project.texture_height) || Project.texture_height <= 0)) {
    throw new ModelValidationError('The current project UV dimensions are invalid.', 'error.project_uv_size');
  }
  const uvWidth = Format.per_texture_uv_size ? image.width : Project.texture_width;
  const uvHeight = Format.per_texture_uv_size ? image.height : Project.texture_height;
  if (!Number.isFinite(uvWidth) || uvWidth <= 0 ||
      !Number.isFinite(uvHeight) || uvHeight <= 0) {
    throw new ModelValidationError('The current project has invalid UV dimensions.', 'error.uv_size');
  }
}

function cubeFaces(uv: UVRect, texture: Texture): Partial<Record<CubeFaceDirection, CubeFaceOptions>> {
  const faces: Partial<Record<CubeFaceDirection, CubeFaceOptions>> = {};
  for (const direction of FACE_DIRECTIONS) {
    faces[direction] = { enabled: true, texture: texture.uuid, uv: [...uv] };
  }
  return faces;
}

function makeCube(
  voxel: VoxelPlan, size: number, texture: Texture, image: DecodedImage,
  uvWidth: number, uvHeight: number
): Cube {
  const uv = pixelToUVRect(
    voxel.sourceX, voxel.sourceY,
    image.width, image.height,
    uvWidth, uvHeight
  );
  const dimensions = voxelDimensions(voxel, size);
  return new Cube({
    name: `px_${voxel.sourceX}_${voxel.sourceY}`,
    from: [voxel.x, voxel.y, voxel.z],
    to: [voxel.x + dimensions[0], voxel.y + dimensions[1], voxel.z + dimensions[2]],
    box_uv: false,
    autouv: 0,
    faces: cubeFaces(uv, texture)
  });
}

/** One synchronous Blockbench edit for a source image and its confirmed plan. */
export function writeModel(
  image: DecodedImage,
  plan: ModelPlan,
  options: GeneratorOptions
): void {
  validatePlan(image, plan, options);
  preflightFormat(image);
  if (typeof options.groupName !== 'string') {
    throw new ModelValidationError('Group name must be text.', 'error.group_name');
  }
  const preferredName = options.groupName.trim() || defaultGroupName(image.fileName);
  const groupName = uniqueGroupName(preferredName, Group.all.map((group) => group.name));
  const aspects: UndoAspects = {
    outliner: true,
    elements: [],
    groups: [],
    textures: [],
    selected_texture: true
  };
  Undo.initEdit(aspects);
  try {
    const texture = writeTexture(image, (created) => aspects.textures?.push(created));
    const uvWidth = texture.getUVWidth();
    const uvHeight = texture.getUVHeight();
    const group = new Group({ name: groupName });
    aspects.groups?.push(group);
    group.addTo('root').init();
    const subgroups = new Map<PixelGroup, Group>();
    if (options.grouping?.enabled) {
      for (const key of ['outer', 'inner'] as const) {
        const members = plan.voxels.filter((voxel) => voxel.group === key);
        if (members.length === 0) continue;
        const bounds = voxelBounds(members, plan.voxelSize);
        const child = new Group({
          name: tr('group.' + key),
          origin: [
            (bounds.min[0] + bounds.max[0]) / 2,
            (bounds.min[1] + bounds.max[1]) / 2,
            (bounds.min[2] + bounds.max[2]) / 2
          ]
        });
        aspects.groups?.push(child);
        child.addTo(group).init();
        subgroups.set(key, child);
      }
    }
    for (const voxel of plan.voxels) {
      const cube = makeCube(voxel, plan.voxelSize, texture, image, uvWidth, uvHeight);
      aspects.elements?.push(cube);
      cube.addTo(voxel.group ? subgroups.get(voxel.group) ?? group : group).init();
    }
    // Cube.init() sets up geometry, faces, and UVs; a second full refresh
    // would repeat that work for every voxel.
    Undo.finishEdit('Generate Texture Model', aspects);
  } catch (error) {
    Undo.cancelEdit(true);
    throw error;
  }
}
