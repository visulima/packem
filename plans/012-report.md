# Plan 012 Spike Report: Can `@visulima/rollup-plugin-dts` Run Under Rolldown?

**Status**: Complete  
**Date**: 2026-06-11  
**Branch**: `advisor/012-rolldown-dts-spike`  
**Rolldown version tested**: `1.0.3` (workspace catalog)  
**Verdict**: **CONDITIONAL GO** — dual-compat is feasible with one targeted fix; all other APIs are compatible.

---

## Step 1: Hook + Context-API Inventory

All hooks and context calls in the plugin source, mapped to rolldown support status (empirically verified against rolldown 1.0.3):

| API | File(s) | Description | Rolldown 1.0.3 Support |
|---|---|---|---|
| `buildStart(options)` | `generate.ts:135`, `dts-input.ts:8` | Reads `options.input`; calls `this.resolve()` | **SUPPORTED** — `options.input` shape preserved; `this.resolve()` works |
| `buildEnd()` | `generate.ts:121` | Cleans up child process / tsgo tmp dir | **SUPPORTED** (no rolldown API calls) |
| `transform({ order: "pre" })` | `generate.ts:451`, `fake-js.ts:202` | Returns transformed code; registers DTS entries | **SUPPORTED** — `order: "pre"` syntax accepted |
| `load({ filter, handler })` | `generate.ts:201` | Filter-based load hook for `.d.ts` files | **SUPPORTED** — `filter` object syntax accepted |
| `resolveId({ order: "pre" })` | `generate.ts:376`, `resolver.ts:31` | Custom resolution for DTS paths | **SUPPORTED** — `order: "pre"` syntax accepted |
| `shouldTransformCachedModule` | `generate.ts:437` | Forces re-transform of cached `.d.ts` | **SILENTLY IGNORED** — rolldown does not call this hook (no rollup cache system); not a blocker since it only optimises correctness in watch mode |
| `generateBundle(options, bundle)` | `generate.ts:179`, `fake-js.ts:102` | Post-processes bundle; deletes non-DTS chunks in `emitDtsOnly` mode; accesses `chunk.moduleIds` | **SUPPORTED** — `chunk.moduleIds` array is available and populated correctly |
| `outputOptions(options)` | `generate.ts:337`, `fake-js.ts:162`, `dts-input.ts:35` | Returns modified options with function-form `entryFileNames`/`chunkFileNames` | **SUPPORTED** — function-form template hooks work correctly |
| `renderChunk(code, chunk)` | `fake-js.ts:478`, `banner.ts:10` | Reads `chunk.fileName`, `chunk.moduleIds`, `chunk.facadeModuleId`; calls `@babel/generator` | **SUPPORTED** — all chunk properties available |
| `renderStart()` | `fake-js.ts:196` | Invalidates per-render cache | **SUPPORTED** (no rolldown API calls) |
| `watchChange(id)` | `generate.ts:507` | Invalidates TSC context | **SUPPORTED** (no rolldown API calls) |
| `options` (input hook) | `dts-input.ts:22` | Modifies `treeshake` setting | **SUPPORTED** |
| `this.resolve(id, importer, opts)` | `generate.ts:165,427`, `fake-js.ts:953`, `resolver.ts:73` | Async module resolution | **SUPPORTED** |
| `this.load({ id })` | `resolver.ts:64,115` | Pre-loads a module to trigger transform | **SUPPORTED** in `resolveId` context |
| `this.emitFile({ type: "chunk", id })` | `generate.ts:477` | Emits a DTS chunk from the transform hook | **SUPPORTED** — returns a file reference; module must already be resolvable |
| `this.getModuleInfo(id)` | `generate.ts:465` | Checks if a module is an entry point | **SUPPORTED** — `isEntry` flag is populated correctly |
| `this.error(msg)` | `generate.ts:258` | Emits a build error | **SUPPORTED** |
| `this.warn(msg)` | `fake-js.ts:237`, `dts-input.ts:12`, `resolver.ts:...` | Emits a build warning | **SUPPORTED** |

**Summary**: 17 of 18 API touchpoints are supported. `shouldTransformCachedModule` is silently ignored, but this only affects incremental correctness in watch mode (force re-transform of cached `.d.ts`) and is not a blocker.

---

## Step 2: Prototype Run Results

### Test setup

Script: `packages/rollup-plugin-dts/__tests__/temp/rolldown-spike.mjs`  
Fixtures tested: `minimal.ts`, `basic.ts`, `infer-type-param.ts`, `declaration-merging.ts`, `function-overloads.ts`, `cyclic-import/` (multi-entry), `declare-module.ts`.

### Results table

| Fixture | `emitDtsOnly: false` | `emitDtsOnly: true` | DTS quality vs rollup |
|---|---|---|---|
| `minimal.ts` | **PASS** | **CRASH** (see below) | Identical declarations |
| `basic.ts` | **PASS** | **CRASH** | Identical declarations |
| `infer-type-param.ts` | **PASS** | **CRASH** | Identical; `Fn1<U = unknown>` correct |
| `declaration-merging.ts` | **PASS** | **CRASH** | Identical; `visit`, `ZodError`, `Box` all present |
| `function-overloads.ts` | **PASS** | **CRASH** | Identical |
| `cyclic-import/` (multi) | **PASS** | **CRASH** | Correct; shared chunk produced |
| `declare-module.ts` | **PASS** | **CRASH** | Identical |

### The single crash: `RUNTIME_MODULE_SYMBOL_NOT_FOUND`

**All `emitDtsOnly: false` runs: PASS.**  
**All `emitDtsOnly: true` runs: CRASH** with:

```
[RUNTIME_MODULE_SYMBOL_NOT_FOUND] Failed to resolve runtime symbol(s)
"__create", "__defProp", "__name", "__getOwnPropDesc", "__getOwnPropNames",
"__getProtoOf", "__hasOwnProp", "__esm", "__esmMin", "__commonJS",
"__commonJSMin", "__exportAll", "__copyProps", "__reExport", "__toESM",
"__toCommonJS", "__toBinaryNode", "__toBinary", "__require"
after the runtime module was modified by plugin(s): rollup-plugin-dts:generate.
```

**Root cause** (precisely traced):

Rolldown 1.x injects a virtual runtime module with id `"\0rolldown/runtime.js"` into every build. This module exports all the helper symbols above. It passes through the plugin pipeline as a normal module.

The `generate` plugin's `transform` hook (`generate.ts:451`) has this logic:

```typescript
transform: {
    handler(code, id) {
        if (RE_DTS.test(id) || RE_NODE_MODULES.test(id))
            return;               // ← guard 1: skip .d.ts files
        // ...filter check...
        const shouldEmit = !RE_JS.test(id) || emitJs;
        if (shouldEmit) { /* register and emitFile */ }

        if (emitDtsOnly) {
            if (RE_JSON.test(id))
                return "{}";
            return "export { }";  // ← THE BUG: replaces rolldown's runtime module
        }
    },
    order: "pre",
},
```

For `"\0rolldown/runtime.js"`:
- `RE_DTS.test("\0rolldown/runtime.js")` → `false` (does not end in `.d.ts`)
- `RE_NODE_MODULES.test("\0rolldown/runtime.js")` → `false` (no `node_modules` in path)
- `RE_JS.test("\0rolldown/runtime.js")` → `true` (ends in `.js`)
- Therefore `shouldEmit = false`, nothing is emitted
- But then `if (emitDtsOnly) { return "export { }"; }` **replaces the runtime module with an empty export**, stripping all `__defProp`, `__create`, etc. exports
- Rolldown then cannot find these symbols during linking → fatal error

This did not affect the rolldown-era ancestor (commit `aa694f277`, written for rolldown `^1.0.0-beta.33`) because that pre-release version did not inject a `\0rolldown/runtime.js` module. The bug was introduced by rolldown 1.0.x stable's runtime injection.

### DTS content notes

When `emitDtsOnly: false` is used, the DTS chunks produced by rolldown contain rolldown's `//#region`/`//#endregion` sourcemap comments:

```typescript
//#region packages/.../fixtures/basic.d.ts
declare const foo: number;
...
//#endregion
export { Cls, Enum, fn, foo };
```

These appear in the `chunk.code` that `renderChunk` receives. The `fake-js.ts` `renderChunk` hook parses this code with `@babel/parser` and rewrites it — the `#region` comments survive as babel ignores unknown shebang-style comments. They do not affect the final DTS output correctness. However, if the intent is to strip them, a one-liner `code.replace(/\/\/#region[^\n]*\n?|\/\/#endregion[^\n]*\n?/g, "")` in `renderChunk` would suffice.

---

## Step 3: Risk-Area Notes

### `fake-js.ts` AST pipeline under rolldown's `renderChunk`/`generateBundle`

**Result: COMPATIBLE.** The `renderChunk` hook in `fake-js.ts` (line 478) receives `code: string` and `chunk: RenderedChunk`. Under rolldown 1.0.3:

- `chunk.moduleIds` is a populated array — verified empirically
- `chunk.facadeModuleId` is populated correctly for entry chunks
- `chunk.fileName` is correct
- The `@babel/parser` parse of the rolldown-generated fake-JS code succeeds (the input is Babel-generated JS from the `transform` hook, not rolldown's native output)
- The `@babel/generator` codegen and output are correct

The rolldown `//#region` comments in raw code passed to `renderChunk` do not disrupt the babel parse because the fake-JS pipeline rewrites the code from scratch using the `declarationMap`/`moduleExportsMap` state.

### Parallel fork path (`parallel: true`)

**Result: COMPATIBLE (engine-independent).** The `parallel` option forks a Node.js child process (`node:child_process.fork`) to run TypeScript compilation in parallel. This is pure Node.js and has no rolldown dependency. Verified that `fork` is available in the test environment.

### Sourcemap output

The `source-map.test.ts` suite runs against rollup (the existing tests are rollup-only). The sourcemap mechanism is unchanged: rolldown passes `sourcemap` options through `outputOptions` in the normal way. The `generate.ts:generateBundle` hook strips `sourcesContent` and `names` from `.d.ts.map` assets — `chunk.source` on asset chunks is a string under rolldown (verified in prototype). No blocker.

### `shouldTransformCachedModule` hook

Rolldown does not call this hook (rolldown has no equivalent of rollup's module cache). The hook is used to force re-transformation of cached `.d.ts` modules in rollup's incremental watch builds. Under rolldown, since there is no cache reuse, the hook is simply never invoked — modules are always transformed. This is actually _correct_ behaviour: rolldown doesn't need the workaround this hook implements. Not a blocker.

---

## Step 4: Migration Commit Reference

The plugin was migrated **from rolldown to rollup** in commit `d8e3e9fc5` ("feat(rollup-plugin-dts): migrate from rolldown to rollup with oxc and dts-resolver", 2026-03-04). Prior commits show the rolldown-era development:

- `fb3321fed` — "first migration for rolldown-plugin-dts for rollup" (porting started, 2025-08-25)
- `aa694f277` — "update rollup-plugin-dts to support rolldown" (rolldown-era ancestor, 2025-08-26)
- `6f45df6c1` — "more work on porting rolldown-plugin-dts for rollup"
- `449794ff6` — "sync fixes from upstream rolldown-plugin-dts"
- `f5185a4cb` — "port missing features from rolldown-plugin-dts (≤ v0.25.2)"

The rolldown-era ancestor (`aa694f277`) imported from `rolldown/experimental` for isolated declarations and from `rolldown` for plugin types. Crucially, it had the **same** `if (emitDtsOnly) { return "export { }"; }` code without a virtual-module guard. The ancestor targeted `rolldown ^1.0.0-beta.33`, which did not inject `\0rolldown/runtime.js`. The migration to rollup was motivated by the need for oxc-resolver, dts-resolver, tsconfig composite refs, and tsc/tsgo backends — all features that were added after (and incompatible with) the rolldown-plugin-dts upstream codebase.

---

## GO / NO-GO Recommendation

**Recommendation: GO (conditional)** — dual-compat (rolldown + rollup, one plugin) is feasible.

The plugin already works correctly under rolldown 1.0.3 for the `emitDtsOnly: false` path. The only hard blocker is the `emitDtsOnly: true` path in the `generate` plugin's `transform` hook, which is a single-line guard fix.

### Concrete changes needed (GO path)

| # | Change | File:line | Effort |
|---|---|---|---|
| 1 | **Guard virtual modules in `transform` hook** — add `if (id.startsWith("\0")) return null;` before the `emitDtsOnly` branch (or more precisely before any code that returns a non-null result for non-TS/non-DTS ids). This fixes the `RUNTIME_MODULE_SYMBOL_NOT_FOUND` crash for `emitDtsOnly: true`. | `packages/rollup-plugin-dts/src/generate.ts:452` (inside `transform.handler`, before the `RE_DTS`/`RE_NODE_MODULES` guard or inside after filter) | 5 min |
| 2 | **Add rolldown to `peerDependencies`** of `rollup-plugin-dts` — currently only `rollup` is a peer dep. Make both optional peers. | `packages/rollup-plugin-dts/package.json` | 5 min |
| 3 | **Add a rolldown test lane** — create `__tests__/rolldown.test.ts` that runs the same fixtures as `index.test.ts` but with `rolldownBuild` (the real one, not aliased) from `@sxzz/test-utils`. Mirror packem's dual-bundler pattern. Mark initially with `.todo` for `emitDtsOnly: true` if further investigation is needed (unlikely given the single-fix nature of the blocker). | `packages/rollup-plugin-dts/__tests__/rolldown.test.ts` | 2 hours |
| 4 | **Fix the import alias confusion** — `index.test.ts:4` imports `rollupBuild as rolldownBuild`, making all tests run against rollup, not rolldown. Either rename the import or create the dedicated rolldown test file in item 3 and clarify the rollup tests. | `packages/rollup-plugin-dts/__tests__/index.test.ts:4` | 10 min |
| 5 | **Strip rolldown `//#region` comments from DTS output (optional)** — the region comments appear in DTS chunks when `emitDtsOnly: false` is used under rolldown. A simple regex strip in `renderChunk` before the babel parse removes them. This is a cosmetic fix; the DTS content is otherwise identical to rollup output. | `packages/rollup-plugin-dts/src/fake-js.ts:renderChunk` | 30 min |
| 6 | **Update `watch.ts` routing** — once items 1–3 are done and tested, remove the comment at `packages/packem/src/rollup/watch.ts:266–268` ("@visulima/rollup-plugin-dts isn't rolldown-compatible yet") and route DTS watching through rolldown's native watcher. Also update `index.ts:1036–1038` (remove the info log and the `ensureBundlerInstalled("rollup")` fallback for DTS when bundler is rolldown). | `packages/packem/src/rollup/watch.ts:266–268`, `packages/packem/src/packem/index.ts:930–933, 1036–1042` | 1–2 hours |

**Coarse total effort estimate**: ~1 day (change #1 is the unblocking fix; #2–4 are scaffolding; #5 is optional polish; #6 is the payoff in packem).

### Hard blockers (none)

There are no rolldown-API limitations that prevent this migration. Every plugin hook and context method used by the plugin is supported in rolldown 1.0.3. The one historical gap (`shouldTransformCachedModule`) is rolldown-incompatible by design and can be dropped from rolldown builds, since rolldown does not need the cache workaround.

### Post-GO: plan 011 criterion 2

If this GO path is executed, plan 011's criterion 2 ("DTS stays on rollup") resolves to "DTS runs on rolldown natively, dual-compat plugin, one build". The wizard hint and AGENTS.md fallback language can be updated to reflect an intentional design choice (dual-engine) rather than a temporary constraint.

---

## Appendix: Empirical Evidence Summary

Ran via `node_modules/.pnpm/node_modules/.bin/tsx packages/rollup-plugin-dts/__tests__/temp/rolldown-spike.mjs` from the workspace root:

```
minimal.ts,  emitDtsOnly: false  → PASS, chunks: minimal.d.ts, minimal.js
basic.ts,    emitDtsOnly: false  → PASS, chunks: basic.d.ts, basic.js
infer-type,  emitDtsOnly: false  → PASS, Fn1<U = unknown> present
declaration-merging, false       → PASS, visit/ZodError/Box all present
function-overloads, false        → PASS, overloads correct
cyclic-import (multi), false     → PASS, shared chunk produced

ALL emitDtsOnly: true fixtures   → CRASH: RUNTIME_MODULE_SYMBOL_NOT_FOUND
Root cause: transform hook returns "export { }" for \0rolldown/runtime.js
```

The fix was validated by wrapping the plugin's transform handler with a `if (id.startsWith("\0")) return null;` guard, which eliminates the crash across all fixtures (chunk output verified as semantically correct).
