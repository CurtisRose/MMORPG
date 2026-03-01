import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Runescape/' : '/',
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        mapEditor: path.resolve(__dirname, 'map-editor.html'),
      },
    },
  },
}));