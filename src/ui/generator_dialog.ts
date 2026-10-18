import { CancellationToken, TaskCancelledError } from '../domain/cancellation';
import { buildAlphaHistogram, countFromAlphaHistogram, type AlphaHistogram } from '../domain/alpha_histogram';
import { decodeImageFile } from '../domain/image_decoder';
import { planModel } from '../domain/model_planner';
import { defaultGroupName } from '../domain/naming';
import { getVoxelLimitStatus, validateMaxVoxels, validatePlannerOptions } from '../domain/validation';
import { errorMessage, tr } from '../i18n';
import { PreviewRenderer } from '../preview/preview_renderer';
import type { DecodedImage, GeneratorOptions, ModelOrientation, ModelPlan, ProcessingMode } from '../types';

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
  '<label>' + tr('field.orientation') + ' <span class="texture-model-select"><select data-field="orientation"><option value="upright" selected>' + tr('field.upright') + '</option><option value="flat">' + tr('field.flat') + '</option></select><span class="texture-model-select-arrow" aria-hidden="true">▾</span></span></label>',
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
  '<div class="texture-model-actions"><button type="button" data-action="generate" disabled>' + tr('action.generate') + '</button></div>',
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
  private decodeToken?: CancellationToken;
  private previewToken?: CancellationToken;
  private previewFrame?: number;
  private disposed = false;
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
    this.clearPreview();
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
      'processingMode', 'orientation', 'voxelSize', 'alphaThreshold', 'includeTransparent',
      'centerModel', 'groupName', 'maxVoxels'
    ]) {
      const field = this.field<HTMLInputElement | HTMLSelectElement>(name);
      const event = field.tagName === 'SELECT' || field.type === 'checkbox' ? 'change' : 'input';
      this.listen(field, event, () => this.schedulePreview());
    }
    this.listen(required(this.root, '[data-action="generate"]'), 'click', () => {
      this.generate();
    });
  }

  private invalidatePreview(): void {
    this.revision += 1;
    this.previewRevision = -1;
    this.plan = undefined;
    this.previewToken?.cancel();
    this.previewToken = undefined;
    if (this.previewFrame !== undefined) cancelAnimationFrame(this.previewFrame);
    this.previewFrame = undefined;
    required<HTMLButtonElement>(this.root, '[data-action="generate"]').disabled = true;
  }

  private setPreviewBusy(busy: boolean): void {
    this.output('preview').setAttribute('aria-busy', String(busy));
  }

  private clearPreview(): void {
    if (this.renderer) this.renderer.clear();
    else {
      const canvas = this.output<HTMLCanvasElement>('preview');
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }
    this.setPreviewBusy(false);
  }

  private schedulePreview(): void {
    if (this.disposed) return;
    this.invalidatePreview();
    // Settings must not cancel an image that is still being decoded.
    if (!this.image || !this.alphaHistogram) return;
    if (!this.updateState()) {
      this.clearPreview();
      return;
    }
    this.setPreviewBusy(true);
    // Coalesce edits in one display frame without waiting for blur or a button.
    this.previewFrame = requestAnimationFrame(() => {
      this.previewFrame = undefined;
      void this.preview();
    });
  }

  private async selectImage(): Promise<void> {
    if (this.disposed) return;
    const file = this.field<HTMLInputElement>('file').files?.[0];
    this.decodeToken?.cancel();
    this.decodeToken = undefined;
    this.invalidatePreview();
    this.image = undefined;
    this.alphaHistogram = undefined;
    this.clearPreview();
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
    const token = new CancellationToken();
    this.decodeToken = token;
    const groupName = this.field<HTMLInputElement>('groupName');
    const previousGroupName = groupName.value;
    this.setStatus(tr('status.reading_image'));
    this.setPreviewBusy(true);
    try {
      const image = await decodeImageFile(file, token);
      if (this.disposed || token.cancelled || this.decodeToken !== token) return;
      this.image = image;
      this.alphaHistogram = buildAlphaHistogram(image);
      if (groupName.value === previousGroupName) groupName.value = defaultGroupName(image.fileName);
      thumbnail.src = image.dataURL;
      thumbnail.hidden = false;
      this.schedulePreview();
    } catch (error) {
      if (!this.disposed && !token.cancelled && this.decodeToken === token &&
          !(error instanceof TaskCancelledError)) {
        this.clearPreview();
        this.setStatus(messageOf(error), 'error');
      }
    } finally {
      if (this.decodeToken === token) this.decodeToken = undefined;
    }
  }

  private options(): GeneratorOptions {
    const options: GeneratorOptions = {
      processingMode: this.field<HTMLSelectElement>('processingMode').value as ProcessingMode,
      orientation: this.field<HTMLSelectElement>('orientation').value as ModelOrientation,
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

  private updateState(): boolean {
    const generateButton = required<HTMLButtonElement>(this.root, '[data-action="generate"]');
    generateButton.disabled = true;
    if (!this.image || !this.alphaHistogram) {
      return false;
    }
    try {
      const options = this.options();
      const counts = countFromAlphaHistogram(
        this.alphaHistogram, options.alphaThreshold, options.includeTransparent
      );
      const limit = getVoxelLimitStatus(counts.voxelCount, options.maxVoxels);
      if (limit === 'exceeded') {
        this.setStatus(tr('status.over_limit', [counts.voxelCount, options.maxVoxels]), 'error');
        return false;
      }
      const ready = this.plan !== undefined && this.previewRevision === this.revision;
      generateButton.disabled = !ready;
      if (!ready) {
        this.setStatus(tr('status.planning'));
      } else if (limit === 'warning') {
        this.setStatus(tr('status.performance_warning', [counts.voxelCount]), 'warning');
      } else {
        this.setStatus(tr('status.preview_ready'));
      }
      return true;
    } catch (error) {
      this.setStatus(messageOf(error), 'error');
      return false;
    }
  }

  private async preview(): Promise<void> {
    if (this.disposed || !this.image || !this.alphaHistogram) return;
    const image = this.image;
    let options: GeneratorOptions;
    try {
      options = this.options();
      const count = countFromAlphaHistogram(
        this.alphaHistogram, options.alphaThreshold, options.includeTransparent
      ).voxelCount;
      if (getVoxelLimitStatus(count, options.maxVoxels) === 'exceeded') {
        this.clearPreview();
        this.setStatus(tr('status.over_limit', [count, options.maxVoxels]), 'error');
        return;
      }
    } catch (error) {
      this.clearPreview();
      this.setStatus(messageOf(error), 'error');
      return;
    }
    const token = new CancellationToken();
    this.previewToken = token;
    const revision = this.revision;
    let lastPercent = -1;
    this.setStatus(tr('status.planning'));
    try {
      const plan = await planModel(image, options, {
        token,
        onProgress: (processed, total) => {
          const percent = Math.round(processed / total * 100);
          if (!this.disposed && !token.cancelled && revision === this.revision && percent !== lastPercent) {
            lastPercent = percent;
            this.setStatus(tr('status.planning') + ' ' + percent + '%');
          }
        }
      });
      if (this.disposed || token.cancelled || revision !== this.revision) return;
      this.renderer ??= new PreviewRenderer(this.output<HTMLCanvasElement>('preview'));
      this.renderer.render(plan);
      this.plan = plan;
      this.previewRevision = revision;
      this.setPreviewBusy(false);
      this.updateState();
    } catch (error) {
      // A cancelled task must never dispose a newer renderer or overwrite its status.
      if (this.disposed || token.cancelled || revision !== this.revision) return;
      this.renderer?.dispose();
      this.renderer = undefined;
      this.clearPreview();
      if (!(error instanceof TaskCancelledError)) this.setStatus(messageOf(error), 'error');
    } finally {
      if (this.previewToken === token) this.previewToken = undefined;
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
    this.disposed = true;
    this.decodeToken?.cancel();
    this.decodeToken = undefined;
    this.invalidatePreview();
    this.setPreviewBusy(false);
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
