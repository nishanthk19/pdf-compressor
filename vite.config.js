import { defineConfig } from 'vite';
import { resolve } from 'path';

// Vite modern bundling & tooling configuration for Vibify Suite
export default defineConfig({
  root: 'public',
  server: {
    port: 3000,
    strictPort: true,
    host: '0.0.0.0'
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public/index.html'),
        compress: resolve(__dirname, 'public/tools/compress.html'),
        merge: resolve(__dirname, 'public/tools/merge.html'),
        extract: resolve(__dirname, 'public/tools/extract.html'),
        rotate: resolve(__dirname, 'public/tools/rotate.html'),
        delete: resolve(__dirname, 'public/tools/delete.html'),
        ocr: resolve(__dirname, 'public/tools/ocr.html'),
        word: resolve(__dirname, 'public/tools/word.html'),
        protect: resolve(__dirname, 'public/tools/protect.html'),
        unlock: resolve(__dirname, 'public/tools/unlock.html'),
        pdfMaker: resolve(__dirname, 'public/tools/pdf-maker.html'),
        archive: resolve(__dirname, 'public/tools/archive.html'),
        addText: resolve(__dirname, 'public/tools/add-text.html'),
        paginate: resolve(__dirname, 'public/paginate-editor.html')
      }
    }
  }
});
