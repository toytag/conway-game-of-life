import errorHTML from "./error.html?raw";

// canvas setup
const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const ctx = canvas.getContext("2d")!;

// WebGPU init
if (!navigator.gpu) {
  document.querySelector<HTMLDivElement>("#content")!.innerHTML = errorHTML;
  throw new Error("WebGPU not supported on this browser.");
}
const adapter = await navigator.gpu.requestAdapter({
  powerPreference: "low-power",
});
if (!adapter) {
  document.querySelector<HTMLDivElement>("#content")!.innerHTML = errorHTML;
  throw new Error("No appropriate GPUAdapter found.");
}
const device = await adapter.requestDevice();

console.log(device);

// ------------------------------
// uniform and "storage" buffer
const width = canvas.width;
const height = canvas.height;
// const size = width * height;
const ACTIVE_ARGB =
  window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? 0xffffffff
    : 0xff000000;
const DEAD_ARGB = 0x00ffffff;
// Create a uniform buffer that describes the grid.
const uniformArray = new Float32Array([width, height]);
const uniformBuffer = device.createBuffer({
  label: "Grid Uniforms",
  size: uniformArray.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);
// Create an array representing the active state of each cell.
const cellStateArray = new Uint32Array(width * height);
// Create two storage buffers to hold the cell state.
const cellStateStorage = [
  device.createBuffer({
    label: "Cell State A",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  }),
  device.createBuffer({
    label: "Cell State B",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  }),
];
// Mark every third cell of the first grid as active.
for (let i = 0; i < cellStateArray.length; ++i) {
  cellStateArray[i] = Math.random() > 0.6 ? ACTIVE_ARGB : DEAD_ARGB;
}
device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);
// Create a read buffer to read the cell state back from the GPU.
const cellState = device.createBuffer({
  label: "Cell State Read",
  size: cellStateArray.byteLength,
  usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});

// Create the bind group layout.
const bindGroupLayout = device.createBindGroupLayout({
  label: "Cell Bind Group Layout",
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "uniform" }, // Grid uniform buffer
    },
    {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "read-only-storage" }, // Cell state input buffer
    },
    {
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "storage" }, // Cell state output buffer
    },
  ],
});

// Create a bind group to pass the grid uniforms into the pipeline
const bindGroups = [
  device.createBindGroup({
    label: "Cell renderer bind group A",
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: { buffer: cellStateStorage[0] },
      },
      {
        binding: 2,
        resource: { buffer: cellStateStorage[1] },
      },
    ],
  }),
  device.createBindGroup({
    label: "Cell renderer bind group B",
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: { buffer: cellStateStorage[1] },
      },
      {
        binding: 2,
        resource: { buffer: cellStateStorage[0] },
      },
    ],
  }),
];

const WORKGROUP_SIZE = [8, 8]; // Block dim in CUDA
// Create the compute shader that will process the simulation.
const simulationShaderModule = device.createShaderModule({
  label: "Game of Life simulation shader",
  code: `
    @group(0) @binding(0) var<uniform> grid: vec2f;

    @group(0) @binding(1) var<storage, read> cellStateIn: array<u32>;
    @group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;

    fn cellIndex(cell: vec2u) -> u32 {
      return (cell.y % u32(grid.y)) * u32(grid.x) + (cell.x % u32(grid.x));
    }

    fn cellActive(x: u32, y: u32) -> u32 {
      return select(0u, 1u, cellStateIn[cellIndex(vec2(x, y))] == ${ACTIVE_ARGB}u);
    }

    @compute @workgroup_size(${WORKGROUP_SIZE})
    fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
      let activeNeighbors = cellActive(cell.x + 1, cell.y + 1) +
                            cellActive(cell.x + 1, cell.y    ) +
                            cellActive(cell.x + 1, cell.y - 1) +
                            cellActive(cell.x,     cell.y - 1) +
                            cellActive(cell.x - 1, cell.y - 1) +
                            cellActive(cell.x - 1, cell.y    ) +
                            cellActive(cell.x - 1, cell.y + 1) +
                            cellActive(cell.x,     cell.y + 1);

      let i = cellIndex(cell.xy);

      // Conway's game of life rules:
      switch activeNeighbors {
        case 2u: {
          cellStateOut[i] = cellStateIn[i];
        }
        case 3u: {
          cellStateOut[i] = ${ACTIVE_ARGB}u;
        }
        default: {
          cellStateOut[i] = ${DEAD_ARGB}u;
        }
      }
    }
  `,
});

const simulationPipeline = device.createComputePipeline({
  label: "Simulation pipeline",
  layout: device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  }),
  compute: {
    module: simulationShaderModule,
    entryPoint: "computeMain",
  },
});

// ------------------------------
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
  document.querySelector<HTMLParagraphElement>("#fps")!.textContent =
    `Frames Per Second: ${fps.toFixed(0)}`;
  document.querySelector<HTMLParagraphElement>("#time")!.textContent =
    `Simulation Time: ${(time).toFixed(2)}ms`;
}, 1000);

// draw grid based on the Uint32Array
const imageData = ctx.createImageData(width, height);
const argb = new Uint32Array(imageData.data.buffer);

let step = 0; // Track how many simulation steps have been run
async function render() {
  // Unmap the cell state buffer for it to be available to the GPU
  cellState.unmap();

  // Begin command buffer
  const encoder = device.createCommandEncoder();

  // Start a compute pass
  const computePass = encoder.beginComputePass();
  computePass.setPipeline(simulationPipeline);
  computePass.setBindGroup(0, bindGroups[step % 2]);
  computePass.dispatchWorkgroups(
    Math.ceil(width / WORKGROUP_SIZE[0]),
    Math.ceil(height / WORKGROUP_SIZE[1]),
  );
  computePass.end();

  // Copy the cell state to the read buffer
  encoder.copyBufferToBuffer(
    cellStateStorage[step % 2],
    0,
    cellState,
    0,
    cellStateArray.byteLength,
  );

  step++; // Increment the step count

  const simStart = performance.now();

  // Submit the command buffer to the GPU to start render
  device.queue.submit([encoder.finish()]);
  // Read the cell state back from the GPU
  await cellState.mapAsync(GPUMapMode.READ);

  // Calculate the simulation time
  time = (0.9 * time) + (0.1 * (performance.now() - simStart));

  // Draw the grid.
  argb.set(new Uint32Array(cellState.getMappedRange()));
  ctx.putImageData(imageData, 0, 0);
  count++; // Update the FPS counter
  requestAnimationFrame(render);
}

requestAnimationFrame(render);
