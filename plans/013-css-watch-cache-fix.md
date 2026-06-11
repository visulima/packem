# Plan 013: Fix the CSS watch-cache root cause and remove the `useCache` hack

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise.
>
> **Drift check (run first)**:
> `git diff --stat 0a19a13e0..HEAD -- packages/rollup-plugin-css/src/css-plugin.ts packages/packem/src/rollup/watch.ts packages/packem/__tests__/intigration/watch.test.ts`
> On any in-scope drift, compare the "Current state" excerpts against live
> code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches watch-mode caching semantics)
- **Depends on**: plan 009's spike report (`plans/009-report.md`) — root cause
  verified there and independently by the reviewer
- **Category**: bug / perf
- **Planned at**: commit `0a19a13e0`, 2026-06-11

## Why this matters

Any project with CSS enabled loses rollup's incremental cache in watch mode —
every rebuild re-runs every loader (PostCSS/Sass/Less) on every CSS file, even
unchanged ones. The hack exists because, with caching on, **CSS output silently
disappears after the second rebuild**. Plan 009's spike found the exact
mechanism (verified against rollup 4.60.4's source):

1. The CSS plugin keeps extracted CSS in a closure-level `extracted` Map.
2. `buildStart()` clears that Map on every build cycle.
3. Only `transform()` repopulates it — but rollup **skips `transform()` for
   cached modules whose source is unchanged**.
4. `generateBundle()` emits CSS from the Map → empty Map → no CSS emitted.

The fix (009's "Fix B"): store the extracted CSS in the module's `meta`
(rollup persists and restores `meta` for cached modules) and repopulate the
Map in a `moduleParsed` hook, which rollup fires for **all** modules — cached
and fresh (verified: rollup fires it from the shared load path,
`hookParallel('moduleParsed', ...)`, regardless of which branch loaded the
module).

## Current state

All line numbers at commit `0a19a13e0`.

- `packages/rollup-plugin-css/src/css-plugin.ts`:
  - Line 125: `const extracted = new Map<string, Extracted>();` (closure-level,
    per plugin instance)
  - Line 226 (inside `async buildStart()`): `extracted.clear();` with a comment
    explaining it prevents phantom entries for deleted files
  - Line 285: `async generateBundle(outputOptions, bundle) {` — reads
    `extracted` to emit CSS
  - Lines 611–634 (end of `transform`):

    ```ts
            if (result.extracted) {
                const { id } = result.extracted;

                // O(1) upsert: re-inserting an existing id keeps its content
                // updated while deduping re-transforms of the same module
                // (watch mode / re-eval).
                extracted.set(id, result.extracted);

                logger.debug({
                    cssSize: result.extracted.css.length,
                    hasSourceMap: Boolean(result.extracted.map),
                    message: `Extracted CSS from ${id}`,
                    plugin: "css",
                });
            }

            return {
                code: result.code,
                map: sourceMap && result.map ? result.map : { mappings: "" as const },
                meta: {
                    styles: result.meta,
                },
                moduleSideEffects: result.extracted ? true : undefined,
            };
        },
    ```

- The `Extracted` interface (`packages/rollup-plugin-css/src/loaders/types.ts:8`)
  is `{ css: string; id: string; map?: string }` — plain JSON-serializable
  data, safe to put in rollup's serialized cache `meta`.

- `packages/packem/src/rollup/watch.ts:254-259` — the hack to remove:

  ```ts
      // TODO: find a way to remove this hack
      // This is a hack to prevent caching when using css loaders
      if (context.options.rollup.css) {
          useCache = false;
      }
  ```

  `useCache` controls (a) persisting `event.result.cache` to
  `fileCache.set(...)` in the BUNDLE_END handler and (b) restoring the
  persisted cache into the rollup options. Note: the **rolldown** watch branch
  sets its own `bundleUseCache = false` unconditionally (rolldown manages its
  own incremental state) — that is untouched by this plan.

- Watch test exemplar: `packages/packem/__tests__/intigration/watch.test.ts` —
  tests spawn the built CLI with `execaNode`, poll accumulated stdout+stderr
  for markers (e.g. `⚡️ Build run in`), rewrite source files to trigger
  rebuilds, then kill with SIGINT. Model the new test on the existing ones.
  CSS config shapes for fixtures: see
  `packages/packem/__tests__/intigration/css.test.ts`.

- Integration tests run the **built dist** — always `pnpm run build:packages`
  after source changes before running them.

## Commands you will need

| Purpose | Command | Run from | Expected |
|---|---|---|---|
| Install | `pnpm install --frozen-lockfile --prefer-offline` | worktree root | exit 0 |
| Build packages | `pnpm run build:packages` | worktree root | exit 0 |
| Typecheck | `pnpm run lint:types` | worktree root | exit 0 |
| CSS plugin unit tests | `pnpm run test` | `packages/rollup-plugin-css` | all pass |
| CSS integration tests | `env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/css.test.ts"` | `packages/packem` | all pass |
| Watch tests (rollup) | `env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/watch.test.ts"` | `packages/packem` | all pass |
| Watch tests (rolldown) | `PACKEM_TEST_BUNDLER=rolldown pnpm exec vitest run "__tests__/intigration/watch.test.ts"` | `packages/packem` | all pass |
| Lint the new/changed test file | `pnpm exec eslint __tests__/intigration/watch.test.ts` | `packages/packem` | exit 0 (no NEW errors vs base) |

## Scope

**In scope** (the only files you may modify):
- `packages/rollup-plugin-css/src/css-plugin.ts` (the `transform` return's
  `meta` + a new `moduleParsed` hook)
- `packages/packem/src/rollup/watch.ts` (delete the 5-line hack block only)
- `packages/packem/__tests__/intigration/watch.test.ts` (one new test)

**Out of scope**:
- The rolldown watch branch's `bundleUseCache = false` — rolldown manages its
  own state; leave it.
- `packages/rollup-plugin-css/src/loaders/` — loader internals are fine.
- Any `*.snap` / `*.rolldown.snap` file — this change must not alter build
  output (watch-mode behavior only).
- `buildStart`'s `extracted.clear()` — it stays; it is load-bearing for the
  deleted-file case. The `moduleParsed` hook repopulates after it.

## Git workflow

- Branch: `advisor/013-css-watch-cache-fix` (you are on it)
- Conventional commit, e.g.
  `fix(rollup-plugin-css): survive rollup cache restores so watch mode can keep its cache`
- Do NOT push or open a PR.

## Steps

### Step 1: Store extracted CSS in the transform `meta`

In the `transform` return (line ~628), add the extracted entry to `meta`:

```ts
            return {
                code: result.code,
                map: sourceMap && result.map ? result.map : { mappings: "" as const },
                meta: {
                    extracted: result.extracted ?? null,
                    styles: result.meta,
                },
                moduleSideEffects: result.extracted ? true : undefined,
            };
```

**Verify**: `pnpm run lint:types` → exit 0. (If a `meta` type complains, the
`CustomPluginOptions` type is an open record — extend locally, don't change
shared types.)

### Step 2: Add the `moduleParsed` hook

Add to the plugin object in `css-plugin.ts` (near `buildStart`, matching the
file's hook ordering/comment style):

```ts
        moduleParsed(moduleInfo) {
            // Fires for every module, including ones restored from rollup's cache
            // that skip transform(). Without this, `extracted` (cleared each
            // buildStart) stays empty for cached CSS modules and generateBundle
            // emits nothing — the bug that forced packem's watch mode to disable
            // caching whenever CSS was enabled.
            const extractedMeta = moduleInfo.meta?.extracted as Extracted | null | undefined;

            if (extractedMeta) {
                extracted.set(extractedMeta.id, extractedMeta);
            }
        },
```

Import the `Extracted` type if not already imported in the file. A
loader/inclusion guard is unnecessary: only modules this plugin transformed
carry `meta.extracted`.

**Verify**: `pnpm run lint:types` → exit 0; `pnpm run test` in
`packages/rollup-plugin-css` → all pass.

### Step 3: Remove the hack in watch.ts

Delete exactly these lines (`packages/packem/src/rollup/watch.ts:254-259`
region):

```ts
    // TODO: find a way to remove this hack
    // This is a hack to prevent caching when using css loaders
    if (context.options.rollup.css) {
        useCache = false;
    }
```

(Keep `let useCache = true;` above it; if `useCache` becomes never-reassigned
and lint demands `const`, make it `const`.)

**Verify**: `pnpm run lint:types` → exit 0, then `pnpm run build:packages` →
exit 0.

### Step 4: Add the watch+CSS regression test

In `packages/packem/__tests__/intigration/watch.test.ts`, add (modeled on the
existing tests):

`it("should keep emitting CSS across watch rebuilds when the cache is enabled", { timeout: 60_000 }, ...)`

1. Fixture: `package.json` with `module: "dist/index.mjs"`, `src/index.js`
   importing `./style.css`, a real `src/style.css` (e.g. `.a { color: red; }`),
   packem config with CSS enabled (copy a minimal working CSS config shape
   from `css.test.ts` — PostCSS loader is enough).
2. Spawn watch, wait for the first `⚡️ Build run in` marker; assert the
   emitted CSS artifact in `dist/` exists and contains `color: red`.
3. Rewrite **only `src/index.js`** (JS-only change), wait for the second
   `⚡️ Build run in` occurrence; assert the CSS artifact **still exists and
   still contains `color: red`** (this is the regression: with the bug, cached
   CSS modules skip transform and the CSS vanishes).
4. Rewrite `src/style.css` to `color: blue`, wait for the third build marker;
   assert the artifact now contains `color: blue`.
5. SIGINT and assert clean termination like the existing tests.

**Verify** (from `packages/packem`):
`env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/watch.test.ts"` → all pass (existing + 1 new).

To prove the test actually guards the bug: temporarily revert Steps 1–2
(`git stash -- packages/rollup-plugin-css/src/css-plugin.ts`), rebuild, re-run
the new test — it must FAIL (CSS missing after the JS-only rebuild) — then
`git stash pop`, rebuild, and confirm it passes again. Record both outcomes in
your report. If it does NOT fail with the fix reverted, the test isn't
exercising the cache path — STOP and report rather than shipping a vacuous
test.

### Step 5: Full verification sweep

**Verify all**:
1. `pnpm run test` in `packages/rollup-plugin-css` → pass.
2. From `packages/packem`: the CSS integration suite (command above) → pass.
3. Watch suite under rollup AND rolldown (commands above) → pass.
4. `pnpm exec eslint __tests__/intigration/watch.test.ts` in
   `packages/packem` → no NEW errors (pre-existing repo lint debt does not
   count; compare against the file's state at `0a19a13e0` if unsure).
5. `git status --short` → only the 3 in-scope files; no `.snap` changes.

## Test plan

- New: watch+CSS cache regression test (Step 4), proven non-vacuous by the
  revert check.
- Existing: rollup-plugin-css unit suite, packem `css.test.ts`,
  `watch.test.ts` on both backends.

## Done criteria

ALL must hold:

- [ ] `pnpm run lint:types` exits 0 (repo root)
- [ ] rollup-plugin-css unit tests pass
- [ ] packem `css.test.ts` and `watch.test.ts` (both backends) pass, including the new test
- [ ] The revert check in Step 4 demonstrated the new test fails without the fix
- [ ] The hack block is gone from `watch.ts` (`grep -n "hack to prevent caching" packages/packem/src/rollup/watch.ts` → no matches)
- [ ] Changes confined to the 3 in-scope files; no `.snap` changes

## STOP conditions

- The excerpts don't match live code (drift).
- The new test cannot observe CSS output disappearing even with the fix
  reverted — the repro assumption is wrong; report what you observed.
- `meta.extracted` breaks some downstream consumer of module meta (search
  `meta.styles` consumers if anything fails oddly) — report, don't patch
  around it.
- Removing the hack makes any **existing** test fail — report which.

## Maintenance notes

- The serialized watch cache (`rollup-watch.json` via FileCache) now contains
  each CSS module's extracted CSS text in its `meta`. For very large CSS
  projects this grows the cache file; if that ever becomes a problem, the
  fallback is a `shouldTransformCachedModule` hook returning true for CSS
  modules (correct but loses transform caching). Documented in
  `plans/009-report.md` ("Fix A").
- Reviewer: scrutinize that `buildStart`'s `extracted.clear()` + `moduleParsed`
  repopulation correctly handles the deleted-CSS-file case (deleted modules
  aren't in the new graph → no moduleParsed → not re-added — correct).
