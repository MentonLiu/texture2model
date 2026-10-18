export const pluginStyles = `
.texture-model-shell {
  min-height: 400px;
  padding: 14px;
  color: var(--color-text);
}
.texture-model-columns { display: grid; grid-template-columns: minmax(320px, 1fr) minmax(300px, 1.2fr); gap: 16px; }
.texture-model-controls { max-height: min(75vh, 720px); overflow: auto; padding-right: 8px; }
.texture-model-controls section { margin-bottom: 14px; }
.texture-model-controls h3 { margin: 0 0 8px; font-size: 15px; }
.texture-model-controls label { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 7px 0; }
.texture-model-controls label input[type=number], .texture-model-controls label input[type=text],
.texture-model-controls label select { width: 160px; min-width: 0;
  box-sizing: border-box; min-height: 32px; padding: 5px 9px;
  border: 1px solid var(--color-accent); border-radius: 4px;
  background: var(--color-back); color: var(--color-text); }
.texture-model-controls label input:focus-visible,
.texture-model-controls label select:focus-visible {
  outline: 2px solid var(--color-accent); outline-offset: 2px;
}
.texture-model-select { position: relative; display: inline-flex; width: 160px; flex-shrink: 0; }
.texture-model-controls .texture-model-select select {
  width: 100%; appearance: none; -webkit-appearance: none; padding-right: 30px; cursor: pointer;
}
.texture-model-select-arrow {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  color: var(--color-accent); font-size: 20px; line-height: 1; pointer-events: none;
}
.texture-model-controls .texture-model-checkbox { justify-content: flex-start; }
.texture-model-import { display: flex; align-items: center; gap: 12px; }
.texture-model-controls .texture-model-file {
  position: relative; display: inline-flex; justify-content: center; flex: 1;
  min-height: 42px; margin: 0; padding: 8px 12px; box-sizing: border-box;
  border: 1px dashed var(--color-accent); border-radius: 5px;
  background: var(--color-back); cursor: pointer;
}
.texture-model-file:focus-within { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.texture-model-controls .texture-model-file input {
  position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;
}
.texture-model-thumbnail { display: block; width: 42px; height: 42px; object-fit: contain; image-rendering: pixelated; }
.texture-model-filename { display: block; margin-top: 6px; overflow-wrap: anywhere; font-size: 12px; }
.texture-model-shell [hidden] { display: none !important; }
.texture-model-status { margin: 9px 0; }
.texture-model-status[data-level=warning] { color: #e0ac37; }
.texture-model-status[data-level=error] { color: #e56363; }
.texture-model-actions { display: flex; gap: 8px; }
.texture-model-preview-wrap { min-height: 340px; display: flex; flex-direction: column; }
.texture-model-preview { flex: 1; display: block; width: 100%; min-height: 300px; background: #20252b; border-radius: 6px; cursor: grab; }
.texture-model-preview-wrap p { text-align: center; margin: 6px 0; opacity: .7; }
@media (max-width: 750px) { .texture-model-columns { grid-template-columns: 1fr; } }
`;
