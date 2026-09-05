// ESM integration — the module's WebAssembly exports arrive as named ES exports, and its
// own `./host.js` import is resolved through the module graph.
// https://github.com/WebAssembly/esm-integration
import { add, memory } from "./math.wasm";

export const sum = (a: number, b: number): number => add(a, b);

export const pages = (): number => memory.buffer.byteLength / 65_536;

// The source phase demo lives in a .js file because TypeScript cannot yet parse
// `import source`. See src/source-phase.js.
export { countCalls } from "./source-phase.js";
