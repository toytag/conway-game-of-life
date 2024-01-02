// The entry file of your WebAssembly module.
var _width!: u32,
    _height!: u32,
    _ACTIVE_ARGB!: u32,
    _DEAD_ARGB!: u32,
    _cellStateIn!: Uint32Array,
    _cellStateOut!: Uint32Array;

class initArgs {
  width!: u32;
  height!: u32;
  ACTIVE_ARGB!: u32;
  DEAD_ARGB!: u32;
}

export function init(args: initArgs): void {
  _width = args.width;
  _height = args.height;
  _ACTIVE_ARGB = args.ACTIVE_ARGB;
  _DEAD_ARGB = args.DEAD_ARGB;
  _cellStateIn = new Uint32Array(_width * _height);
  _cellStateOut = new Uint32Array(_width * _height);
  for (let i = 0; i < _cellStateIn.length; ++i) {
    _cellStateIn[i] = Math.random() > 0.6 ? _ACTIVE_ARGB : _DEAD_ARGB;
  }
}

// @ts-ignore
@inline
function cellIndex(x: u32, y: u32): u32 {
  return (y % _height) * _width + (x % _width);
}

// @ts-ignore
@inline
function cellActive(x: u32, y: u32): u32 {
  return _cellStateIn[cellIndex(x, y)] == _ACTIVE_ARGB ? 1 : 0;
}

export function step(): void {
  for (let y: u32 = 0; y < _height; ++y) {
    for (let x: u32 = 0; x < _width; ++x) {
      let activeNeighbors = cellActive(x + 1, y + 1) +
                            cellActive(x + 1, y    ) +
                            cellActive(x + 1, y - 1) +
                            cellActive(x,     y - 1) +
                            cellActive(x - 1, y - 1) +
                            cellActive(x - 1, y    ) +
                            cellActive(x - 1, y + 1) +
                            cellActive(x,     y + 1);

      let i = cellIndex(x, y);

      // Conway's game of life rules:
      if (activeNeighbors == 2) {
        _cellStateOut[i] = _cellStateIn[i];
      } else if (activeNeighbors == 3) {
        _cellStateOut[i] = _ACTIVE_ARGB;
      } else {
        _cellStateOut[i] = _DEAD_ARGB;
      }
    }
  }

  // Ping-pong cellStateIn and cellStateOut
  const tmp = _cellStateIn;
  _cellStateIn = _cellStateOut;
  _cellStateOut = tmp;
}

// NOTE: Uint32Array is passed by copy, ArrayBuffer is passed by reference
export function getCellState(): ArrayBuffer {
  return _cellStateIn.buffer;
}

// export function getCellStateRef(): ref_array {
//   return _cellStateIn.buffer;
// }
