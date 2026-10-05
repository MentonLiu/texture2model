import { CancellationToken, TaskCancelledError } from '../domain/cancellation';
import { buildAlphaHistogram, countFromAlphaHistogram, type AlphaHistogram } from '../domain/alpha_histogram';
import { decodeImageFile } from '../domain/image_decoder';
import { planModel } from '../domain/model_planner';
import { defaultGroupName } from '../domain/naming';
import { getVoxelLimitStatus, validateMaxVoxels, validatePlannerOptions } from '../domain/validation';
import { PreviewRenderer } from '../preview/preview_renderer';
import type { DecodedImage, GeneratorOptions, ModelPlan, ProcessingMode } from '../types';

export interface GeneratorDialogHandle {
  dialog: Dialog;
  dispose(): void;
}

export type GenerateHandler = (
  image: DecodedImage,
  plan: ModelPlan,
  options: GeneratorOptions
) => void;

const markup = [
  '<div class="texture-model-shell"><div class="texture-model-columns">',
  '<div class="texture-model-controls">',
  '<section><h3>纹理</h3>',
  '<label class="texture-model-file">选择纹理 <input data-field="file" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"></label>',
  '<span data-output="filename">未选择图片</span>',
  '<img data-output="thumbnail" class="texture-model-thumbnail" alt="纹理缩略图" hidden></section>',
  '<section><h3>生成设置</h3>',
  '<label>处理方式 <select data-field="processingMode"><option value="row">按行</option><option value="pixel">按像素</option></select></label>',
  '<label>Voxel Size <input data-field="voxelSize" type="number" min="0.01" step="0.1" value="1"></label>',
  '<label>Alpha Threshold <input data-field="alphaThreshold" type="number" min="0" max="255" step="1" value="0"></label>',
  '<label class="texture-model-checkbox"><input data-field="includeTransparent" type="checkbox"> 包含透明像素</label>',
  '<label class="texture-model-checkbox"><input data-field="centerModel" type="checkbox" checked> 居中模型</label>',
  '<label>Group Name <input data-field="groupName" type="text" value="texture_model"></label>',
  '<details><summary>高级设置</summary>',
  '<label>最大 Cube 数 <input data-field="maxVoxels" type="number" min="1000" max="100000" step="1" value="20000"></label>',
  '<small>大量 Cube 会严重影响 Blockbench 性能。</small></details></section>',
  '<section class="texture-model-stats"><h3>统计</h3>',
  '<div>图片尺寸 <strong data-output="dimensions">—</strong></div>',
  '<div>总像素数 <strong data-output="totalPixels">—</strong></div>',
  '<div>可见像素数 <strong data-output="visiblePixels">—</strong></div>',
  '<div>预计 Cube 数 <strong data-output="voxelCount">—</strong></div>',
  '<div>预计模型尺寸 <strong data-output="modelSize">—</strong></div></section>',
  '<p class="texture-model-status" data-output="status" role="status">请选择 PNG、JPEG 或 WebP 图片。</p>',
  '<div class="texture-model-actions"><button type="button" data-action="preview" disabled>预览</button>',
  '<button type="button" data-action="generate" disabled>生成到工作区</button></div>',
  '</div><div class="texture-model-preview-wrap">',
  '<canvas data-output="preview" class="texture-model-preview" aria-label="模型预览"></canvas>',
  '<p>拖动旋转 · 滚轮缩放</p></div></div></div>'
].join('');

function required<T extends Element>(root: Element, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error('Generator control is missing: ' + selector);
  return element;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class GeneratorController {
  private readonly root: HTMLElement;
  private readonly cleanup: Array<() => void> = [];
  private token?: CancellationToken;
  private revision = 0;
  private previewRevision = -1;
  private image?: DecodedImage;
  private alphaHistogram?: AlphaHistogram;
  private plan?: ModelPlan;
  private renderer?: PreviewRenderer;

  constructor(private readonly dialog: Dialog, private readonly onGenerate?: GenerateHandler) {
    this.root = required<HTMLElement>(dialog.object, '.texture-model-shell');
    this.bind();
    this.updateState();
  }

  private field<T extends HTMLElement>(name: string): T {
    return required<T>(this.root, '[data-field="' + name + '"]');
  }

  private output<T extends HTMLElement>(name: string): T {
    return required<T>(this.root, '[data-output="' + name + '"]');
  }

  private listen(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    this.cleanup.push(() => target.removeEventListener(type, handler));
  }

  private bind(): void {
    this.listen(this.field<HTMLInputElement>('file'), 'change', () => { void this.selectImage(); });
    for (const name of [
      'processingMode', 'voxelSize', 'alphaThreshold', 'includeTransparent',
      'centerModel', 'groupName', 'maxVoxels'
    ]) {
      const field = this.field<HTMLElement>(name);
      this.listen(field, 'input', () => this.invalidate());
      this.listen(field, 'change', () => this.invalidate());
    }
    this.listen(required(this.root, '[data-action="preview"]'), 'click', () => {
      void this.preview();
    });
    this.listen(required(this.root, '[data-action="generate"]'), 'click', () => {
      this.generate();
    });
  }

  private replaceTask(): CancellationToken {
    this.token?.cancel();
    this.token = new CancellationToken();
    return this.token;
  }

  private invalidate(): void {
    this.revision += 1;
    this.previewRevision = -1;
    this.plan = undefined;
    this.replaceTask();
    this.renderer?.dispose();
    this.renderer = undefined;
    this.updateState();
  }

  private async selectImage(): Promise<void> {
    const file = this.field<HTMLInputElement>('file').files?.[0];
    this.invalidate();
    this.image = undefined;
    this.alphaHistogram = undefined;
    const thumbnail = this.output<HTMLImageElement>('thumbnail');
    thumbnail.hidden = true;
    thumbnail.removeAttribute('src');
    this.output('filename').textContent = file?.name ?? '未选择图片';
    this.updateState();
    if (!file) return;
    const token = this.replaceTask();
    const revision = this.revision;
    this.setStatus('正在读取图片…');
    try {
      const image = await decodeImageFile(file, token);
      if (token.cancelled || revision !== this.revision) return;
      this.image = image;
      this.alphaHistogram = buildAlphaHistogram(image);
      this.field<HTMLInputElement>('groupName').value = defaultGroupName(image.fileName);
      thumbnail.src = image.dataURL;
      thumbnail.hidden = false;
      this.setStatus('图片已加载。请点击预览。');
      this.updateState();
    } catch (error) {
      if (!(error instanceof TaskCancelledError)) this.setStatus(messageOf(error), 'error');
    }
  }

  private options(): GeneratorOptions {
    const options: GeneratorOptions = {
      processingMode: this.field<HTMLSelectElement>('processingMode').value as ProcessingMode,
      voxelSize: Number(this.field<HTMLInputElement>('voxelSize').value),
      alphaThreshold: Number(this.field<HTMLInputElement>('alphaThreshold').value),
      includeTransparent: this.field<HTMLInputElement>('includeTransparent').checked,
      centerModel: this.field<HTMLInputElement>('centerModel').checked,
      groupName: this.field<HTMLInputElement>('groupName').value.trim() || 'texture_model',
      maxVoxels: Number(this.field<HTMLInputElement>('maxVoxels').value)
    };
    validatePlannerOptions(options);
    validateMaxVoxels(options.maxVoxels);
    return options;
  }

  private setStatus(message: string, level: 'normal' | 'warning' | 'error' = 'normal'): void {
    const status = this.output('status');
    status.textContent = message;
    status.dataset.level = level;
  }

  private updateState(): void {
    const previewButton = required<HTMLButtonElement>(this.root, '[data-action="preview"]');
    const generateButton = required<HTMLButtonElement>(this.root, '[data-action="generate"]');
    if (!this.image || !this.alphaHistogram) {
      for (const name of ['dimensions', 'totalPixels', 'visiblePixels', 'voxelCount', 'modelSize']) {
        this.output(name).textContent = '—';
      }
      previewButton.disabled = true;
      generateButton.disabled = true;
      return;
    }
    try {
      const options = this.options();
      const counts = countFromAlphaHistogram(
        this.alphaHistogram, options.alphaThreshold, options.includeTransparent
      );
      this.output('dimensions').textContent = this.image.width + ' × ' + this.image.height;
      this.output('totalPixels').textContent = String(counts.totalPixels);
      this.output('visiblePixels').textContent = String(counts.visiblePixels);
      this.output('voxelCount').textContent = String(counts.voxelCount);
      this.output('modelSize').textContent = [
        this.image.width * options.voxelSize,
        this.image.height * options.voxelSize,
        options.voxelSize
      ].join(' × ');
      const limit = getVoxelLimitStatus(counts.voxelCount, options.maxVoxels);
      previewButton.disabled = limit === 'exceeded';
      generateButton.disabled = limit === 'exceeded' ||
        !this.plan || this.previewRevision !== this.revision;
      if (limit === 'exceeded') {
        this.setStatus('预计 ' + counts.voxelCount + ' 个 Cube，超过上限 ' + options.maxVoxels + '。', 'error');
      } else if (limit === 'warning') {
        this.setStatus('预计 ' + counts.voxelCount + ' 个 Cube；大量 Cube 会严重影响 Blockbench 性能。', 'warning');
      } else if (this.previewRevision !== this.revision) {
        this.setStatus('配置已更改，请重新预览。');
      }
    } catch (error) {
      previewButton.disabled = true;
      generateButton.disabled = true;
      this.setStatus(messageOf(error), 'error');
    }
  }

  private async preview(): Promise<void> {
    if (!this.image || !this.alphaHistogram) return;
    const image = this.image;
    let options: GeneratorOptions;
    try {
      options = this.options();
      const count = countFromAlphaHistogram(
        this.alphaHistogram, options.alphaThreshold, options.includeTransparent
      ).voxelCount;
      if (getVoxelLimitStatus(count, options.maxVoxels) === 'exceeded') return;
    } catch (error) {
      this.setStatus(messageOf(error), 'error');
      return;
    }
    this.invalidate();
    const token = this.replaceTask();
    const revision = this.revision;
    let lastPercent = -1;
    this.setStatus('正在规划模型…');
    try {
      const plan = await planModel(image, options, {
        token,
        onProgress: (processed, total) => {
          const percent = Math.round(processed / total * 100);
          if (!token.cancelled && percent !== lastPercent) {
            lastPercent = percent;
            this.setStatus('正在规划模型… ' + percent + '%');
          }
        }
      });
      if (token.cancelled || revision !== this.revision) return;
      this.renderer = new PreviewRenderer(this.output<HTMLCanvasElement>('preview'));
      this.renderer.render(plan);
      this.plan = plan;
      this.previewRevision = revision;
      this.updateState();
      if (getVoxelLimitStatus(plan.voxelCount, options.maxVoxels) === 'ok') {
        this.setStatus('预览就绪：' + plan.voxelCount + ' 个 Cube。');
      }
    } catch (error) {
      this.renderer?.dispose();
      this.renderer = undefined;
      if (!(error instanceof TaskCancelledError)) this.setStatus(messageOf(error), 'error');
    }
  }

  private generate(): void {
    if (!this.image || !this.plan || this.previewRevision !== this.revision) return;
    try {
      const options = this.options();
      if (getVoxelLimitStatus(this.plan.voxelCount, options.maxVoxels) === 'exceeded') return;
      if (!this.onGenerate) {
        this.setStatus('工作区写入将在下一阶段接入。');
        return;
      }
      this.onGenerate(this.image, this.plan, options);
      this.dialog.close();
    } catch (error) {
      this.setStatus(messageOf(error), 'error');
    }
  }

  resize(): void { this.renderer?.resize(); }

  dispose(): void {
    this.token?.cancel();
    this.renderer?.dispose();
    this.renderer = undefined;
    for (const cleanup of this.cleanup) cleanup();
    this.cleanup.length = 0;
    this.image = undefined;
    this.alphaHistogram = undefined;
    this.plan = undefined;
  }
}

export function createGeneratorDialog(onGenerate?: GenerateHandler): GeneratorDialogHandle {
  let controller: GeneratorController | undefined;
  const content = document.createElement('div');
  content.innerHTML = markup;
  const dialog = new Dialog({
    id: 'texture_model_generator',
    title: '纹理模型生成器',
    width: 920,
    resizable: 'xy',
    lines: [content],
    buttons: ['取消'],
    onOpen() {
      controller?.dispose();
      controller = new GeneratorController(dialog, onGenerate);
    },
    onClose() {
      controller?.dispose();
      controller = undefined;
    },
    onResize() { controller?.resize(); }
  });
  return {
    dialog,
    dispose() {
      controller?.dispose();
      controller = undefined;
      dialog.delete();
    }
  };
}
