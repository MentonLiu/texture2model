import { uniqueTextureName } from '../domain/naming';
import type { DecodedImage } from '../types';

/** Add a private copy of the source image to the active Blockbench project. */
export function writeTexture(image: DecodedImage, track: (texture: Texture) => void): Texture {
  const name = uniqueTextureName(image.fileName, Texture.all.map((texture) => texture.name));
  const texture = new Texture({ name });
  track(texture);
  // Texture image loading is asynchronous. Set UV dimensions before writing
  // Cube faces so per-texture UV formats use the source image's dimensions.
  texture.uv_width = image.width;
  texture.uv_height = image.height;
  texture.fromDataURL(image.dataURL);
  return texture.add(false);
}
