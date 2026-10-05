# Texture Model / 纹理模型

[English](#english) · [简体中文](#简体中文)

## English

Texture Model is a Blockbench plugin that turns an image into a voxel model. It reads pixels, builds a data-only preview, and generates **one independent Cube per eligible pixel**. Each Cube's six faces sample the same source texel.

Texture → Pixels → ModelPlan → Preview → one Cube Group in the current project.

The plugin UI follows Blockbench's configured language. It provides English and Simplified or Traditional Chinese; other Blockbench languages fall back to English.

### Requirements and installation

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

### Use

1. Open a compatible Blockbench model project.
2. Choose **Texture Model → Open Texture Model Generator…**.
3. Select a PNG, JPEG/JPG, or WebP image.
4. Set the options and click **Preview**. Drag the preview to rotate and use the wheel to zoom.
5. Confirm the count and click **Generate in Workspace**.

The generated texture and all Cubes are placed under one new root Group. One Undo removes the entire generation; Redo restores it.

| Option | Default | Effect |
| --- | --- | --- |
| Processing | By row | Row and pixel modes produce identical Cubes; only scheduling differs. |
| Voxel Size | 1 | Width, height, and depth of each Cube. |
| Alpha Threshold | 0 | Generate when source alpha is strictly greater than the threshold. |
| Include Transparent | Off | When on, every pixel gets a Cube and retains its original texture alpha. |
| Center Model | On | Center the occupied voxel bounds near the origin. |
| Group Name | Image stem + `_texture_model` | Name is made unique if needed. |
| Maximum Cubes | 20,000 | Editable from 1,000 to 100,000 in Advanced Settings. |

Changes to any generation option invalidate the preview. Preview creates no Blockbench Cube, Group, or Texture. Preview colors are a lightweight visual approximation; the generated model uses the original image texture.

### Performance

Cube count scales with eligible pixels: a fully opaque 128 × 128 image creates **16,384 Cubes**. The dialog warns above 8,000 and blocks a count above the configured maximum. Large models can slow Blockbench, especially at the optional 100,000-Cube limit. Cubes are never merged.

The image-to-plan stage yields to the UI in batches and can be cancelled. The final Blockbench write is synchronous so one Undo edit covers the Texture, Group, and every Cube.

### Development

~~~sh
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
npm run fixtures
~~~

The source lives in [src](src), automated tests in [tests](tests), and design and verification notes in [docs](docs). Plugin author metadata intentionally contains a TODO until an author is supplied.

### License

This project is licensed under the [MIT License](LICENSE).

## 简体中文

纹理模型是一个 Blockbench 插件，可将图片转换为体素模型。插件读取图片像素并生成纯数据预览；每个**符合条件的像素都会对应一个独立 Cube**，且该 Cube 的六个面都会采样同一个纹理像素。

纹理 → 像素 → ModelPlan → 预览 → 在当前项目中创建一个 Cube 组。

插件界面会跟随 Blockbench 当前配置的语言。支持英文、简体中文和繁体中文；其他 Blockbench 语言会显示英文。

### 环境要求与安装

- Blockbench 5.1.0 或更新版本，支持桌面版和网页版。
- 当前打开的可编辑模型项目必须支持 Cube 和逐面 UV。通用模型格式可用；强制使用 Box UV、只能使用单一纹理或按组指定纹理的格式会在生成前被拒绝。

~~~sh
npm ci
npm run check
~~~

可直接安装的单文件插件为 [dist/texture_model.js](dist/texture_model.js)。在 Blockbench 中打开 **文件 → 插件 → 从文件加载插件**，选择该文件。修改源代码后重新构建：

~~~sh
npm run build
~~~

### 使用方法

1. 打开兼容的 Blockbench 模型项目。
2. 选择 **纹理模型 → 打开纹理模型生成器…**。
3. 选择 PNG、JPEG/JPG 或 WebP 图片。
4. 设置参数并点击 **预览**。拖动预览可旋转，滚动滚轮可缩放。
5. 确认 Cube 数量后，点击 **生成到工作区**。

生成的纹理和所有 Cube 都会放入一个新建的根 Group。执行一次撤销即可移除本次生成的全部内容；重做可恢复。

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| 处理方式 | 按行 | 按行和按像素会生成相同的 Cube，只影响任务调度。 |
| 体素尺寸 | 1 | 每个 Cube 的宽、高和厚度。 |
| 透明度阈值 | 0 | 仅当原像素 alpha 严格大于阈值时生成。 |
| 包含透明像素 | 关闭 | 开启后每个像素都会生成 Cube，并保留原纹理透明度。 |
| 居中模型 | 开启 | 将已生成体素的边界中心移到世界原点附近。 |
| Group 名称 | 图片文件名 + `_texture_model` | 名称冲突时会自动生成唯一名称。 |
| Cube 数量上限 | 20,000 | 可在“高级设置”中调整为 1,000 至 100,000。 |

修改任何生成参数都会让预览失效，必须重新预览后才能生成。预览不会创建 Blockbench Cube、Group 或 Texture。预览颜色是轻量级视觉近似；最终模型使用原始图片纹理。

### 性能

Cube 数量随符合条件的像素数增加：全不透明的 128 × 128 图片会生成 **16,384 个 Cube**。超过 8,000 个时显示性能警告；超过当前上限时禁止生成。大型模型可能降低 Blockbench 响应速度，尤其是将上限提高到 100,000 时。插件不会合并 Cube。

图片到 ModelPlan 的计算会分批让出 UI，并支持取消。写入 Blockbench 的最终步骤是同步执行的，因此纹理、Group 和所有 Cube 都纳入同一次撤销操作。

### 开发

~~~sh
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
npm run fixtures
~~~

源代码位于 [src](src)，自动化测试位于 [tests](tests)，架构与验证说明位于 [docs](docs)。在作者身份确认前，插件元数据中的作者字段保留 TODO。

### 许可证

本项目使用 [MIT 许可证](LICENSE)。
