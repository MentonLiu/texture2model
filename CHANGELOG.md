# Changelog

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
