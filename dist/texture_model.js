"use strict";
(() => {
  // src/ui/generator_dialog.ts
  function createGeneratorDialog() {
    return new Dialog({
      id: "texture_model_generator",
      title: "\u7EB9\u7406\u6A21\u578B\u751F\u6210\u5668",
      width: 720,
      resizable: "xy",
      lines: ['<div class="texture-model-shell">\u9009\u62E9\u7EB9\u7406\u3001\u9884\u89C8\u5E76\u751F\u6210\u4F53\u7D20\u6A21\u578B\u7684\u5DE5\u4F5C\u533A\u3002</div>'],
      buttons: ["\u5173\u95ED"]
    });
  }

  // src/ui/styles.ts
  var pluginStyles = `
.texture-model-shell {
  min-height: 260px;
  padding: 20px;
  color: var(--color-text);
}
`;

  // src/index.ts
  var generatorDialog;
  var generatorAction;
  var aboutAction;
  var textureMenu;
  var style;
  BBPlugin.register("texture_model", {
    title: "Texture Model",
    author: "TODO: set plugin author",
    description: "Generate one textured cube for each selected image pixel.",
    icon: "view_in_ar",
    version: "0.1.0",
    variant: "both",
    min_version: "4.8.0",
    onload() {
      style = Blockbench.addCSS(pluginStyles);
      generatorAction = new Action("texture_model_open_generator", {
        name: "\u6253\u5F00\u7EB9\u7406\u6A21\u578B\u751F\u6210\u5668\u2026",
        icon: "image",
        click() {
          generatorDialog ?? (generatorDialog = createGeneratorDialog());
          generatorDialog.show();
        }
      });
      aboutAction = new Action("texture_model_about", {
        name: "\u5173\u4E8E\u63D2\u4EF6",
        icon: "info",
        click() {
          Blockbench.showMessageBox({
            title: "\u7EB9\u7406\u6A21\u578B",
            message: "Texture Model 0.1.0\n\u5C06\u56FE\u7247\u50CF\u7D20\u8F6C\u6362\u4E3A Blockbench \u4F53\u7D20\u6A21\u578B\u3002",
            buttons: ["\u786E\u5B9A"]
          });
        }
      });
      textureMenu = new BarMenu("texture_model_menu", [generatorAction, aboutAction], {
        name: "\u7EB9\u7406\u6A21\u578B",
        icon: "view_in_ar"
      });
      MenuBar.addMenu(textureMenu, "tools");
    },
    onunload() {
      generatorDialog?.delete();
      generatorDialog = void 0;
      textureMenu?.delete();
      textureMenu = void 0;
      generatorAction?.delete();
      generatorAction = void 0;
      aboutAction?.delete();
      aboutAction = void 0;
      style?.delete();
      style = void 0;
    }
  });
})();
