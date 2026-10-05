import { createGeneratorDialog } from './ui/generator_dialog';
import { pluginStyles } from './ui/styles';

let generatorDialog: Dialog | undefined;
let generatorAction: Action | undefined;
let aboutAction: Action | undefined;
let textureMenu: BarMenu | undefined;
let style: Deletable | undefined;

BBPlugin.register('texture_model', {
  title: 'Texture Model',
  author: 'TODO: set plugin author',
  description: 'Generate one textured cube for each selected image pixel.',
  icon: 'view_in_ar',
  version: '0.1.0',
  variant: 'both',
  min_version: '5.1.0',
  onload() {
    style = Blockbench.addCSS(pluginStyles);
    generatorAction = new Action('texture_model_open_generator', {
      name: '打开纹理模型生成器…',
      icon: 'image',
      click() {
        generatorDialog ??= createGeneratorDialog();
        generatorDialog.show();
      }
    });
    aboutAction = new Action('texture_model_about', {
      name: '关于插件',
      icon: 'info',
      click() {
        Blockbench.showMessageBox({
          title: '纹理模型',
          message: 'Texture Model 0.1.0\n将图片像素转换为 Blockbench 体素模型。',
          buttons: ['确定']
        });
      }
    });
    textureMenu = new BarMenu('texture_model_menu', [generatorAction, aboutAction], {
      name: '纹理模型',
      icon: 'view_in_ar'
    });
    MenuBar.addMenu(textureMenu, 'tools');
  },
  onunload() {
    generatorDialog?.delete();
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
