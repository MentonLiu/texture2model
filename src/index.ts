import { writeModel } from './blockbench/model_writer';
import { registerTranslations, tr } from './i18n';
import { createGeneratorDialog, type GeneratorDialogHandle } from './ui/generator_dialog';
import { pluginStyles } from './ui/styles';

let generatorDialog: GeneratorDialogHandle | undefined;
let generatorAction: Action | undefined;
let aboutAction: Action | undefined;
let textureMenu: BarMenu | undefined;
let style: Deletable | undefined;

registerTranslations();

BBPlugin.register('texture_model', {
  title: tr('plugin.title'),
  author: 'TODO: set plugin author',
  description: tr('plugin.description'),
  icon: 'view_in_ar',
  version: '0.1.0',
  variant: 'both',
  min_version: '5.1.0',
  onload() {
    style = Blockbench.addCSS(pluginStyles);
    generatorAction = new Action('texture_model_open_generator', {
      name: tr('menu.generate'),
      icon: 'image',
      click() {
        generatorDialog ??= createGeneratorDialog((image, plan, options) => {
          writeModel(image, plan, options);
          Blockbench.showQuickMessage(tr('status.generated'));
        });
        generatorDialog.dialog.show();
      }
    });
    aboutAction = new Action('texture_model_about', {
      name: tr('menu.about'),
      icon: 'info',
      click() {
        Blockbench.showMessageBox({
          title: tr('about.title'),
          message: tr('about.message'),
          buttons: [tr('dialog.ok')]
        });
      }
    });
    textureMenu = new BarMenu('texture_model_menu', [generatorAction, aboutAction], {
      name: tr('menu.title'),
      icon: 'view_in_ar'
    });
    MenuBar.addMenu(textureMenu, 'tools');
  },
  onunload() {
    generatorDialog?.dispose();
    generatorDialog = undefined;
    textureMenu?.delete();
    textureMenu = undefined;
    generatorAction?.delete();
    generatorAction = undefined;
    aboutAction?.delete();
    aboutAction = undefined;
    style?.delete();
    style = undefined;
  }
});
