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
- **Image loader:** browser FileReader, Image, and Canvas 2D decode PNG to RGBA after extension, MIME, and PNG signature validation. It works in Blockbench Desktop and Web without Node filesystem access.
- **UI:** the resizable Blockbench Dialog owns file selection, settings, task cancellation, preview freshness, and buttons. It does not create Cubes.
- **Preview:** reads a ModelPlan into one Three.js InstancedMesh with per-instance color/alpha. It falls back to Canvas 2D isometric drawing if WebGL is unavailable. It never calls a Blockbench project mutation API.
- **Blockbench writer:** validates the confirmed plan and current format, then creates a texture, one root Group, and one Cube per plan voxel. Its only input geometry comes from ModelPlan.

The menu is registered through BarMenu and MenuBar.addMenu. Its single Action opens the Dialog; there is no About action or dialog. Unload deletes the menu, actions, Dialog, CSS, and preview resources.

## Data and coordinates

Image coordinates start at the upper left. For image height H and voxel size S, source pixel (x, y) starts at model (x × S, (H − 1 − y) × S, 0). Upright (the default) uses the XY plane. Lying flat uses the XZ plane: source pixel (x, y) starts at (x × S, 0, y × S), so image top lies toward negative Z relative to image bottom. Centering subtracts the occupied bounds midpoint on all three axes without changing spacing. ModelPlan records the orientation, and generation rejects a plan from a different orientation. Both preview paths render the same planned positions. Pixel (the default) and row modes order the plan by source rows, then columns. Column mode orders it by columns, then rows. The writer validates the traversal order for the chosen mode while reading RGBA and UVs from the original source coordinates.

The writer computes one UV rectangle through the shared pixelToUVRect helper, using Texture.getUVWidth/Height. The same rectangle and texture UUID are assigned to north, south, east, west, up, and down. Every Cube has Box UV disabled and Auto UV set to zero.

## Live preview lifecycle

Importing a PNG starts preview automatically. Text/number fields update on input; selects and checkboxes update on change. Edits invalidate the confirmed plan immediately and schedule the latest calculation for the next animation frame, coalescing edits in the same frame. Decoding and planning use separate cancellation tokens, so changing settings during import does not abort decoding. Successful decoding reads the latest settings and starts preview.

Each preview is tied to a revision. Cancelled, superseded, or disposed tasks cannot publish progress, render results, report errors, or dispose a newer renderer. The controller reuses the renderer to preserve rotation, zoom, and its WebGL context. It clears stale geometry on invalid input, an exceeded limit, or a new file. Generate stays disabled while reading or updating and becomes available only for a current valid plan. Closing cancels queued frames, decoding, and planning, then releases all preview resources.

## Transaction

Generation validates the plan, count, image, UV space, and format before opening Undo. One synchronous Undo edit tracks outliner, elements, groups, textures, and selected texture. New objects enter tracking arrays before host mutation. On error, Undo.cancelEdit(true) reverts the partial edit.
