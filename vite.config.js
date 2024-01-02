import { resolve } from 'path'
import { defineConfig } from "vite";
import { createHtmlPlugin } from "vite-plugin-html";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        js: resolve(__dirname, 'src/js/index.html'),
        wasm: resolve(__dirname, 'src/wasm/index.html'),
        webgpu: resolve(__dirname, 'src/webgpu/index.html'),
        webgpu_error: resolve(__dirname, 'src/webgpu/error.html'),
      },
    },
  },
  plugins: [
    createHtmlPlugin({
      minify: true,
    }),
    topLevelAwait()
  ],
});
