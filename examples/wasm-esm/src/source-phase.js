// Source phase import — `mathModule` is a compiled but *uninstantiated*
// `WebAssembly.Module`, so it can be instantiated more than once, each time against a
// different import object.
// https://github.com/tc39/proposal-source-phase-imports
//
// This file is JavaScript rather than TypeScript on purpose: `import source` is a stage 3
// proposal that TypeScript's parser does not accept yet. packem rewrites the syntax before
// any transformer sees the file, so the build itself is unaffected either way.
import source mathModule from "./math.wasm";

export const countCalls = () => {
    let calls = 0;

    const instance = new WebAssembly.Instance(mathModule, {
        "./host.js": {
            log: () => {
                calls += 1;
            },
        },
    });

    return {
        calls: () => calls,
        logSum: instance.exports.logSum,
    };
};
