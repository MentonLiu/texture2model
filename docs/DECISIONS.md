# Decisions

## Host API baseline

The development target is Blockbench 5.2.x; the installed desktop app is 5.2.0. The earliest verified release with the top-level MenuBar.addMenu API is 5.1.0, so plugin min_version is 5.1.0. The runtime alias BBPlugin.register is used because TypeScript's DOM library owns the global name Plugin; BBPlugin is the official alias in blockbench-types.

Sources: [5.1 menu implementation](https://github.com/JannisX11/blockbench/blob/v5.1.0/js/interface/menu_bar.js), [5.2 dialog implementation](https://github.com/JannisX11/blockbench/blob/v5.2.1/js/interface/dialog.ts), [5.2 plugin loader](https://github.com/JannisX11/blockbench/blob/v5.2.1/js/plugin_loader.ts).

The Dialog receives an HTMLElement through its documented lines union. This avoids the deprecated HTML-template-string branch in the current dialog implementation. No Blockbench menu DOM is changed directly.

## UV and compatible formats

CubeFace UV coordinates are top-left-origin image-style coordinates; Blockbench's rendering code converts V into Three.js coordinates. Thus the domain helper uses V = y / imageHeight × uvHeight with **no second V flip**. Model Y is flipped separately. Texture.getUVWidth/Height supplies the actual UV space, which can differ from source resolution.

The writer rejects image-only/non-editable projects, mandatory Box UV, forced single-texture, and per-group-texture formats. These cannot guarantee a distinct per-face texture and UV for each Cube. The writer does not change the current project format or global UV settings.

Sources: [Cube face rendering](https://github.com/JannisX11/blockbench/blob/v5.2.1/js/outliner/types/cube.js), [Face texture behavior](https://github.com/JannisX11/blockbench/blob/v5.2.1/js/outliner/abstract/face.ts), [Texture UV size](https://github.com/JannisX11/blockbench/blob/v5.2.1/js/texturing/textures.js).

## Atomic Undo and scheduling

The writer uses one Undo.initEdit followed by one Undo.finishEdit. The same mutable aspects object tracks the new Texture, Group, and Cubes before they enter host collections. Texture.add(false) avoids a nested Undo. Undo.cancelEdit(true) reverts a failed write.

The confirmed ModelPlan is built asynchronously in complete-row or pixel batches. The Blockbench write stays synchronous. We found no supported guarantee that an open Undo edit can safely cross arbitrary asynchronous UI yields; preserving a complete one-step Undo has priority. Cube.init already prepares geometry, faces, and UV, so the writer performs no redundant full Canvas refresh.

Sources: [Undo implementation](https://github.com/JannisX11/blockbench/blob/v5.2.1/js/undo.js), [Cube initialization](https://github.com/JannisX11/blockbench/blob/v5.2.1/js/outliner/types/cube.js).

## Preview fidelity and resources

Preview reads only ModelPlan, with one InstancedMesh rather than one Three Mesh per Cube. Blockbench's Three r129 instance colors contain RGB only, so a custom instance alpha attribute carries the original pixel alpha. The renderer uses an offscreen WebGL canvas and presents it in the Dialog canvas; Canvas 2D isometric drawing is the fallback. Preview lighting and material behavior remain a visual approximation of the generated texture.

The renderer releases geometry, material, mesh, WebGL context, animation frame, and pointer listeners on replacement, close, error, and plugin unload. Cancelling a superseded decode/plan task prevents stale results from replacing a newer preview.

Source: [Three r129 InstancedMesh](https://github.com/mrdoob/three.js/blob/r129/src/objects/InstancedMesh.js).
