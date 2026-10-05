# Testing

## Automated results

As of 2026-10-05, local checks:

| Check | Result | Scope |
| --- | --- | --- |
| npm run typecheck | PASS | TypeScript and blockbench-types 5.2.0 |
| npm run lint | PASS | Source and tests |
| npm run test | PASS | 21 tests: planning, transparency, Y mapping, row/pixel equivalence, cancellation, UV corners, naming, limit, writer host mocks, lifecycle host mocks |
| npm run build | PASS | Single-file dist/texture_model.js |
| Blockbench 5.2.0 desktop integration | PENDING | Local file load reached Blockbench's plugin trust warning; it was cancelled before executing the plugin |

Host mocks verify the intended API call sequence. They do **not** prove Blockbench visual output or native Undo behavior. The remaining manual checks are below.

## Prepared textures

- rgb_transparent_2x2.png: top row red/green, bottom row blue/transparent.
- corners_4x2.png: non-square image with different colors at all corners.
- opaque_16x16.png, opaque_32x32.png, opaque_64x64.png, opaque_128x128.png: fully opaque performance cases.

Regenerate the 4×2 and opaque fixtures with npm run fixtures.

## Blockbench manual acceptance checklist — PENDING

1. In Blockbench 5.2.x, create a **Generic Model** project. Note Cube.all.length, Group.all.length, and Texture.all.length.
2. Load dist/texture_model.js from the local file. Confirm one top-level **纹理模型** menu with **打开纹理模型生成器…** and **关于插件**. Open the resizable Dialog.
3. Select rgb_transparent_2x2.png. Confirm 2 × 2, four total pixels, three visible pixels, three estimated Cubes, and a thumbnail.
4. Click **预览**. Confirm the red/green top row, blue bottom-left, and empty bottom-right. Recheck all three Blockbench collection lengths: they must match step 1. Change Voxel Size: Generate must disable until another preview. Close/reopen the Dialog and confirm old tasks do not reappear.
5. Preview again and generate. Confirm exactly one new root Group with direct children px_0_0, px_1_0, px_0_1; exactly three 1 × 1 × 1 Cubes; and one new image Texture. All six faces of the red Cube must show the red texel, with equivalent checks for green and blue. Inspect each face's enabled state, texture, and UV rectangle.
6. Undo once: the three Cubes, Group, and Texture must all disappear. Redo once: all must return.
7. Enable **包含透明像素** and re-preview: estimate and generated count must become four, with the fourth Cube retaining alpha zero in its texture.
8. Use corners_4x2.png. Confirm width 4, height 2, correct top/bottom orientation, and the same source texel on all six faces of each corner Cube.
9. Try a format with mandatory Box UV. Generation must be rejected before any model changes.
10. Reload and unload the plugin. Confirm no duplicate menu, Action, Dialog, listeners, or persistent preview resources.

## Large texture matrix — Blockbench Preview/Generation PENDING

The plan timings below are **Node CLI only**, median of five runs with real event-loop yields on this machine. They are not Blockbench preview or generation times.

| Texture | Expected Cubes | CLI Plan median | Blockbench Preview | Blockbench Generation |
| --- | ---: | ---: | --- | --- |
| 16 × 16 | 256 | 1.27 ms | PENDING | PENDING |
| 32 × 32 | 1,024 | 1.32 ms | PENDING | PENDING |
| 64 × 64 | 4,096 | 2.83 ms | PENDING | PENDING |
| 128 × 128 | 16,384 | 9.99 ms | PENDING | PENDING |

The 128 × 128 case is below the default 20,000-Cube limit and should show the yellow performance warning. Record actual Blockbench preview and generation times before declaring host performance PASS.
