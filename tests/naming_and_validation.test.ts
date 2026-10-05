import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_VOXELS } from '../src/constants';
import {
  defaultGroupName,
  uniqueGroupName,
  uniqueTextureName
} from '../src/domain/naming';
import { getVoxelLimitStatus, validateMaxVoxels } from '../src/domain/validation';

describe('generated names', () => {
  it('uses the image stem and finds collision-free group names', () => {
    expect(defaultGroupName('robot.png')).toBe('robot_texture_model');
    expect(uniqueGroupName('robot_texture_model', [
      'robot_texture_model', 'robot_texture_model_2'
    ])).toBe('robot_texture_model_3');
    expect(uniqueGroupName('robot_texture_model', ['ROBOT_TEXTURE_MODEL'])).toBe(
      'robot_texture_model_2'
    );
  });

  it('adds texture suffixes before the file extension', () => {
    expect(uniqueTextureName('texture.png', ['texture.png', 'texture_2.png'])).toBe(
      'texture_3.png'
    );
    expect(uniqueTextureName('my.image.webp', [])).toBe('my.image.webp');
  });
});

describe('voxel limits', () => {
  it('warns after 8000 and blocks counts above the configured maximum', () => {
    expect(DEFAULT_MAX_VOXELS).toBe(20_000);
    expect(getVoxelLimitStatus(8_000, DEFAULT_MAX_VOXELS)).toBe('ok');
    expect(getVoxelLimitStatus(8_001, DEFAULT_MAX_VOXELS)).toBe('warning');
    expect(getVoxelLimitStatus(20_000, DEFAULT_MAX_VOXELS)).toBe('warning');
    expect(getVoxelLimitStatus(20_001, DEFAULT_MAX_VOXELS)).toBe('exceeded');
    expect(getVoxelLimitStatus(16_384, DEFAULT_MAX_VOXELS)).toBe('warning');
  });

  it('rejects limits outside 1000–100000 instead of silently clamping them', () => {
    expect(() => validateMaxVoxels(999)).toThrow();
    expect(() => validateMaxVoxels(100_001)).toThrow();
    expect(() => validateMaxVoxels(1_000)).not.toThrow();
  });
});
