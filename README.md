# Texture Model / 纹理模型

Texture Model is a Blockbench plugin that turns an image into a voxel model. It reads pixels, builds a data-only preview, and generates **one independent Cube per eligible pixel**. Each of that Cube's six faces samples the same source texel.

Texture → Pixels → ModelPlan → Preview → one Cube Group in the current project.

## Requirements and installation

- Blockbench 5.1.0 or newer, Desktop or Web.
- An open editable model project that supports Cubes and per-face UV. Generic/free models work. Formats with mandatory Box UV, a single forced texture, or per-group textures are rejected before generation.

~~~sh
npm ci
npm run check
~~~

The installable single-file plugin is [dist/texture_model.js](dist/texture_model.js). In Blockbench, open **File → Plugins → Load Plugin from File** and select it. Build it again after changing source:

~~~sh
npm run build
~~~

## Use

1. Open a compatible Blockbench model project.
2. Choose **纹理模型 → 打开纹理模型生成器…**.
3. Select a PNG, JPEG/JPG, or WebP image.
4. Set the options and click **预览**. Drag the preview to rotate and use the wheel to zoom.
5. Confirm the count and click **生成到工作区**.

The generated texture and all Cubes are placed under one new root Group. One Undo removes the entire generation; Redo restores it.

| Option | Default | Effect |
| --- | --- | --- |
| Processing | Row | Row and pixel modes produce identical Cubes; only scheduling differs. |
| Voxel Size | 1 | Width, height, and depth of each Cube. |
| Alpha Threshold | 0 | Generate when source alpha is strictly greater than the threshold. |
| Include Transparent | Off | When on, every pixel gets a Cube and retains its original texture alpha. |
| Center Model | On | Center the occupied voxel bounds near the origin. |
| Group Name | Image stem + _texture_model | Name is made unique if needed. |
| Maximum Cubes | 20,000 | Editable from 1,000 to 100,000 in Advanced Settings. |

Changes to any generation option invalidate the preview. Preview creates no Blockbench Cube, Group, or Texture. The preview colors are a lightweight visual approximation; the generated model uses the original image texture.

## Performance

Cube count scales with eligible pixels: a fully opaque 128 × 128 image creates **16,384 Cubes**. The dialog warns above 8,000 and blocks a count above the configured maximum. Large models can slow Blockbench, especially at the optional 100,000-Cube limit. Cubes are never merged.

The image-to-plan stage yields to the UI in batches and can be cancelled. The final Blockbench write is synchronous so one Undo edit covers Texture, Group, and every Cube.

## Development

~~~sh
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
npm run fixtures
~~~

The source lives in [src](src), automated tests in [tests](tests), and design and verification notes in [docs](docs). Plugin author metadata intentionally contains a TODO until an author is supplied.
