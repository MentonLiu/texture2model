import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: {
        Blockbench: 'readonly',
        Plugin: 'readonly',
        Action: 'readonly',
        Dialog: 'readonly',
        MenuBar: 'readonly',
        BarMenu: 'readonly',
        Cube: 'readonly',
        Group: 'readonly',
        Texture: 'readonly',
        Project: 'readonly',
        Format: 'readonly',
        Undo: 'readonly',
        Canvas: 'readonly',
        THREE: 'readonly',
        ImageData: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        document: 'readonly',
        window: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        HTMLCanvasElement: 'readonly'
      }
    }
  }
);
