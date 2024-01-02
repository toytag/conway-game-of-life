import errorHTML from "./error.html?raw";

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

const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const context = canvas.getContext("webgpu")!;
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device: device,
  format: canvasFormat,
  alphaMode: 'premultiplied', // Important for transparency
});

// ------------------------------
// vertex buffer - square
const vertices = new Float32Array([
  // X, Y,
  -1, -1,
  1, -1,
  1, 1,

  -1, -1,
  1, 1,
  -1, 1,
]);
const vertexBuffer: GPUBuffer = device.createBuffer({
  label: "Cell vertices",
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, vertices);
const vertexBufferLayout: GPUVertexBufferLayout = {
  arrayStride: 8,
  attributes: [
    {
      format: "float32x2",
      offset: 0,
      shaderLocation: 0, // Position, see vertex shader
    },
  ],
};

// ------------------------------
// uniform and "storage" buffer
const GRID_SIZE = { x: canvas.width, y: canvas.height };
// Create a uniform buffer that describes the grid.
const uniformArray = new Float32Array([GRID_SIZE.x, GRID_SIZE.y]);
const uniformBuffer = device.createBuffer({
  label: "Grid Uniforms",
  size: uniformArray.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

// Create an array representing the active state of each cell.
const cellStateArray = new Uint32Array(GRID_SIZE.x * GRID_SIZE.y);
// Create two storage buffers to hold the cell state.
const cellStateStorage = [
  device.createBuffer({
    label: "Cell State A",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }),
  device.createBuffer({
    label: "Cell State B",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }),
];
// Mark every third cell of the first grid as active.
for (let i = 0; i < cellStateArray.length; ++i) {
  cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
}
device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

// Create the bind group layout.
const bindGroupLayout = device.createBindGroupLayout({
  label: "Cell Bind Group Layout",
  entries: [
    {
      binding: 0,
      visibility:
        GPUShaderStage.COMPUTE |
        GPUShaderStage.VERTEX |
        GPUShaderStage.FRAGMENT,
      buffer: { type: "uniform" }, // Grid uniform buffer
    },
    {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
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

const WORKGROUP_DIM = { x: 8, y: 8 }; // Block dim in CUDA
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
      return cellStateIn[cellIndex(vec2(x, y))];
    }

    @compute @workgroup_size(${WORKGROUP_DIM.x}, ${WORKGROUP_DIM.y})
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
          cellStateOut[i] = 1;
        }
        default: {
          cellStateOut[i] = 0;
        }
      }
    }
  `,
});

const cellShaderModule = device.createShaderModule({
  label: "Cell shader",
  code: `
    @group(0) @binding(0) var<uniform> grid: vec2f;
    @group(0) @binding(1) var<storage> cellState: array<u32>;

    struct VertexInput {
      @location(0) pos: vec2f,
      @builtin(instance_index) instance: u32,
    }

    struct VertexOutput {
      @builtin(position) pos: vec4f,
      @location(0) @interpolate(flat) instance: u32,
    }

    @vertex
    fn vertexMain(input: VertexInput) -> VertexOutput {
      let i = f32(input.instance);
      let cell = vec2f(i % grid.x, floor(i / grid.x));
      let cellOffset = cell / grid * 2;
      let gridPos = (input.pos + 1) / grid - 1 + cellOffset;

      return VertexOutput(vec4f(gridPos, 0.0, 1.0), input.instance);
    }

    @fragment
    fn fragmentMain(@location(0) @interpolate(flat) instance: u32) -> @location(0) vec4f {
      if (cellState[instance] == 0) {
        discard;
      }
      return ${
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "vec4f(1, 1, 1, 1)"
          : "vec4f(0, 0, 0, 1)"
      };
    }
  `,
});

const pipelineLayout = device.createPipelineLayout({
  label: "Cell Pipeline Layout",
  bindGroupLayouts: [bindGroupLayout],
});

const simulationPipeline = device.createComputePipeline({
  label: "Simulation pipeline",
  layout: pipelineLayout,
  compute: {
    module: simulationShaderModule,
    entryPoint: "computeMain",
  },
});

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: pipelineLayout,
  vertex: {
    module: cellShaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout],
  },
  fragment: {
    module: cellShaderModule,
    entryPoint: "fragmentMain",
    targets: [
      {
        format: canvasFormat,
      },
    ],
  },
});

// ------------------------------

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
  document.querySelector<HTMLParagraphElement>("#fps")!.textContent =
    `Frames Per Second: ${fps.toFixed(2)}`;
}, 1000);

let step = 0; // Track how many simulation steps have been run
function render() {
  const encoder = device.createCommandEncoder();

  // Start a compute pass
  const computePass = encoder.beginComputePass();
  computePass.setPipeline(simulationPipeline);
  computePass.setBindGroup(0, bindGroups[step % 2]);
  computePass.dispatchWorkgroups(
    Math.ceil(GRID_SIZE.x / WORKGROUP_DIM.x),
    Math.ceil(GRID_SIZE.y / WORKGROUP_DIM.y)
  );
  computePass.end();

  step++; // Increment the step count

  // Start a render pass
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        loadOp: "clear",
        clearValue: { r: 0, g: 0, b: 0, a: 0 }, // transparent
        storeOp: "store",
      },
    ],
  });

  // Draw the grid.
  renderPass.setPipeline(cellPipeline);
  renderPass.setBindGroup(0, bindGroups[step % 2]);
  renderPass.setVertexBuffer(0, vertexBuffer);
  renderPass.draw(vertices.length / 2, GRID_SIZE.x * GRID_SIZE.y);
  // End the render pass and submit the command buffer
  renderPass.end();

  // Submit the command buffer to the GPU to start render
  device.queue.submit([encoder.finish()]);

  count++; // Update the FPS counter
  requestAnimationFrame(render);
}

render();
