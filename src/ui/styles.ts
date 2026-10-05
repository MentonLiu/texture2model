export const pluginStyles = `
.texture-model-shell {
  min-height: 400px;
  padding: 14px;
  color: var(--color-text);
}
.texture-model-columns { display: grid; grid-template-columns: minmax(310px, 1fr) minmax(300px, 1.2fr); gap: 16px; }
.texture-model-controls { max-height: min(75vh, 720px); overflow: auto; padding-right: 8px; }
.texture-model-controls section { margin-bottom: 14px; }
.texture-model-controls h3 { margin: 0 0 8px; font-size: 15px; }
.texture-model-controls label { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 7px 0; }
.texture-model-controls label input[type=number], .texture-model-controls label input[type=text],
.texture-model-controls label select { width: 130px; min-width: 0; }
.texture-model-controls .texture-model-checkbox { justify-content: flex-start; }
.texture-model-controls .texture-model-file { justify-content: flex-start; cursor: pointer; }
.texture-model-controls .texture-model-file input { max-width: 190px; }
.texture-model-thumbnail { display: block; max-width: 100%; max-height: 110px; margin: 8px 0; image-rendering: pixelated; }
.texture-model-thumbnail[hidden] { display: none; }
.texture-model-stats div { display: flex; justify-content: space-between; margin: 4px 0; }
.texture-model-status { min-height: 2.5em; margin: 9px 0; }
.texture-model-status[data-level=warning] { color: #e0ac37; }
.texture-model-status[data-level=error] { color: #e56363; }
.texture-model-actions { display: flex; gap: 8px; }
.texture-model-preview-wrap { min-height: 340px; display: flex; flex-direction: column; }
.texture-model-preview { flex: 1; display: block; width: 100%; min-height: 300px; background: #20252b; border-radius: 6px; cursor: grab; }
.texture-model-preview-wrap p { text-align: center; margin: 6px 0; opacity: .7; }
@media (max-width: 750px) { .texture-model-columns { grid-template-columns: 1fr; } }
`;
