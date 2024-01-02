import { init, step, getCellState } from "./build/release.js";

// canvas setup
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

// init
const width = canvas.width;
const height = canvas.height;
init({
  width,
  height,
  ACTIVE_ARGB:
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? 0xffffffff
      : 0xff000000,
  DEAD_ARGB: 0x00ffffff,
});

let start = performance.now();
let count = 0; // frame count
let fps = 0; // frames per second, exponential moving average
setInterval(() => {
  const elapsed = performance.now() - start;
  // Calculate the FPS
  if (fps == 0) {
    fps = count / elapsed * 1000;
  }
  fps = (0.9 * fps) + (0.1 * (count / elapsed) * 1000);
  // Reset the start time
  start = performance.now();
  count = 0;
}, 100);
setInterval(() => {
  document.querySelector("#fps").textContent =
    `Frames Per Second: ${fps.toFixed(2)}`;
}, 1000);

// draw grid based on the Uint32Array
const imageData = ctx.createImageData(width, height);
const argb = new Uint32Array(imageData.data.buffer);
function render() {
  step();
  argb.set(new Uint32Array(getCellState()));
  ctx.putImageData(imageData, 0, 0);
  count++; // Update the FPS counter
  requestAnimationFrame(render);
}

render();
