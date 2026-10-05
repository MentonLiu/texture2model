# Architecture

~~~text
                  ┌──────────────┐
                  │ Image Loader │
                  └──────┬───────┘
                         ▼
                  ┌──────────────┐
                  │  ImageData   │
                  └──────┬───────┘
                         ▼
                  ┌──────────────┐
                  │ ModelPlanner │
                  └──────┬───────┘
                         ▼
                  ┌──────────────┐
                  │  ModelPlan   │
                  └──────┬───────┘
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
      ┌───────────────┐       ┌────────────────┐
      │PreviewRenderer│       │BlockbenchWriter│
      └───────────────┘       └───────┬────────┘
                                      ▼
                               Texture + Group
                                      +
                                   Cubes
~~~

## Boundaries

- **Domain:** image validation, alpha counts, cancellation, pixel coordinates, UV rectangles, naming, and ModelPlan creation. It imports no Blockbench, Three.js, or DOM model objects. Every plan voxel is a plain data record containing source coordinates, model position, and RGBA.
- **Image loader:** browser FileReader, Image, and Canvas 2D decode PNG/JPEG/WebP to RGBA. It works in Blockbench Desktop and Web without Node filesystem access.
- **UI:** the resizable Blockbench Dialog owns file selection, settings, statistics, task cancellation, preview freshness, and buttons. It does not create Cubes.
- **Preview:** reads a ModelPlan into one Three.js InstancedMesh with per-instance color/alpha. It falls back to Canvas 2D isometric drawing if WebGL is unavailable. It never calls a Blockbench project mutation API.
- **Blockbench writer:** validates the confirmed plan and current format, then creates a texture, one root Group, and one Cube per plan voxel. Its only input geometry comes from ModelPlan.

The menu is registered through BarMenu and MenuBar.addMenu. Its Action opens the Dialog. Unload deletes the menu, actions, Dialog, CSS, and preview resources.

## Data and coordinates

Image coordinates start at the upper left. For image height H and voxel size S, source pixel (x, y) starts at model (x × S, (H − 1 − y) × S, 0). Centering subtracts the midpoint of occupied bounds without changing spacing. The plan remains ordered by source rows, then columns, for both scheduling modes.

The writer computes one UV rectangle through the shared pixelToUVRect helper, using Texture.getUVWidth/Height. The same rectangle and texture UUID are assigned to north, south, east, west, up, and down. Every Cube has Box UV disabled and Auto UV set to zero.

## Transaction

Generation validates the plan, count, image, UV space, and format before opening Undo. One synchronous Undo edit tracks outliner, elements, groups, textures, and selected texture. New objects enter tracking arrays before host mutation. On error, Undo.cancelEdit(true) reverts the partial edit.
