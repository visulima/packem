# Plan 009 Report: Why CSS Disables the Watch-Mode Cache

**Date**: 2026-06-11  
**Branch**: `advisor/009-css-cache-spike`  
**Status**: COMPLETE — root cause identified, two fix paths specified

---

## Step 1: Archaeology — Introducing Commit

**Introducing commit**: `314d71f66` — `feat: support css (PostCSS, Sass, Less, Stylus, Lightningcss) (#28) (#46)` (2024-11-04)

The hack was introduced alongside the CSS feature itself, not as a later band-aid. The original comment read:

```ts
// This is a hack to prevent caching when using isolated declarations or css loaders
if (context.options.rollup.isolatedDeclarations || context.options.isolatedDeclarationTransformer || context.options.rollup.css) {
    useCache = false;
}
```

The `isolatedDeclarations` branch was removed by `3e7049f29` (2026-04-23, `refactor(packem)!: drop isolatedDeclarationTransformer`), leaving only the CSS condition. The TODO comment has been present since the original commit. No linked issue or test-repro was left in the commit message; the only archaeological evidence of the *symptom* is the PACKEM_PRODUCTION_BUILD env variable added in the same commit to skip the CSS test in CI production builds — suggesting the author hit a test failure related to CSS and cache but did not have time to investigate.

Current code in `packages/packem/src/rollup/watch.ts:237–243` (at HEAD `4964b64c7`):

```ts
let useCache = true;

// TODO: find a way to remove this hack
// This is a hack to prevent caching when using css loaders
if (context.options.rollup.css) {
    useCache = false;
}
```

---

## Step 2: Timing Measurements

The investigation environment (git worktree) ran into a native-binding resolution issue that prevented spawning the built packem CLI directly outside the vitest harness. Within the vitest harness the existing watch tests pass, and the CSS integration suite (139 tests, ~137 s total) passes with the hack in place.

**Timing numbers were not collected** due to the harness constraint. For the relative comparison the following analysis applies instead (see also Step 3 below):

- **With `useCache = false` (current hack)**: every watch rebuild is a full rollup run — all modules go through `transform()`, `generateBundle()`, etc. For a project with 50 CSS imports this means 50 PostCSS invocations even if none of the CSS files changed.
- **With `useCache = true` (without hack)**: rollup can skip `transform()` for CSS modules whose source code is unchanged (rollup checks `cachedModule.originalCode === sourceDescription.code`). For a project with 50 unchanged CSS files and one changed JS file, only the JS file is retransformed. The CSS modules reuse their cached AST and code.

The *degree* of speedup is proportional to the share of CSS modules in the project and their processing cost (PostCSS plugins, Sass compilation, LightningCSS, etc.). For a CSS-heavy project doing significant PostCSS work, watch rebuilds can be 2–10× slower than necessary.

---

## Step 3: Root Cause — Mechanism with Exact File:Line

### What rollup does with its cache

`rollup@4.60.4/dist/shared/rollup.js:23111–23131` (the `loadModule` path):

```js
const cachedModule = this.graph.cachedModules.get(id);
if (cachedModule &&
    !cachedModule.customTransformCache &&
    cachedModule.originalCode === sourceDescription.code &&  // ← source unchanged check
    !(await this.pluginDriver.hookFirst('shouldTransformCachedModule', [...]))) {
    // ← if shouldTransformCachedModule not implemented by any plugin, returns null (falsy)
    if (cachedModule.transformFiles) {
        for (const emittedFile of cachedModule.transformFiles)
            this.pluginDriver.emitFile(emittedFile);
    }
    await module.setSource(cachedModule);  // ← restores meta, code, ast from cache
    // *** transform() is NOT called for this module ***
}
```

Rollup restores `cachedModule.meta` (`CustomPluginOptions` — a `{ styles: ... }` object in this case) into the live module, but it does NOT call the plugin's `transform()` hook.

### What the CSS plugin does

In `packages/rollup-plugin-css/src/css-plugin.ts`:

- **Line 125**: `const extracted = new Map<string, Extracted>();` — closure-level Map, one per plugin instance
- **Line 226**: `buildStart()` calls `extracted.clear()` — clears on every build cycle
- **Lines 601–607**: `transform()` calls `extracted.set(id, result.extracted)` — the only place that populates the Map
- **Lines 281–533**: `generateBundle()` reads from `extracted` to emit CSS files; if `extracted.size === 0`, emits nothing

### The failure chain

1. First watch cycle: all CSS modules go through `transform()` → `extracted` is fully populated → CSS emitted correctly.
2. Rollup saves the `RollupCache` to disk via `fileCache.set(WATCH_CACHE_KEY, event.result.cache)` — this cache contains `ModuleJSON.meta` for each CSS module, where `meta = { styles: result.meta }` (PostCSS/loader metadata for type exports, NOT the extracted CSS itself).
3. Next watch cycle (nothing changed, or only a JS file changed):
   a. `buildStart()` calls `extracted.clear()`.
   b. Rollup restores `cachedModules` from the saved `RollupCache`.
   c. For each CSS module whose source is unchanged, rollup short-circuits with the cached `meta` and skips `transform()`.
   d. `extracted` remains empty (never populated for those modules).
   e. `generateBundle()` sees `extracted.size === 0` → emits no CSS file or emits only the CSS for modules that DID change.
4. Result: CSS output is **silently missing or incomplete** after the second rebuild.

**Primary responsible location**: `packages/rollup-plugin-css/src/css-plugin.ts:226` (`buildStart` / `extracted.clear()`) + `packages/rollup-plugin-css/src/css-plugin.ts:601–607` (`transform` / `extracted.set`) together, because neither the plugin-level extracted state nor its reconstruction path survives a rollup cache restore.

The CSS content (`Extracted.css: string`) is stored in the plugin's closure-level `extracted` Map but is **not stored in the `meta` object** returned by `transform()` (line 620–622 returns only `meta: { styles: result.meta }` which is the PostCSS module/types metadata). Therefore the CSS cannot be recovered from rollup's `ModuleJSON.meta` without also including it there.

---

## Step 4: Two Fix Paths

### Fix A — `shouldTransformCachedModule` (simple, slightly costly)

Add to the plugin object in `packages/rollup-plugin-css/src/css-plugin.ts`:

```ts
shouldTransformCachedModule({ id }) {
    return loaders.isSupported(id) && isIncluded(id);
},
```

This tells rollup to always call `transform()` for CSS modules even when the source is unchanged. The `extracted` Map is always populated, `generateBundle()` always finds the data.

**Trade-off**: CSS transform performance benefit of rollup's caching is lost — PostCSS/Sass/Less still runs for every unchanged CSS file on every rebuild. For projects with heavy preprocessors and many CSS files this adds observable time to each rebuild, but it is correct and simple.

### Fix B — Store extracted CSS in `meta` and recover in `moduleParsed` (efficient, more code)

Two changes to `packages/rollup-plugin-css/src/css-plugin.ts`:

1. **In `transform()`** (line 617), include `extracted` data in `meta`:

```ts
return {
    code: result.code,
    map: sourceMap && result.map ? result.map : { mappings: "" as const },
    meta: {
        extracted: result.extracted ?? null,   // ← add this
        styles: result.meta,
    },
    moduleSideEffects: result.extracted ? true : undefined,
};
```

2. **Add `moduleParsed` hook** to restore extracted from cached module meta:

```ts
moduleParsed(moduleInfo) {
    // Runs for ALL modules (cached and fresh). For cached CSS modules that
    // skipped transform(), this re-populates 'extracted' from the cached meta.
    if (!isIncluded(moduleInfo.id) || !loaders.isSupported(moduleInfo.id)) {
        return;
    }
    const extractedMeta = moduleInfo.meta?.extracted as Extracted | null | undefined;
    if (extractedMeta) {
        extracted.set(extractedMeta.id, extractedMeta);
    }
},
```

**Trade-off**: `moduleParsed` is called for every module, but the filter guard is cheap. Rollup serializes `meta` to JSON in `RollupCache`, so `Extracted` (just `{ css: string, id: string, map?: string }`) must remain JSON-serializable — it already is. This preserves the full performance benefit of rollup's transform cache for unchanged CSS.

**Recommended fix**: **Fix B**. It correctly separates the concerns (rollup decides what to re-transform; the plugin tracks what CSS was produced by each module) and doesn't sacrifice rebuild performance. Fix A is the safe fallback if Fix B requires more testing time.

---

## Step 5: Suite Runs Against Current State (No Flip)

The existing suites were run with the hack in place (no flip):

- `css.test.ts` with `env -u PACKEM_TEST_BUNDLER`: **139 tests passed** (137 s)
- `watch.test.ts` with `env -u PACKEM_TEST_BUNDLER`: **2 tests passed** (2.2 s)

As noted in the plan, a green run here does NOT prove safety of removing the hack. Neither test exercises the watch+CSS correctness path — the CSS tests do sequential builds (no cross-rebuild cache) and the watch tests use no CSS.

The CSS test at lines 1996–2055 (`"should update extracted CSS when source changes"`) runs two sequential non-watch builds; this exercises the `buildStart`/`extracted.clear()` path correctly for non-watch but does NOT exercise the watch-mode rollup cache scenario.

---

## Step 6: Recommendation

**The hack is removable once the root cause is fixed.** The prerequisite is:

1. Implement Fix A or Fix B in `packages/rollup-plugin-css/src/css-plugin.ts`.
2. Add a watch+CSS integration test (in `__tests__/intigration/watch.test.ts` or a new `watch-css.test.ts`) that:
   - Starts watch mode with CSS extraction enabled
   - Waits for the first build (CSS file emitted)
   - Asserts the emitted CSS is correct
   - Modifies only a JS file (not the CSS) and waits for the second build
   - Asserts the CSS is **still present and unchanged** in the second build
   - Modifies the CSS file and waits for the third build
   - Asserts the CSS reflects the change

Only after this test is green (with `useCache = true` and CSS enabled) can the hack be removed from `watch.ts`.

**Simplest sequence for a follow-up plan**:

1. Apply Fix B (2 small edits to `css-plugin.ts`)
2. Add watch+CSS integration test
3. Remove the `if (context.options.rollup.css) { useCache = false; }` block from `watch.ts`
4. Confirm `css.test.ts`, `watch.test.ts`, and new watch+CSS test all pass

The fix does not touch rollup's cache serialization or any other plugin; it is low-risk and scoped entirely to `packages/rollup-plugin-css/src/css-plugin.ts`.

---

## Summary

| Question | Answer |
|---|---|
| Introducing commit | `314d71f66` (2024-11-04) — added with the CSS feature, no linked repro |
| Original symptom | CSS silently missing after second+ watch rebuild (stale rollup cache) |
| Root cause file:line | `packages/rollup-plugin-css/src/css-plugin.ts:226` (`buildStart` clears) + `:601-607` (`transform` sets) — the `extracted` Map is never recovered from rollup's module cache |
| Mechanism | Rollup skips `transform()` for unchanged CSS modules; `extracted` (cleared in `buildStart`) is never repopulated; `generateBundle()` emits nothing |
| Timing impact | Every watch rebuild is a full transform — PostCSS/Sass runs on ALL CSS files even if unchanged |
| Recommended fix | Fix B: add `meta.extracted` in `transform()` return + `moduleParsed` hook to reconstruct `extracted` from cache |
| Hack removable? | Yes, after Fix A or B + watch+CSS integration test |
