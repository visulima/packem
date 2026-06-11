# Plan 014: Make `@visulima/rollup-plugin-dts` dual-compatible (rollup + rolldown)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> This plan implements items 1–5 of the plan-012 spike's GO path
> (`plans/012-report.md`). Item 6 (packem's DTS routing) is deliberately a
> separate follow-up plan — do NOT touch packem.
>
> **Drift check (run first)**:
> `git diff --stat 0a19a13e0..HEAD -- packages/rollup-plugin-dts/`
> On any drift, compare the "Current state" excerpts against live code; on
> mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED (one-line behavior guard + new test lane; no packem changes)
- **Depends on**: plan 012's spike report (`plans/012-report.md`)
- **Category**: feature / direction
- **Planned at**: commit `0a19a13e0`, 2026-06-11

## Why this matters

The single structural reason rolldown can't be a self-sufficient packem
backend is DTS. Plan 012's spike proved the plugin is already ~97%
rolldown-compatible (rolldown 1.0.3): all 18 plugin-API touchpoints work
except one bug — with `emitDtsOnly: true`, the plugin's `transform` hook
returns `"export { }"` for **every** non-DTS module, which clobbers rolldown's
injected virtual runtime module `\0rolldown/runtime.js` and crashes the build
with `RUNTIME_MODULE_SYMBOL_NOT_FOUND`. A virtual-module guard fixes it. This
plan lands that guard plus the scaffolding (peer dep, a real rolldown test
lane, the test-alias fix) so the compat claim is enforced by CI-runnable tests.

## Current state

All line numbers at commit `0a19a13e0`.

- `packages/rollup-plugin-dts/src/generate.ts` — the `transform` hook, lines
  482–522 (abridged):

  ```ts
          transform: {
              handler(code, id) {
                  if (RE_DTS.test(id) || RE_NODE_MODULES.test(id))
                      return;

                  if (filter && !filter(id))
                      return;

                  const shouldEmit = !RE_JS.test(id) || emitJs;

                  if (shouldEmit) {
                      // ... registers dts sources / emits chunks ...
                  }

                  if (emitDtsOnly) {
                      if (RE_JSON.test(id))
                          return "{}";

                      return "export { }";   // ← clobbers \0rolldown/runtime.js
                  }
                  // ... type-stripping path ...
  ```

  For `"\0rolldown/runtime.js"`: `RE_DTS` and `RE_NODE_MODULES` don't match,
  `RE_JS` matches (so nothing is emitted), and the `emitDtsOnly` branch
  replaces the runtime module with an empty export → rolldown's linker can't
  find `__defProp`, `__esm`, etc.

- `packages/rollup-plugin-dts/__tests__/index.test.ts:4`:

  ```ts
  import { rollupBuild as rolldownBuild } from "@sxzz/test-utils";
  ```

  The entire suite runs against **rollup**; the `rolldownBuild` name is a
  misnomer left over from the upstream port.

- `packages/rollup-plugin-dts/package.json`: `rollup` is a peer dependency;
  rolldown is not declared at all. The workspace pins rolldown via the pnpm
  catalog (`pnpm-workspace.yaml`, `rolldown@1.x` — check the exact catalog
  entry name with `grep -n "rolldown" pnpm-workspace.yaml`).
- Fixtures: `packages/rollup-plugin-dts/__tests__/fixtures/` (e.g.
  `minimal.ts`, `basic.ts`, `function-overloads.ts`, `cyclic-import/`). The
  spike validated 7 of them under rolldown with `emitDtsOnly: false` —
  semantically identical d.ts output, except rolldown adds
  `//#region`/`//#endregion` comments to chunk code.
- The spike validated the fix empirically: with a `\0` guard wrapped around
  the transform handler, all fixtures pass under rolldown in both modes.

## Commands you will need

| Purpose | Command | Run from | Expected |
|---|---|---|---|
| Install | `pnpm install --frozen-lockfile --prefer-offline` | worktree root | exit 0 |
| Unit tests | `pnpm run test` | `packages/rollup-plugin-dts` | all pass |
| Typecheck | `pnpm run lint:types` | `packages/rollup-plugin-dts` | exit 0 |
| Lint src | `pnpm run lint:eslint` | `packages/rollup-plugin-dts` | exit 0 |
| Lint new test files (src-only script misses them) | `pnpm exec eslint __tests__/rolldown.test.ts __tests__/index.test.ts` | `packages/rollup-plugin-dts` | exit 0 |
| Build all (downstream check) | `pnpm run build:packages` | worktree root | exit 0 |
| Packem DTS-heavy integration | `env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/typescript.test.ts"` | `packages/packem` | all pass, no `.snap` changes |

## Scope

**In scope**:
- `packages/rollup-plugin-dts/src/generate.ts` (the transform-handler guard
  only)
- `packages/rollup-plugin-dts/package.json` (peer + dev dependency for
  rolldown)
- `pnpm-lock.yaml` (only as a consequence of the package.json change; run
  `pnpm install` — without `--frozen-lockfile` — once after editing
  package.json, and verify the lock diff is confined to the
  rollup-plugin-dts importer)
- `packages/rollup-plugin-dts/__tests__/rolldown.test.ts` (create)
- `packages/rollup-plugin-dts/__tests__/index.test.ts` (alias rename only)

**Out of scope**:
- ANY file in `packages/packem` (the routing change is plan 015).
- `fake-js.ts` — the optional `//#region` comment-stripping from the spike's
  item 5 is deferred; the region comments are cosmetic and only appear in
  rolldown output. Do not implement it.
- The plugin's rollup-facing behavior — zero output changes for rollup builds
  (snapshots must not change).
- `docs/rolldown-status.md` — the reviewer updates criterion 2 at merge time.

## Git workflow

- Branch: `advisor/014-rolldown-dts-compat` (you are on it)
- Conventional commit, e.g.
  `feat(rollup-plugin-dts): support rolldown via virtual-module guard and a rolldown test lane`
- Do NOT push or open a PR.

## Steps

### Step 1: The virtual-module guard

At the very top of the `transform` handler in `generate.ts` (before the
`RE_DTS` check), add:

```ts
                  // Bundler-injected virtual modules (rolldown's
                  // \0rolldown/runtime.js, rollup convention \0...) must pass
                  // through untouched: emitDtsOnly's "export { }" replacement
                  // would strip their runtime exports and break linking.
                  if (id.startsWith("\0"))
                      return;
```

**Verify**: `pnpm run lint:types` + `pnpm run lint:eslint` in
`packages/rollup-plugin-dts` → exit 0, then `pnpm run test` → all pass (this
asserts the guard changes nothing for the rollup path — no fixture uses `\0`
ids in transform-relevant positions).

### Step 2: Declare rolldown

In `packages/rollup-plugin-dts/package.json`:
- Add `rolldown` to `peerDependencies` with the same version range style the
  package uses for `rollup`, and mark it optional in `peerDependenciesMeta`
  (`"rolldown": { "optional": true }`). Mirror how other workspace packages
  declare optional peers if an exemplar exists (`grep -rn "peerDependenciesMeta" packages/*/package.json`).
- Add `rolldown` to `devDependencies` using the workspace catalog reference
  (`"rolldown": "catalog:..."` — copy the exact catalog form used by
  `packages/packem/package.json` for rolldown).

Run `pnpm install` (NOT frozen) once. **Verify**:
`git diff --stat -- pnpm-lock.yaml` is small and only concerns the
rollup-plugin-dts importer/snapshot entries; nothing else bumps. If unrelated
packages move, restore (`git checkout 0a19a13e0 -- pnpm-lock.yaml`) and re-run
plain `pnpm install` — if it still pulls unrelated bumps, STOP and report.

### Step 3: Fix the alias misnomer

In `__tests__/index.test.ts`, change line 4 to import without the misleading
rename and update the call sites' identifier accordingly
(`rollupBuild as rolldownBuild` → plain `rollupBuild`, rename usages). No
behavioral change; the diff should be mechanical.

**Verify**: `pnpm run test` → identical pass count to Step 1.

### Step 4: The rolldown test lane

Create `packages/rollup-plugin-dts/__tests__/rolldown.test.ts` (vitest, match
the style of `index.test.ts`):

- Import `build` (or `rolldown`) from `rolldown` directly.
- Cover at least 4 fixtures the spike validated (`minimal.ts`, `basic.ts`,
  `function-overloads.ts`, and the multi-entry `cyclic-import/`), each in BOTH
  modes: `emitDtsOnly: false` and `emitDtsOnly: true`.
- For each run, assert (a) the build does not throw, (b) a `.d.ts` chunk is
  emitted, and (c) the d.ts content contains the fixture's key declarations
  (e.g. for `function-overloads.ts`, the overload signatures). Prefer explicit
  `expect(code).toContain(...)` assertions over snapshots — rolldown output
  embeds `//#region` comments with absolute-ish paths that make snapshots
  machine/worktree-sensitive (a known pain point in this repo).
- Helper pattern: write your own small `rolldownBuildHelper` in the test file
  (input fixture path → `{ fileName, code }[]`), modeled on what
  `@sxzz/test-utils`'s `rollupBuild` provides. The spike's scratch script
  (described in `plans/012-report.md` appendix) used
  `rolldown` + `bundle.generate()`/`write()` to a temp dir — either in-memory
  generate or temp-dir write is fine; clean up temp dirs in `afterEach`.

**Verify**: `pnpm run test` in `packages/rollup-plugin-dts` → all pass,
including the new rolldown lane (≥8 new test cases: 4 fixtures × 2 modes).
Then `pnpm exec eslint __tests__/rolldown.test.ts __tests__/index.test.ts` →
exit 0 (the package's `lint:eslint` script only covers `src/` — test files
must be linted explicitly; this caught a miss in a previous plan).

### Step 5: Prove no rollup regression

**Verify all**:
1. `pnpm run build:packages` (worktree root) → exit 0.
2. From `packages/packem`:
   `env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/typescript.test.ts"` → all pass.
3. `git status --short` → no modified `.snap` / `.rolldown.snap` files.

## Test plan

- New `__tests__/rolldown.test.ts`: ≥4 fixtures × 2 emit modes under real
  rolldown, content assertions (not snapshots).
- Alias cleanup in `index.test.ts` is rename-only; suite count unchanged.
- Regression: full plugin suite + packem `typescript.test.ts`, zero snapshot
  changes.

## Done criteria

ALL must hold:

- [ ] `grep -n 'startsWith("\\\\0")' packages/rollup-plugin-dts/src/generate.ts` finds the guard in the transform handler
- [ ] `pnpm run test` in `packages/rollup-plugin-dts` passes, including ≥8 new rolldown-lane cases (both `emitDtsOnly` modes)
- [ ] `pnpm run lint:types`, `pnpm run lint:eslint`, AND the explicit eslint run on both test files → exit 0
- [ ] packem `typescript.test.ts` passes; `git status` shows no `.snap` changes
- [ ] `rolldown` declared as optional peer + dev dependency; lockfile diff confined to this package
- [ ] Changes confined to the 5 in-scope files

## STOP conditions

- The excerpts don't match live code (drift).
- The guard makes ANY existing rollup-path test fail or changes any snapshot —
  the guard leaked into the success path; report, don't widen the guard
  condition.
- `emitDtsOnly: true` under rolldown still crashes WITH the guard — the spike's
  fix validation no longer holds (rolldown version moved?); report the exact
  error and rolldown version.
- The lockfile refuses to stay minimal (Step 2).

## Maintenance notes

- This makes the plugin dual-engine. Any future hook added to the plugin must
  be checked against rolldown's plugin-API support (the full inventory table
  is in `plans/012-report.md`).
- `shouldTransformCachedModule` is silently ignored by rolldown (no module
  cache) — fine today; if rolldown ever grows a cache, revisit.
- Follow-up (plan 015): packem routes DTS through rolldown natively
  (`packages/packem/src/packem/index.ts:935-939`, `:1039-1048`,
  `packages/packem/src/rollup/watch.ts:282-284`) and
  `docs/rolldown-status.md` criterion 2 gets ticked.
- The deferred `//#region` strip (spike item 5) matters only when packem
  starts emitting rolldown-built d.ts to users — fold it into plan 015's
  acceptance checks.
