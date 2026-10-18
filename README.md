# Texture Model / 纹理模型

[English](#english) · [简体中文](#简体中文)

## English

Texture Model is a Blockbench plugin that turns an image into a voxel model. It reads pixels, builds a data-only preview, and generates **one independent Cube per eligible pixel**. Each Cube's six faces sample the same source texel.

Texture → Pixels → ModelPlan → Preview → one Cube Group in the current project.

The dialog uses a compact PNG picker, highlighted editable fields, and a visible dropdown arrow. Statistics and the About menu/dialog have been removed.

The plugin UI follows Blockbench's configured language. It provides English and Simplified or Traditional Chinese; other Blockbench languages fall back to English. Plugin author: `600_liang`. Tags: `Texture`, `Modeling`, `Tool`.

### Requirements and installation

- Blockbench 5.1.0 or newer, Desktop or Web.
- An open editable model project that supports Cubes and per-face UV. Generic/free models work. Formats with mandatory Box UV, a single forced texture, or per-group textures are rejected before generation.

~~~sh
npm ci
npm run build
~~~

The installable single-file plugin is [dist/texture_model.js](dist/texture_model.js). In Blockbench, open **File → Plugins → Load Plugin from File** and select it. Build it again after changing source:

~~~sh
npm run build
~~~

### Use

1. Open a compatible Blockbench model project.
2. Choose **Texture Model → Open Texture Model Generator…**.
3. Select a PNG image. Preview starts automatically after import.
4. Adjust the options; the preview updates automatically on every edit. Drag to rotate and use the wheel to zoom.
5. Review the preview and click **Generate in Workspace**.

All Cubes are placed under one new root Group with one shared texture. Enabling Separate outer-ring pixels creates nonempty Outer pixels and Inner pixels subgroups inside it. One Undo removes the entire generation; Redo restores it.

| Option | Default | Effect |
| --- | --- | --- |
| Processing | By pixel | Pixel, row, and column modes create the same geometry and UVs; traversal order and scheduling differ. |
| Model orientation | Upright | Upright uses the vertical plane; Lying flat uses the horizontal plane. Changing orientation automatically updates the preview. |
| Voxel Size | 1 | Width, height, and depth of each Cube. |
| Alpha Threshold | 0 | Generate when source alpha is strictly greater than the threshold. |
| Include Transparent | Off | When on, every pixel gets a Cube and retains its original texture alpha. |
| Center Model | On | Center the occupied voxel bounds near the origin. |
| Separate outer-ring pixels | Off | Detect the effective silhouette; create outer/inner subgroups inside the root group. |
| Group scale | X/Y/Z = 1 | Scale each subgroup independently around its own center along world X, Y, Z. Values must be greater than zero. |
| Group Name | Image stem + `_texture_model` | Name is made unique if needed. |
| Maximum Cubes | 20,000 | Editable from 1,000 to 100,000 in Advanced Settings. |

Changes to any generation option automatically refresh the preview. Generate is available when the latest preview is ready. Rapid edits cancel older calculations, and updates preserve rotation and zoom. Invalid inputs or counts over the limit clear the outdated preview and disable generation. Preview creates no Blockbench Cube, Group, or Texture. Preview colors are a lightweight visual approximation; the generated model uses the original image texture.

Outer-ring detection follows pixels whose alpha is above the threshold and touches the image exterior through four-connected background. Transparent padding does not change the contour; enclosed holes do not create another outer ring. If Include Transparent is on, extra filtered/transparent pixels go to the inner group without changing the detected contour. Scaling happens after model centering and updates positions, per-axis Cube dimensions, bounds, and both preview paths. Empty subgroups are omitted. All grouping and scale edits update the preview automatically.

### Performance

Cube count scales with eligible pixels: a fully opaque 128 × 128 image creates **16,384 Cubes**. The dialog warns above 8,000 and blocks a count above the configured maximum. Large models can slow Blockbench, especially at the optional 100,000-Cube limit. Cubes are never merged.

The image-to-plan stage yields to the UI in batches and can be cancelled. The final Blockbench write is synchronous so one Undo edit covers the Texture, Group, and every Cube.

### Development

~~~sh
npm run build
~~~

The current development target is **0.2.0**, with **0.2.0-dev4** delivered on `dev`. Features merge into `dev`; merging into `main` requires an explicit user instruction. See [AGENTS.md](AGENTS.md) and [git.md](git.md).

Use **LSP diagnostics only** for syntax and type feedback. Do not run typecheck commands, Lint, tests, or plugin runtime verification. `npm run build` only packages the installable plugin with esbuild. Existing test sources are historical and must not be run. Runtime acceptance is performed by the user; see [docs/TESTING.md](docs/TESTING.md).

The source lives in [src](src), and design and verification notes in [docs](docs). Plugin author metadata is `600_liang`; the Blockbench tags are `Texture`, `Modeling`, and `Tool`.

### License

This project is licensed under the [MIT License](LICENSE).

## 简体中文

纹理模型是一个 Blockbench 插件，可将图片转换为体素模型。插件读取图片像素并生成纯数据预览；每个**符合条件的像素都会对应一个独立 Cube**，且该 Cube 的六个面都会采样同一个纹理像素。

纹理 → 像素 → ModelPlan → 预览 → 在当前项目中创建一个 Cube 组。

界面使用简洁的 PNG 导入按钮，突出可编辑输入框，并为下拉框显示明确箭头。已移除统计信息和“关于纹理模型”菜单与弹窗。

插件界面会跟随 Blockbench 当前配置的语言。支持英文、简体中文和繁体中文；其他 Blockbench 语言会显示英文。插件开发者：`600_liang`。标签：`Texture`、`Modeling`、`Tool`。

### 环境要求与安装

- Blockbench 5.1.0 或更新版本，支持桌面版和网页版。
- 当前打开的可编辑模型项目必须支持 Cube 和逐面 UV。通用模型格式可用；强制使用 Box UV、只能使用单一纹理或按组指定纹理的格式会在生成前被拒绝。

~~~sh
npm ci
npm run build
~~~

可直接安装的单文件插件为 [dist/texture_model.js](dist/texture_model.js)。在 Blockbench 中打开 **文件 → 插件 → 从文件加载插件**，选择该文件。修改源代码后重新构建：

~~~sh
npm run build
~~~

### 使用方法

1. 打开兼容的 Blockbench 模型项目。
2. 选择 **纹理模型 → 打开纹理模型生成器…**。
3. 选择 PNG 图片，导入后自动开始预览。
4. 调整参数，每次输入或选项变化都会自动更新预览。拖动可旋转，滚动滚轮可缩放。
5. 确认预览后，点击 **生成到工作区**。

所有 Cube 放入新建的根 Group，并共享一张纹理。开启“外圈像素单独分组”后，会在总组内创建非空的“外圈像素”和“内部像素”子组。执行一次撤销即可移除本次生成的全部内容；重做可恢复。

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| 处理方式 | 按像素 | 支持按像素、按行和按列；生成的几何形状和 UV 相同，遍历顺序与任务调度不同。 |
| 模型朝向 | 立着放 | 可选立着放或躺着放；切换后自动更新预览，预览和生成使用相同朝向。 |
| 体素尺寸 | 1 | 每个 Cube 的宽、高和厚度。 |
| 透明度阈值 | 0 | 仅当原像素 alpha 严格大于阈值时生成。 |
| 包含透明像素 | 关闭 | 开启后每个像素都会生成 Cube，并保留原纹理透明度。 |
| 居中模型 | 开启 | 将已生成体素的边界中心移到世界原点附近。 |
| 外圈像素单独分组 | 关闭 | 按有效像素图案外轮廓检测，在总组内创建外圈与内部子组。 |
| 分组缩放 | XYZ 均为 1 | 各组围绕自身中心，沿世界 X、Y、Z 轴独立缩放；数值必须大于零。 |
| Group 名称 | 图片文件名 + `_texture_model` | 名称冲突时会自动生成唯一名称。 |
| Cube 数量上限 | 20,000 | 可在“高级设置”中调整为 1,000 至 100,000。 |

修改任何生成参数都会自动更新预览，最新预览就绪后即可生成。连续操作会取消旧计算，更新时保留旋转和缩放视角。输入无效或超出数量上限时，清除过期预览并禁用生成。预览不会创建 Blockbench Cube、Group 或 Texture。预览颜色是轻量级视觉近似；最终模型使用原始图片纹理。

外圈检测使用透明度阈值过滤后的图案，以四邻接方式查找与图片外部相邻的像素，透明留白不影响轮廓，封闭孔洞的内边缘不算外圈。开启“包含透明像素”后，额外生成的透明或被阈值过滤的像素归入内部组，不改变外轮廓。分组缩放在模型居中后进行，同时调整位置、各轴体素尺寸、边界和两种预览路径；不创建空子组。所有分组与缩放操作都会自动更新预览。

### 性能

Cube 数量随符合条件的像素数增加：全不透明的 128 × 128 图片会生成 **16,384 个 Cube**。超过 8,000 个时显示性能警告；超过当前上限时禁止生成。大型模型可能降低 Blockbench 响应速度，尤其是将上限提高到 100,000 时。插件不会合并 Cube。

图片到 ModelPlan 的计算会分批让出 UI，并支持取消。写入 Blockbench 的最终步骤是同步执行的，因此纹理、Group 和所有 Cube 都纳入同一次撤销操作。

### 开发

~~~sh
npm run build
~~~

当前开发目标为 **0.2.0**，测试版本 **0.2.0-dev4** 在 `dev` 分支交付。功能完成后合回 `dev`；只有用户明确要求时才能合并 `main`。详见 [AGENTS.md](AGENTS.md) 和 [git.md](git.md)。

**只允许 LSP 语法和类型诊断**，禁止运行类型检查命令、Lint、任何代码测试或插件运行验证。`npm run build` 仅通过 esbuild 打包安装文件。已有测试源码仅保留历史记录，不得运行。实际功能由用户亲自验收，见 [docs/TESTING.md](docs/TESTING.md)。

源代码位于 [src](src)，架构与验证说明位于 [docs](docs)。插件开发者为 `600_liang`，Blockbench 标签为 `Texture`、`Modeling` 和 `Tool`。

### 许可证

本项目使用 [MIT 许可证](LICENSE)。
