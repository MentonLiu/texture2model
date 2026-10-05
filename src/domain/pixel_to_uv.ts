import type { UVRect } from '../types';
import { ModelValidationError } from './validation';

/**
 * Blockbench per-face UV rectangles use a top-left origin with V increasing
 * downward. Map a source pixel into the project's UV coordinate space.
 */
export function pixelToUVRect(
  x: number,
  y: number,
  imageWidth: number,
  imageHeight: number,
  uvWidth: number,
  uvHeight: number
): UVRect {
  if (!Number.isInteger(imageWidth) || imageWidth < 1 ||
      !Number.isInteger(imageHeight) || imageHeight < 1 ||
      !Number.isFinite(uvWidth) || uvWidth <= 0 ||
      !Number.isFinite(uvHeight) || uvHeight <= 0 ||
      !Number.isInteger(x) || x < 0 || x >= imageWidth ||
      !Number.isInteger(y) || y < 0 || y >= imageHeight) {
    throw new ModelValidationError('Pixel or UV dimensions are invalid.', 'error.pixel_uv');
  }
  return [
    x / imageWidth * uvWidth,
    y / imageHeight * uvHeight,
    (x + 1) / imageWidth * uvWidth,
    (y + 1) / imageHeight * uvHeight
  ];
}
