# Plan 015: Route packem's DTS through rolldown natively (012 GO path, item 6)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on.
> This plan has a **mandatory Step 0 validation gate** — if it fails, STOP
> and report; do not improvise architecture changes. If anything in "STOP
> conditions" occurs, stop and report.
>
> **Drift check (run first)**:
> `git diff --stat 21cda54ba..HEAD -- packages/packem/src/`
> On any drift in the files excerpted below, compare against live code; on
> mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED-HIGH (touches the DTS build/watch pipeline; several rolldown
  capabilities are unverified — hence the Step 0 gate)
- **Depends on**: plan 014 (merged: `@visulima/rollup-plugin-dts` is
  rolldown-compatible, rolldown is its optional peer, a rolldown test lane
  exists at `packages/rollup-plugin-dts/__tests__/rolldown.test.ts`)
- **Category**: feature / direction
- **Planned at**: commit `21cda54ba`, 2026-06-11

## Why this matters

With `bundler: "rolldown"`, packem still pulls rollup in and runs the entire
declaration (DTS) build and DTS watch through rollup. Plan 012's spike proved
the DTS plugin itself works under rolldown (landed as plan 014). What remains
is packem's routing: build, watch, the rollup pull-in, the wizard hint, and
the status doc. This is criterion 2 of `docs/rolldown-status.md`.

## Current state

All line numbers at commit `21cda54ba`.

### 1. The rollup pull-in — `packages/packem/src/packem/index.ts:935-939`

```ts
        // Rolldown still depends on rollup for DTS until the dts plugin is
        // rolldown-compatible. Pull rollup in so the DTS path doesn't crash.
        if (requestedBundler === "rolldown" && context.options.declaration) {
            await ensureBundlerInstalled("rollup", rootDirectory, logger);
        }
```

### 2. The DTS-watch info log — `packages/packem/src/packem/index.ts:1039-1048`

```ts
            // Rolldown now drives its own native watch (see rollup/watch.ts). The
            // bundle watcher is rolldown; only DTS watching still runs through
            // rollup, since @visulima/rollup-plugin-dts isn't rolldown-compatible
            // yet. Surface that one residual fallback when declarations are on.
            if (context.options.bundler === "rolldown" && context.options.declaration) {
                logger.info({
                    message: "Declaration (DTS) watching runs through rollup; the bundle watcher is rolldown.",
                    prefix: "bundler",
                });
            }
```

### 3. The one-shot DTS build — `packages/packem/src/bundler/build-types.ts`

- Line 143-147: the seam comment + entry:

  ```ts
  // DTS is rollup-only because @visulima/rollup-plugin-dts depends on rollup
  // option shapes (treeshake.preset, generatedCode.arrowFunctions, compact…)
  // that rolldown rejects. The factory parameter keeps the seam visible so the
  // caller can swap it once a rolldown-compatible DTS plugin lands.
  const buildTypes = async (context: BuildContext<InternalBuildOptions>, fileCache: FileCache, subDirectory: string): Promise<void> => {
      const rollupTypeOptions = await getRollupDtsOptions(context, fileCache);
  ```

- Line 173-176: rollup cache wiring + the build call:

  ```ts
      rollupTypeOptions.cache = fileCache.get<RollupCache>(DTS_CACHE_KEY, dtsCacheNamespace);

      const rollup = await getRollupBuild();
      const typesBuild = await rollup(rollupTypeOptions);
  ```

- Lines 225-246: the per-extension write loop. For each declaration extension
  (`d.ts` / `d.mts` / `d.cts`) it calls `typesBuild.write({...})` with
  function-form `chunkFileNames` / `entryFileNames` and an **output plugin**
  `filterSkipChunksPlugin` (a `generateBundle`-only plugin that deletes
  synthetic `__packem_skip__/` chunks and prunes orphan shared chunks).

- The `finally` block (249-256) persists `typesBuild.cache` and flushes.

### 4. The DTS watcher — `packages/packem/src/rollup/watch.ts:333-356`

```ts
        if (context.options.declaration) {
            const rollupWatch = await getRollupWatch();
            const rollupDtsOptions = await getRollupDtsOptions(context, fileCache);

            if (useCache) {
                rollupDtsOptions.cache = fileCache.get(`dts-${WATCH_CACHE_KEY}`);
            }

            await context.hooks.callHook("rollup:dts:options", context, rollupDtsOptions);

            const dtsWatcher = rollupWatch(rollupDtsOptions);

            await context.hooks.callHook("rollup:watch", context, dtsWatcher);

            watchHandler({
                context,
                fileCache,
                mode: "types",
                useCache,
                watcher: dtsWatcher,
            });

            watchers.push(dtsWatcher);
        }
```

The rolldown bundle-watch branch above it (lines 275-294) is the exemplar for
a rolldown watcher: `getRolldownWatch()`, options cast to an open record,
`(options).watch = configureRolldownWatchOptions(context)`,
`bundleUseCache = false` (rolldown has no serializable cache), watcher cast
`as unknown as RollupWatcher`.

### 5. The options builders

- `packages/packem/src/rollup/get-rollup-options.ts:955-1141` —
  `getRollupDtsOptions`: spreads `baseRollupOptions(context, "dts")`
  (which sets `treeshake: { moduleSideEffects: true, preset: "smallest" }`),
  a DTS-specific `onwarn`, an `output` ARRAY (cjs/esm/compatible variants
  with `compact`), and ~15 plugins (externals, tsconfig resolvers, replace,
  alias, the memoized dts plugin via `memoizeDtsPluginByKey`,
  fix-dts-default-cjs-exports, cjs-interop, patch-types, remove-shebang,
  license). The `output` array is only consumed by the WATCH path; the
  one-shot build drives outputs itself via the write loop.
- `packages/packem/src/rolldown/get-rolldown-options.ts` — the exemplar
  rolldown JS-options builder: wraps the shared base, adds rolldown-only
  input options (`transform`, `moduleTypes` via `ROLLDOWN_CSS_MODULE_TYPES`)
  through `as Record<string, unknown>` casts, maps `compact` → `minify`.
- `packages/packem/src/rolldown/get-rolldown.ts` — lazy importer for
  rolldown (`getRolldownBuild` / `getRolldownWatch`; check exact export
  names with `grep -n "export" packages/packem/src/rolldown/get-rolldown.ts`).

### 6. The wizard hint — `packages/packem/src/bundler/first-run-wizard.ts:52`

```ts
            { hint: "experimental, fast — falls back to rollup for DTS", label: "rolldown", value: "rolldown" },
```

(There is a related comment at line 138 of the same file.)

### 7. Known cosmetic difference (MUST handle)

Rolldown emits `//#region <path>` / `//#endregion` comments into chunk
output, **including `.d.ts` chunks**, and the paths are
machine/worktree-sensitive. This repo has been burned by that before
(path-dependent `.rolldown.snap` failures). Emitted d.ts must therefore be
stripped of these region comments in the rolldown DTS path — otherwise
`.rolldown.snap` files become machine-dependent and user-facing d.ts gains
noise. The strip belongs in packem (a small `renderChunk` output-stage
plugin in the rolldown DTS options), NOT in `@visulima/rollup-plugin-dts`.

## Commands you will need

| Purpose | Command | Run from | Expected |
|---|---|---|---|
| Install | `pnpm install --frozen-lockfile --prefer-offline` | worktree root | exit 0 |
| Build packages | `pnpm run build:packages` | worktree root | exit 0 |
| Typecheck | `pnpm run lint:types` | worktree root | exit 0 |
| Rollup TS integration | `env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/typescript.test.ts"` | `packages/packem` | all pass, no `.snap` changes |
| Rolldown TS integration | `PACKEM_TEST_BUNDLER=rolldown pnpm exec vitest run "__tests__/intigration/typescript.test.ts"` | `packages/packem` | see Step 4 |
| Rolldown full suite | `pnpm run test:rolldown` | `packages/packem` | see Step 5 |
| Watch tests (both) | `env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/watch.test.ts"` and `PACKEM_TEST_BUNDLER=rolldown pnpm exec vitest run "__tests__/intigration/watch.test.ts"` | `packages/packem` | all pass |
| Lint changed test files explicitly | `pnpm exec eslint <files>` | package dir | exit 0 |

## Scope

**In scope**:
- `packages/packem/src/rolldown/get-rolldown-options.ts` (add
  `getRolldownDtsOptions` + the region-strip output plugin)
- `packages/packem/src/bundler/build-types.ts` (bundler branch)
- `packages/packem/src/rollup/watch.ts` (DTS watcher branch)
- `packages/packem/src/packem/index.ts` (remove the rollup pull-in at
  935-939 and the info log at 1039-1048)
- `packages/packem/src/bundler/first-run-wizard.ts` (hint at line 52,
  comment at line 138)
- `packages/packem/__tests__/intigration/*.rolldown.snap` — ONLY if Step 4
  shows churn, regenerated via the documented procedure, and ONLY
  declaration-content hunks
- New/updated tests as described in Step 6

**Out of scope**:
- `packages/rollup-plugin-dts/**` — the plugin is done (plan 014). The
  region strip lives in packem.
- Any `.snap` file (the rollup family) — zero changes allowed.
- `getRollupDtsOptions` itself — do not modify it; build the rolldown
  variant alongside, reusing exported pieces.
- `docs/rolldown-status.md` — the reviewer ticks criterion 2 at merge time.
- Removing the `ensureBundlerInstalled("rollup", ...)` helper machinery —
  only the DTS-specific call site goes.

## Git workflow

- Branch: `advisor/015-rolldown-native-dts` (you are on it)
- Conventional commits; suggested final squash-or-series message:
  `feat(packem): route DTS through rolldown natively when rolldown is the bundler`
- Do NOT push or open a PR.

## Steps

### Step 0: Validation gate (MANDATORY — before touching any source file)

Write a scratch script OUTSIDE the repo (e.g. `/tmp/dts-rolldown-probe.mjs`)
that exercises the three unverified rolldown capabilities this plan depends
on, using the worktree's installed `rolldown` and built
`@visulima/rollup-plugin-dts` dist:

1. **Multi-write**: call `rolldown({ input, plugins: [dts({ emitDtsOnly: true })] })`
   once, then call `bundle.write({...})` TWICE with different `dir`/
   `entryFileNames` — rollup allows multiple `write()` on one build; confirm
   rolldown does too (build-types.ts's per-extension loop needs it).
2. **Output plugins in `write()`**: pass a `generateBundle`-only plugin in
   `write({ plugins: [...] })` and confirm its hook fires and its bundle
   mutations (deleting a key) take effect. If rolldown rejects output-stage
   plugins, test the fallback: the same plugin at INPUT level (its
   generateBundle fires per write in rollup; confirm rolldown semantics).
3. **Function-form `chunkFileNames`/`entryFileNames`** in write options.

Also confirm which input options rolldown REJECTS from the DTS option set
(`treeshake: { preset: "smallest" }`, `preserveEntrySignatures`, `onLog`,
`onwarn`) — note what errors vs. what is silently ignored.

**Gate**: capabilities 1 and 3 must work, and capability 2 must work either
at output or input level. If not → STOP, report the exact failures; the
plan's approach is unviable and the reviewer must re-scope.

Record the probe script's findings verbatim in your report. Delete the
scratch script when done.

### Step 1: `getRolldownDtsOptions` + region strip

In `packages/packem/src/rolldown/get-rolldown-options.ts`, add and export:

- `stripRolldownRegionCommentsPlugin()` — a plugin with a `renderChunk`
  handler that removes lines matching `/^\s*\/\/#(?:end)?region\b.*$/gm` from
  chunk code (declaration chunks included; the comments are rolldown-injected
  and carry worktree-sensitive paths). Return `null` when nothing changed.
- `getRolldownDtsOptions(context, fileCache)` — mirror the structure of
  `getRollupDtsOptions` (import and reuse its exported building blocks where
  they are already exported from `get-rollup-options.ts`; where the needed
  pieces are NOT exported, prefer exporting them from `get-rollup-options.ts`
  over duplicating logic — small `export` keyword additions there are
  permitted for this purpose only). Apply the rolldown deltas, following the
  existing `getRolldownOptions` idiom (`as Record<string, unknown>` casts):
  - Drop/adapt input options Step 0 found rejected (e.g. if
    `treeshake.preset` is rejected, use rolldown's accepted treeshake shape
    while preserving `moduleSideEffects: true`).
  - Add `moduleTypes` mapping non-script extensions if the probe or tests
    show rolldown chokes on them during DTS graph building (the rollup path
    stubs them via the `packem:ignore-files` load plugin, which also runs
    under rolldown — keep that plugin).
  - Append `stripRolldownRegionCommentsPlugin()` after the dts plugin chain.
  - NO `cache` property (rolldown has none).

**Verify**: `pnpm run lint:types` → exit 0.

### Step 2: Branch the one-shot build in `build-types.ts`

- When `context.options.bundler === "rolldown"`: use `getRolldownDtsOptions`
  and the rolldown build entry (see `get-rolldown.ts`; bundler/build.ts:157
  shows the established branching idiom). Skip the `rollupTypeOptions.cache`
  assignment and the `fileCache.set(DTS_CACHE_KEY, typesBuild.cache, ...)`
  persistence (no serializable cache), but keep the rest of the flow —
  hooks, the per-extension write loop, `filterSkipChunksPlugin` (at the
  level Step 0 validated), `typesBuild.close()`, `fileCache.flush()`.
- Update the seam comment at lines 143-146 (it is now stale).
- Keep hook names unchanged (`rollup:dts:options` etc. fire for both
  backends, same as `rollup:options` does in watch.ts:282).

**Verify**: `pnpm run build:packages` → exit 0. Then from
`packages/packem`, a smoke build: create a tiny fixture dir under `/tmp`
with a `package.json` (`types`, `main`/`module`), `src/index.ts` exporting a
typed function, a minimal `packem.config.ts` with `bundler: "rolldown"`,
`declaration: true`, and run the BUILT cli
(`node <worktree>/packages/packem/dist/cli/index.js build --no-validation`)
in it. Expected: exit 0, `dist/*.d.ts` (and `.d.mts`/`.d.cts` per the
package.json shape) exist, contain the exported declaration, and contain NO
`//#region`. Paste the emitted d.ts in your report.

### Step 3: Branch the DTS watcher in `watch.ts`

Mirror the bundle-watcher branching (lines 275-294): when `isRolldown`, use
`getRolldownWatch()` + `getRolldownDtsOptions`, set
`(options).watch = configureRolldownWatchOptions(context)`, no cache,
`useCache: false` for the `watchHandler({ mode: "types", ... })` call, cast
the watcher like the bundle branch does. Keep the rollup path byte-identical
for `bundler: "rollup"`.

Then remove the now-false info log in `packem/index.ts:1039-1048` and the
rollup pull-in at `packem/index.ts:935-939` (with its comment). Update the
wizard hint at `first-run-wizard.ts:52` — new hint: `"experimental, fast"`
(drop the falls-back clause; keep "experimental" — graduation criterion 5 is
the maintainer's call, not this plan's) — and fix the stale comment at
`first-run-wizard.ts:138`.

**Verify**: `pnpm run lint:types` → exit 0; `pnpm run build:packages` →
exit 0; watch suites pass under BOTH backends (commands table). Then a
manual watch smoke test on the Step 2 fixture with the built CLI
(`--watch`): first build emits d.ts, edit `src/index.ts` (change the
exported type), second build updates the d.ts. SIGINT. Paste evidence.

### Step 4: Rolldown integration suite — typescript tests

From `packages/packem`:
`PACKEM_TEST_BUNDLER=rolldown pnpm exec vitest run "__tests__/intigration/typescript.test.ts"`.

Expected outcomes, in order of likelihood:
- **Pass with no snapshot changes** — rolldown-built d.ts (region-stripped)
  matches what rollup produced. Ideal; done.
- **Snapshot mismatches that are content-equivalent** (whitespace/blank-line
  or chunk-naming differences, NO path-embedded content): regenerate ONLY
  the rolldown family per the documented procedure
  (`PACKEM_TEST_BUNDLER=rolldown pnpm exec vitest run "__tests__/intigration/typescript.test.ts" -u`
  — never regenerate without the env var set), then re-run WITHOUT `-u` to
  confirm green, and `git diff` the `.rolldown.snap` hunks: every hunk must
  be declaration-content only and contain no absolute paths. List the
  changed snapshot names in your report.
- **Real failures** (missing declarations, wrong content, crashes): STOP and
  report per test.

Also re-run the rollup lane:
`env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/typescript.test.ts"`
→ all pass, `git status` shows zero `.snap` modifications.

### Step 5: Full sweep

1. `pnpm run test:rolldown` from `packages/packem` → no NEW failures vs. the
   alpha baseline. Establish the baseline FIRST by checking
   `docs/rolldown-status.md` section 1 (which records known path-sensitive
   failures in worktree environments: `externals.test.ts`, `css.test.ts`) —
   failures in that recorded set, with diffs containing absolute worktree
   paths, are environmental; anything else is yours. Record both lists.
2. Rollup family: `env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/"`
   → pass count matches alpha baseline; zero `.snap` changes.
3. `pnpm run lint:types` (root) → exit 0.
4. Explicit eslint on every file you touched under `__tests__/` (the
   package lint script only covers `src/`).

### Step 6: Tests for the new routing

Add to `packages/packem/__tests__/intigration/typescript.test.ts` (or the
most fitting existing file — follow its structure) a rolldown-conditional
test, or extend an existing declaration test, asserting that under
`PACKEM_TEST_BUNDLER=rolldown` the emitted `.d.ts`:
- contains the expected declarations (content assertion), and
- does NOT contain `//#region` (the strip plugin's regression guard).

If the suite's architecture makes a bundler-conditional assertion awkward,
an acceptable alternative is a focused new test in `watch.test.ts` or a
small dedicated `it` using the suite's existing rolldown-aware helpers —
match whatever pattern the file already uses for bundler-specific behavior
(search for `PACKEM_TEST_BUNDLER` / `isRolldown` usages in the test dirs).

## Done criteria

ALL must hold:

- [ ] Step 0 probe findings recorded; gate passed
- [ ] Step 2 smoke build: rolldown-native d.ts emitted, correct content, no `//#region`, exit 0 — evidence pasted
- [ ] Step 3 watch smoke: d.ts updates across rebuilds under rolldown — evidence pasted
- [ ] `grep -rn "falls back to rollup for DTS" packages/packem/src` → no matches
- [ ] `grep -n "ensureBundlerInstalled(\"rollup\"" packages/packem/src/packem/index.ts` → no matches
- [ ] typescript.test.ts passes under BOTH backends; zero `.snap` (rollup family) changes; any `.rolldown.snap` changes are declaration-content-only with no absolute paths
- [ ] Full rollup integration suite matches the alpha baseline pass count
- [ ] `pnpm run test:rolldown` shows no NEW failures beyond the documented environmental set
- [ ] Root `pnpm run lint:types` exits 0
- [ ] A regression test asserts rolldown-emitted d.ts has no `//#region`

## STOP conditions

- Step 0 gate fails (any of the three capabilities unsupported with no
  validated fallback).
- Rolldown rejects a DTS input option with no documented alternative shape.
- The memoized dts plugin chain (`memoizeDtsPluginByKey`) misbehaves under
  rolldown (e.g. parallel sibling builds contaminate — watch for the
  "declaration collapses to empty facade" symptom described in
  get-rollup-options.ts:971-984).
- Any rollup-family test or snapshot changes.
- `.rolldown.snap` regeneration produces hunks with absolute paths even
  AFTER the region strip (something else embeds paths — report what).
- The Step 2 smoke build emits d.ts that differ semantically from the
  rollup-built equivalents (run the same fixture with `bundler: "rollup"`
  and diff).

## Test plan

- Step 0 probe (scratch, not committed).
- Step 2/3 manual smoke builds with pasted evidence (build + watch).
- Step 6 regression test (declaration content + no-`//#region`).
- Full existing suites both backends per Steps 4-5.

## Maintenance notes

- The DTS path is now dual-engine: changes to `getRollupDtsOptions` likely
  need a mirrored look at `getRolldownDtsOptions` — same coupling the JS
  build already has between `get-rollup-options.ts` and
  `get-rolldown-options.ts`.
- Rolldown has no serializable cache: rolldown DTS builds are always cold.
  If rolldown grows a cache API, revisit `DTS_CACHE_KEY` handling in
  build-types.ts.
- Reviewer at merge time: tick/annotate `docs/rolldown-status.md` criterion
  2 (Native DTS) and refresh its section-1 table rows for "DTS generation
  (build)" and "DTS watching"; the wizard-hint row of section 3 also changes.
- The region-strip plugin is intentionally regex-based on whole lines; if
  rolldown ever changes the comment format, the Step 6 regression test
  catches it.
