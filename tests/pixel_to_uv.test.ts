import { describe, expect, it } from 'vitest';
import { pixelToUVRect } from '../src/domain/pixel_to_uv';

describe('pixel-to-UV conversion', () => {
  it('maps all four corners of a non-square 4×2 image', () => {
    expect(pixelToUVRect(0, 0, 4, 2, 16, 8)).toEqual([0, 0, 4, 4]);
    expect(pixelToUVRect(3, 0, 4, 2, 16, 8)).toEqual([12, 0, 16, 4]);
    expect(pixelToUVRect(0, 1, 4, 2, 16, 8)).toEqual([0, 4, 4, 8]);
    expect(pixelToUVRect(3, 1, 4, 2, 16, 8)).toEqual([12, 4, 16, 8]);
  });

  it('supports UV dimensions different from source dimensions', () => {
    expect(pixelToUVRect(1, 1, 4, 2, 8, 16)).toEqual([2, 8, 4, 16]);
  });

  it('rejects out-of-range coordinates', () => {
    expect(() => pixelToUVRect(4, 0, 4, 2, 4, 2)).toThrow();
    expect(() => pixelToUVRect(0, -1, 4, 2, 4, 2)).toThrow();
  });
});
