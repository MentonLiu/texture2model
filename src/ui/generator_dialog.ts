import { CancellationToken, TaskCancelledError } from '../domain/cancellation';
import { buildAlphaHistogram, countFromAlphaHistogram, type AlphaHistogram } from '../domain/alpha_histogram';
import { decodeImageFile } from '../domain/image_decoder';
import { planModel } from '../domain/model_planner';
import { defaultGroupName } from '../domain/naming';
import { getVoxelLimitStatus, validateMaxVoxels, validatePlannerOptions } from '../domain/validation';
import { errorMessage, tr } from '../i18n';
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

function buildMarkup(): string {
  return [
  '<div class="texture-model-shell"><div class="texture-model-columns">',
  '<div class="texture-model-controls">',
  '<section><h3>' + tr('section.texture') + '</h3>',
  '<div class="texture-model-import"><label class="texture-model-file">',
  '<span class="material-icons" aria-hidden="true">add_photo_alternate</span><span>' + tr('field.choose_texture') + '</span>',
  '<input data-field="file" type="file" accept="image/png,.png" aria-label="' + tr('field.choose_texture') + '"></label>',
  '<img data-output="thumbnail" class="texture-model-thumbnail" alt="' + tr('field.thumbnail_alt') + '" hidden></div>',
  '<span data-output="filename" class="texture-model-filename" hidden></span></section>',
  '<section><h3>' + tr('section.settings') + '</h3>',
  '<label>' + tr('field.processing_mode') + ' <span class="texture-model-select"><select data-field="processingMode"><option value="pixel" selected>' + tr('field.pixel_mode') + '</option><option value="row">' + tr('field.row_mode') + '</option><option value="column">' + tr('field.column_mode') + '</option></select><span class="texture-model-select-arrow" aria-hidden="true">▾</span></span></label>',
  '<label>' + tr('field.voxel_size') + ' <input data-field="voxelSize" type="number" min="0.01" step="0.1" value="1" required></label>',
  '<label>' + tr('field.alpha_threshold') + ' <input data-field="alphaThreshold" type="number" min="0" max="255" step="1" value="0" required></label>',
  '<label class="texture-model-checkbox"><input data-field="includeTransparent" type="checkbox"> ' + tr('field.include_transparent') + '</label>',
  '<label class="texture-model-checkbox"><input data-field="centerModel" type="checkbox" checked> ' + tr('field.center_model') + '</label>',
  '<label>' + tr('field.group_name') + ' <input data-field="groupName" type="text" value="texture_model"></label>',
  '<details><summary>' + tr('section.advanced') + '</summary>',
  '<label>' + tr('field.max_cubes') + ' <input data-field="maxVoxels" type="number" min="1000" max="100000" step="1" value="20000" required></label>',
  '<small>' + tr('note.performance') + '</small></details></section>',
  '<p class="texture-model-status" data-output="status" role="status" hidden></p>',
  '<div class="texture-model-actions"><button type="button" data-action="preview" disabled>' + tr('action.preview') + '</button>',
  '<button type="button" data-action="generate" disabled>' + tr('action.generate') + '</button></div>',
  '</div><div class="texture-model-preview-wrap">',
  '<canvas data-output="preview" class="texture-model-preview" aria-label="' + tr('preview.aria_label') + '"></canvas>',
  '<p>' + tr('preview.controls') + '</p></div></div></div>'
  ].join('');
}

function required<T extends Element>(root: Element, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error('Generator control is missing: ' + selector);
  return element;
}

function messageOf(error: unknown): string {
  return errorMessage(error);
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
    this.field<HTMLInputElement>('file').value = '';
    this.output('filename').hidden = true;
    this.output('thumbnail').hidden = true;
    this.output('thumbnail').removeAttribute('src');
    this.setStatus('');
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
    const filename = this.output('filename');
    filename.textContent = file?.name ?? '';
    filename.hidden = !file;
    this.updateState();
    if (!file) {
      this.setStatus('');
      return;
    }
    const token = this.replaceTask();
    const revision = this.revision;
    this.setStatus(tr('status.reading_image'));
    try {
      const image = await decodeImageFile(file, token);
      if (token.cancelled || revision !== this.revision) return;
      this.image = image;
      this.alphaHistogram = buildAlphaHistogram(image);
      this.field<HTMLInputElement>('groupName').value = defaultGroupName(image.fileName);
      thumbnail.src = image.dataURL;
      thumbnail.hidden = false;
      this.setStatus(tr('status.image_loaded'));
      this.updateState();
    } catch (error) {
      if (!token.cancelled && revision === this.revision && !(error instanceof TaskCancelledError)) {
        this.setStatus(messageOf(error), 'error');
      }
    }
  }

  private options(): GeneratorOptions {
    const options: GeneratorOptions = {
      processingMode: this.field<HTMLSelectElement>('processingMode').value as ProcessingMode,
      voxelSize: this.field<HTMLInputElement>('voxelSize').valueAsNumber,
      alphaThreshold: this.field<HTMLInputElement>('alphaThreshold').valueAsNumber,
      includeTransparent: this.field<HTMLInputElement>('includeTransparent').checked,
      centerModel: this.field<HTMLInputElement>('centerModel').checked,
      groupName: this.field<HTMLInputElement>('groupName').value.trim() || 'texture_model',
      maxVoxels: this.field<HTMLInputElement>('maxVoxels').valueAsNumber
    };
    validatePlannerOptions(options);
    validateMaxVoxels(options.maxVoxels);
    return options;
  }

  private setStatus(message: string, level: 'normal' | 'warning' | 'error' = 'normal'): void {
    const status = this.output('status');
    status.textContent = message;
    status.dataset.level = level;
    status.hidden = !message;
  }

  private updateState(): void {
    const previewButton = required<HTMLButtonElement>(this.root, '[data-action="preview"]');
    const generateButton = required<HTMLButtonElement>(this.root, '[data-action="generate"]');
    if (!this.image || !this.alphaHistogram) {
      previewButton.disabled = true;
      generateButton.disabled = true;
      return;
    }
    try {
      const options = this.options();
      const counts = countFromAlphaHistogram(
        this.alphaHistogram, options.alphaThreshold, options.includeTransparent
      );
      const limit = getVoxelLimitStatus(counts.voxelCount, options.maxVoxels);
      previewButton.disabled = limit === 'exceeded';
      generateButton.disabled = limit === 'exceeded' ||
        !this.plan || this.previewRevision !== this.revision;
      if (limit === 'exceeded') {
        this.setStatus(tr('status.over_limit', [counts.voxelCount, options.maxVoxels]), 'error');
      } else if (limit === 'warning') {
        this.setStatus(tr('status.performance_warning', [counts.voxelCount]), 'warning');
      } else if (this.previewRevision !== this.revision) {
        this.setStatus(tr('status.preview_stale'));
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
    this.setStatus(tr('status.planning'));
    try {
      const plan = await planModel(image, options, {
        token,
        onProgress: (processed, total) => {
          const percent = Math.round(processed / total * 100);
          if (!token.cancelled && percent !== lastPercent) {
            lastPercent = percent;
            this.setStatus(tr('status.planning') + ' ' + percent + '%');
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
        this.setStatus(tr('status.preview_ready'));
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
        this.setStatus(tr('status.write_unavailable'));
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
  content.innerHTML = buildMarkup();
  const dialog = new Dialog({
    id: 'texture_model_generator',
    title: tr('dialog.title'),
    width: 920,
    resizable: 'xy',
    lines: [content],
    buttons: [tr('dialog.cancel')],
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
