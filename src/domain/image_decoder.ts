import { SUPPORTED_IMAGE_MIME_TYPES } from '../constants';
import type { DecodedImage } from '../types';
import { CancellationToken, TaskCancelledError } from './cancellation';
import { countImagePixels } from './model_planner';
import { ModelValidationError } from './validation';

function supportedMimeType(file: File): string {
  const declared = file.type.toLowerCase();
  const parts = file.name.split('.');
  const extension = parts[parts.length - 1]?.toLowerCase();
  const inferred = extension === 'png' ? 'image/png'
    : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg'
      : extension === 'webp' ? 'image/webp' : '';
  const mimeType = declared || inferred;
  if (!SUPPORTED_IMAGE_MIME_TYPES.some((supported) => supported === mimeType)) {
    throw new ModelValidationError('Choose a PNG, JPEG, or WebP image.', 'error.image_type');
  }
  return mimeType;
}

function readAsDataURL(file: File, token?: CancellationToken): Promise<string> {
  token?.throwIfCancelled();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let finished = false;
    let unsubscribe: () => void = () => undefined;
    const finish = (result: string | Error) => {
      if (finished) return;
      finished = true;
      unsubscribe();
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
      if (typeof result === 'string') resolve(result);
      else reject(result);
    };
    reader.onload = () => {
      if (typeof reader.result === 'string') finish(reader.result);
      else finish(new ModelValidationError('Could not read the image file.', 'error.image_read'));
    };
    reader.onerror = () => finish(new ModelValidationError('Could not read the image file.', 'error.image_read'));
    reader.onabort = () => finish(new TaskCancelledError());
    unsubscribe = token?.onCancel(() => {
      reader.abort();
      finish(new TaskCancelledError());
    }) ?? unsubscribe;
    if (token?.cancelled) return;
    try {
      reader.readAsDataURL(file);
    } catch {
      finish(new ModelValidationError('Could not read the image file.', 'error.image_read'));
    }
  });
}

function loadImage(dataURL: string, token?: CancellationToken): Promise<HTMLImageElement> {
  token?.throwIfCancelled();
  return new Promise((resolve, reject) => {
    const image = new Image();
    let finished = false;
    let unsubscribe: () => void = () => undefined;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      unsubscribe();
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve(image);
    };
    image.onload = () => finish();
      image.onerror = () => finish(new ModelValidationError('Could not decode the image.', 'error.image_decode'));
    unsubscribe = token?.onCancel(() => {
      image.src = '';
      finish(new TaskCancelledError());
    }) ?? unsubscribe;
    if (token?.cancelled) return;
    image.src = dataURL;
  });
}

/** Browser-only decoder; the planner itself remains independent of DOM APIs. */
export async function decodeImageFile(
  file: File,
  token?: CancellationToken
): Promise<DecodedImage> {
  const mimeType = supportedMimeType(file);
  const dataURL = await readAsDataURL(file, token);
  const image = await loadImage(dataURL, token);
  token?.throwIfCancelled();
  if (!Number.isSafeInteger(image.naturalWidth) || image.naturalWidth < 1 ||
      !Number.isSafeInteger(image.naturalHeight) || image.naturalHeight < 1) {
    throw new ModelValidationError('The image has invalid dimensions.', 'error.image_size');
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new ModelValidationError('Canvas 2D is unavailable.', 'error.canvas');
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  token?.throwIfCancelled();
  const pixels = {
    width: imageData.width,
    height: imageData.height,
    data: imageData.data
  };
  return {
    ...pixels,
    fileName: file.name,
    dataURL,
    mimeType,
    imageData,
    visiblePixelCount: countImagePixels(pixels, 0, false).visiblePixels
  };
}
