// canvas setup
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

// init
const width = canvas.width;
const height = canvas.height;
const size = width * height;
const ACTIVE_ARGB =
  window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? 0xffffffff
    : 0xff000000;
const DEAD_ARGB = 0x00ffffff;
let cellStateIn = new Uint32Array(size);
let cellStateOut = new Uint32Array(size);
for (let i = 0; i < size; i++) {
  cellStateIn[i] = Math.random() > 0.6 ? ACTIVE_ARGB : DEAD_ARGB;
}

function cellIndex(x, y) {
  return (y % height) * width + (x % width);
}

function cellActive(x, y) {
  return cellStateIn[cellIndex(x, y)] == ACTIVE_ARGB ? 1 : 0;
}

function step() {
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      let activeNeighbors =
        cellActive(x + 1, y + 1) +
        cellActive(x + 1, y) +
        cellActive(x + 1, y - 1) +
        cellActive(x, y - 1) +
        cellActive(x - 1, y - 1) +
        cellActive(x - 1, y) +
        cellActive(x - 1, y + 1) +
        cellActive(x, y + 1);

      let i = cellIndex(x, y);

      // Conway's game of life rules:
      switch (activeNeighbors) {
        case 2:
          cellStateOut[i] = cellStateIn[i];
          break;
        case 3:
          cellStateOut[i] = ACTIVE_ARGB;
          break;
        default:
          cellStateOut[i] = DEAD_ARGB;
      }
    }
  }
  [cellStateIn, cellStateOut] = [cellStateOut, cellStateIn];
}

let start = performance.now();
let count = 0; // frame count
let fps = 0; // frames per second, exponential moving average
let time = 0; // simulation time, exponential moving average
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
    `Frames Per Second: ${fps.toFixed(0)}`;
  document.querySelector("#time").textContent =
    `Simulation Time: ${(time).toFixed(2)}ms`;
}, 1000);

// draw grid based on the Uint32Array
const imageData = ctx.createImageData(width, height);
const argb = new Uint32Array(imageData.data.buffer);
function render() {
  const simStart = performance.now();
  step();
  // Calculate the simulation time
  time = (0.9 * time) + (0.1 * (performance.now() - simStart));
  argb.set(cellStateIn);
  ctx.putImageData(imageData, 0, 0);
  count++; // Update the FPS counter
  requestAnimationFrame(render);
}

render();
