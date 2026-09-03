# WebAssembly ESM Integration Example

This example demonstrates how Packem brings `.wasm` modules into the ES module graph:
the module's WebAssembly exports become named ES exports, its WebAssembly imports are
resolved as ES imports, and the same file can also be imported in the *source phase* as a
compiled-but-uninstantiated `WebAssembly.Module`.

## Structure

```
src/
  index.ts            # ESM integration
  source-phase.js     # Source phase import (see the note below)
  source-phase.d.ts   # Types for the above
  host.js             # Imported *by* the wasm module as "./host.js"
  math.wasm           # add / logSum / memory, imports "./host.js" "log"
  wasm.d.ts           # Ambient declaration for the .wasm import
```

`math.wasm` is the assembled form of:

```wat
(module
  (import "./host.js" "log" (func $log (param i32)))
  (func (export "add") (param i32 i32) (result i32)
    (i32.add (local.get 0) (local.get 1)))
  (func (export "logSum") (param i32 i32)
    (call $log (i32.add (local.get 0) (local.get 1))))
  (memory (export "memory") 1))
```

## The two import forms

**ESM integration** — each WebAssembly export is a named ES export:

```ts
import { add, memory } from "./math.wasm";

add(2, 3); // 5
```

The module declares `(import "./host.js" "log" ...)`. Packem reads that from the binary
and emits `import * as ... from "./host.js"` in the generated wrapper, so `src/host.js`
is bundled and handed to the instance — there is no import object to build by hand.

**Source phase** — the binding is the compiled module, not an instance:

```js
import source mathModule from "./math.wasm";

// Instantiate as many times as you like, each with its own imports.
const instance = new WebAssembly.Instance(mathModule, { "./host.js": { log } });
```

This lives in `src/source-phase.js` rather than a `.ts` file on purpose: `import source`
is a stage 3 proposal that TypeScript's parser does not accept yet, so `tsc` reports a
syntax error on it. Packem rewrites the syntax before any transformer sees the file, so
the build itself works either way — the `.js` split is only to keep `tsc` happy, and
`source-phase.d.ts` supplies the types.

## Configuration

No configuration is required — `.wasm` handling is on by default. `packem.config.ts` only
selects the transformer:

```ts
import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

export default defineConfig({
    runtime: "node",
    transformer,
});
```

Because `math.wasm` is small it is inlined as base64, so `dist/index.js` is
self-contained. Modules above `maxFileSize` (14 KB by default) are emitted next to the
chunk and loaded at runtime instead. See the [WebAssembly docs](../../docs/examples/advanced/webassembly.mdx)
for `mode`, `instantiation` and the other options.

## Build

```bash
pnpm run build
```

## Run

```bash
node -e '
  const m = await import("./dist/index.js");
  console.log(m.sum(2, 3));  // 5
  console.log(m.pages());    // 1
'
```
