// TypeScript has no built-in understanding of a `.wasm` import, so a library that imports
// one declares its shape. The names and signatures here mirror the module's exports.
declare module "*.wasm" {
    export const add: (a: number, b: number) => number;
    export const logSum: (a: number, b: number) => void;
    export const memory: WebAssembly.Memory;

    const init: (imports?: WebAssembly.Imports) => Promise<WebAssembly.Instance>;

    export default init;
}
