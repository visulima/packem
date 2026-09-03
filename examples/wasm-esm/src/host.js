// The WebAssembly module declares `(import "./host.js" "log" ...)`. Under the ESM
// integration proposal that module name is an ES module specifier, so packem imports this
// file and passes its namespace to the instance — no hand-built import object.

// eslint-disable-next-line import/prefer-default-export
export const log = (value) => {
    // eslint-disable-next-line no-console
    console.log(`[host] wasm called log(${String(value)})`);
};
