import { resolve } from 'path'
import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  build: {
    rollupOptions: {
      input: [
        resolve(__dirname, 'index.html'),
        resolve(__dirname, 'src/js/index.html'),
        resolve(__dirname, 'src/wasm/index.html'),
        resolve(__dirname, 'src/webgpu/index.html'),
        resolve(__dirname, 'src/webgpu/error.html'),
      ],
    },
  },
  plugins: [
    topLevelAwait()
  ],
});
