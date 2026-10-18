# Changelog

## 0.2.0-pre — Preview release / 预览版本 — 2026-10-18

Tag: `v0.2.0-pre`. Consolidates development builds `0.2.0-dev1` through `0.2.0-dev4`, merged from `dev` into `main` with explicit user authorization.

- Restrict imports to PNG and simplify the import area, remove statistics and About, and highlight editable controls and dropdown arrows.
- Default to pixel processing, with row and column processing available. Support upright and lying-flat model orientation.
- Automatically preview after import and on every edit, cancel obsolete calculations, and retain rotation and zoom across updates.
- Optionally group the effective silhouette’s outer ring and inner pixels beneath one root Group. Give each subgroup independent XYZ scales around its own center, synchronized with preview and generation.
- Preserve shared source-texture UVs and a single Undo/Redo transaction across the complete hierarchy.
- Validation is limited to LSP syntax/type diagnostics and esbuild packaging. No typecheck commands, Lint, automated tests, or plugin runtime tests were run; runtime acceptance remains unverified.

标签为 `v0.2.0-pre`，汇总 `0.2.0-dev1` 至 `0.2.0-dev4`，已获用户明确授权从 `dev` 合并至 `main` 发布。

- 仅导入 PNG，精简纹理导入区，移除统计及“关于”入口，突出输入框与下拉箭头。
- 默认按像素处理，保留按行、按列处理，支持立着放和躺着放。
- 导入与每次参数操作自动更新预览，取消旧任务并保留旋转、缩放视角。
- 支持图案有效外轮廓分组：总组内包含外圈和内部子组，各组可独立调整 XYZ 缩放，预览与生成同步。
- 保留共享纹理 UV，整个层级纳入同一次撤销和重做。
- 验证仅限 LSP 语法/类型诊断和 esbuild 打包，未运行类型检查命令、Lint、自动化测试或插件运行测试，不宣称功能验收通过。

## 0.2.0-dev4 — Outer-ring groups and scale / 外圈分组与缩放

- Add opt-in detection of the effective pixel silhouette’s outer ring, ignoring transparent padding and enclosed hole edges.
- Create nonempty outer/inner subgroups inside the root Group, sharing one texture and one Undo/Redo transaction.
- Add independent XYZ scales for both subgroups, defaulting to 1 around each group’s occupied center. Update actual box dimensions, positions, bounds, WebGL and Canvas previews, and workspace generation together.
- Keep automatic previews and cancellable detection. Deliver on `dev` with LSP diagnostics and esbuild packaging only; user runtime acceptance remains pending.

- 新增“外圈像素单独分组”，按有效像素图案外轮廓识别，不受透明留白影响，封闭孔洞内边缘不算外圈。
- 外圈、内部的非空子组包含在总组内，共享纹理并纳入同一次撤销/重做。
- 各组分别提供 XYZ 缩放，默认为 1，围绕各组自身中心缩放；体素尺寸、位置、边界、两种预览和最终生成同步更新。
- 保留实时预览与可取消检测，仅进行 LSP 诊断和 esbuild 打包，在 `dev` 交付，等待用户亲自验收。

## 0.2.0-dev3 — Live preview / 实时预览

- Remove the Preview button. PNG import and every settings edit now refresh the preview automatically, without waiting for a click or field blur.
- Cancel obsolete calculations, coalesce edits within a display frame, and keep image decoding independent from settings changes.
- Preserve rotation, zoom, and the renderer across updates. Clear outdated geometry on invalid inputs or exceeded limits, and enable Generate only for a current valid preview.
- Deliver on `dev` with LSP diagnostics and esbuild packaging only; runtime acceptance remains pending with the user.

- 删除“预览”按钮，导入 PNG 后自动预览，输入或选项变化时实时更新，无需点击按钮或离开输入框。
- 连续操作取消旧计算，同一显示帧内的编辑合并处理，修改参数不会中断图片读取。
- 更新时保留旋转、缩放及渲染器；输入无效或超出上限时清除过期画面，只有最新有效预览就绪后才允许生成。
- 在 `dev` 交付，仅进行 LSP 诊断与 esbuild 打包，等待用户亲自进行功能验收。

## 0.2.0-dev2 — Model orientation / 模型朝向

- Add a Model orientation dropdown: Upright (default) or Lying flat, with the same highlighted border and dropdown arrow as other controls.
- Apply orientation to voxel coordinates, occupied bounds, centering, preview, and generated Cubes. Changing orientation invalidates the previous preview.
- Keep source pixel UVs and transparency unchanged in all three processing modes. Deliver on `dev` with LSP diagnostics and esbuild packaging only; user runtime acceptance remains pending.

- 新增“模型朝向”下拉框，可选“立着放 / 躺着放”，默认立着放，沿用醒目边框与下拉箭头。
- 朝向同步作用于体素坐标、实际边界、居中、预览和生成，切换朝向后必须重新预览。
- 三种处理方式均保留原像素 UV 和透明度。仅进行 LSP 诊断与 esbuild 打包，在 `dev` 交付，等待用户亲自验收。

## 0.2.0-dev1 — Development build / 开发测试版本

- Restrict import to PNG, including extension, MIME, and file signature validation.
- Add column traversal, make pixel processing the default, and validate column ordering when generating.
- Simplify the texture picker, remove statistics and the About action/dialog, and highlight editable fields with a visible dropdown arrow.
- Keep development on `dev`; merging to `main` requires explicit user authorization.
- Allow only LSP syntax/type diagnostics and esbuild packaging. No typecheck commands, Lint, automated tests, or plugin runtime tests are permitted; user acceptance is pending.

- 当前只允许导入 PNG，同时校验扩展名、MIME 与文件头。
- 新增按列处理，默认改为按像素；生成校验同步支持列遍历顺序。
- 简化纹理导入区，移除统计信息及“关于纹理模型”按钮与弹窗，突出输入框并显示下拉箭头。
- 功能合并回 `dev`，未经用户明确要求不得合并 `main`。
- 验证仅限 LSP 语法/类型诊断及 esbuild 打包；禁止类型检查命令、Lint、自动化测试与插件运行测试，等待用户亲自验收。

## 0.1.0 — Initial Release / 首个正式版本

### English

- Convert PNG, JPEG, and WebP images into voxel models, with one independent Cube for each eligible pixel.
- Map each Cube's six faces to the same source texel. Filter pixels by alpha threshold or include transparent pixels.
- Preview a data-only ModelPlan before writing to the project. Preview supports rotation and zoom and does not create Blockbench model objects.
- Generate one root Group and its texture and Cubes in a single Undo/Redo operation.
- Choose row or pixel processing, center the model, set a Cube limit, and receive a performance warning for large models.
- Localize the plugin UI to English, Simplified Chinese, or Traditional Chinese according to Blockbench's configured language. Other languages fall back to English.
- Include installation, architecture, testing, and decision documentation under the MIT License.

### 简体中文

- 支持将 PNG、JPEG 和 WebP 图片转换为体素模型，每个符合条件的像素生成一个独立 Cube。
- 每个 Cube 的六个面映射到同一个源纹理像素。可按 Alpha 阈值过滤像素，也可选择包含透明像素。
- 写入项目之前先生成纯数据 ModelPlan 预览。预览支持旋转和缩放，不会创建 Blockbench 模型对象。
- 将根 Group、纹理和所有 Cube 放在同一次撤销/重做操作中生成。
- 支持按行或按像素处理、模型居中、Cube 数量上限，并在模型较大时显示性能警告。
- 插件界面根据 Blockbench 配置显示英文、简体中文或繁体中文；其他语言回退为英文。
- 提供安装、架构、测试和设计决策文档，并采用 MIT 许可证。

### Verification / 验证

- TypeScript typecheck, ESLint, and the production build pass for this release. The automated test suite was not rerun after the localization change.
- Blockbench 5.2.0 manual acceptance, including UI language switching and native Undo/Redo, remains pending. See [docs/TESTING.md](docs/TESTING.md).
- 本次发布已通过 TypeScript 类型检查、ESLint 和正式构建；加入双语功能后没有重新运行自动化测试。
- Blockbench 5.2.0 手工验收（包括界面语言切换和原生撤销/重做）仍待完成，详见 [docs/TESTING.md](docs/TESTING.md)。
