import type { ImagePixelCounts, PixelImage } from '../types';
import { validateAlphaThreshold, validatePixelImage } from './validation';

/** Cache alpha counts so dialog edits do not rescan every image pixel. */
export interface AlphaHistogram {
  bins: Uint32Array;
  totalPixels: number;
  visiblePixels: number;
}

export function buildAlphaHistogram(image: PixelImage): AlphaHistogram {
  validatePixelImage(image);
  const bins = new Uint32Array(256);
  for (let index = 3; index < image.data.length; index += 4) {
    const alpha = image.data[index] ?? 0;
    bins[alpha] = (bins[alpha] ?? 0) + 1;
  }
  const totalPixels = image.width * image.height;
  return { bins, totalPixels, visiblePixels: totalPixels - (bins[0] ?? 0) };
}

export function countFromAlphaHistogram(
  histogram: AlphaHistogram,
  alphaThreshold: number,
  includeTransparent: boolean
): ImagePixelCounts {
  validateAlphaThreshold(alphaThreshold);
  let eligiblePixels = 0;
  for (let alpha = alphaThreshold + 1; alpha < 256; alpha += 1) {
    eligiblePixels += histogram.bins[alpha] ?? 0;
  }
  return {
    totalPixels: histogram.totalPixels,
    visiblePixels: histogram.visiblePixels,
    eligiblePixels,
    voxelCount: includeTransparent ? histogram.totalPixels : eligiblePixels
  };
}
