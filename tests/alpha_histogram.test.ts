import { describe, expect, it } from 'vitest';
import { buildAlphaHistogram, countFromAlphaHistogram } from '../src/domain/alpha_histogram';
import { countImagePixels } from '../src/domain/model_planner';
import type { PixelImage } from '../src/types';

describe('cached image counts', () => {
  it('matches a pixel scan across alpha thresholds and transparent inclusion', () => {
    const image: PixelImage = {
      width: 4,
      height: 1,
      data: new Uint8ClampedArray([
        1, 2, 3, 0,
        4, 5, 6, 1,
        7, 8, 9, 128,
        10, 11, 12, 255
      ])
    };
    const histogram = buildAlphaHistogram(image);
    for (const threshold of [0, 1, 127, 128, 255]) {
      for (const includeTransparent of [false, true]) {
        expect(countFromAlphaHistogram(histogram, threshold, includeTransparent))
          .toEqual(countImagePixels(image, threshold, includeTransparent));
      }
    }
  });
});
