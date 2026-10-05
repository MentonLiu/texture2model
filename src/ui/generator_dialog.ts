export function createGeneratorDialog(): Dialog {
  return new Dialog({
    id: 'texture_model_generator',
    title: '纹理模型生成器',
    width: 720,
    resizable: 'xy',
    lines: ['<div class="texture-model-shell">选择纹理、预览并生成体素模型的工作区。</div>'],
    buttons: ['关闭']
  });
}
