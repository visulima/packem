# Plan 009: Investigation spike — why does CSS disable the watch-mode cache, and can the hack go?

> **Executor instructions**: This is an INVESTIGATION plan. The deliverable is
> a written report, not a code change. You may create throwaway fixture
> projects in temp directories and make LOCAL, UNCOMMITTED experimental edits
> to test hypotheses — but the only files you commit are the report and the
> `plans/README.md` status row. If anything in "STOP conditions" occurs, stop
> and report.
>
> **Drift check (run first)**:
> `git diff --stat 4964b64c7..HEAD -- packages/packem/src/rollup/watch.ts`
> If the `useCache` hack (excerpt below) is gone, mark this plan REJECTED
> (already fixed) in `plans/README.md` and stop.

## Status

- **Priority**: P3
- **Effort**: M (time-box: one day)
- **Risk**: LOW (investigation only; experiments stay uncommitted)
- **Depends on**: none
- **Category**: tech-debt / perf
- **Planned at**: commit `4964b64c7`, 2026-06-11

## Why this matters

`packages/packem/src/rollup/watch.ts:239-243`:

```ts
    let useCache = true;

    // TODO: find a way to remove this hack
    // This is a hack to prevent caching when using css loaders
    if (context.options.rollup.css) {
        useCache = false;
    }
```

Any project with CSS enabled loses rollup's incremental cache in watch mode —
every rebuild re-does full module processing. CSS-heavy projects (the ones that
rebuild most often) pay the most. Nobody recorded *why* the cache breaks with
CSS loaders, so the hack can't be safely removed without this investigation.

## Current state

- `packages/packem/src/rollup/watch.ts` — the hack (lines 237–243). `useCache`
  flows into: (a) `fileCache.set("rollup-watch.json", event.result.cache)` in
  the BUNDLE_END handler (line 92–94), and (b) cache restoration when building
  the rollup options for the watcher (read the `startWatchers` rollup branch
  below line 284 to see exactly where the persisted cache is loaded).
- `packages/rollup-plugin-css/src/css-plugin.ts` — the CSS plugin
  (~7.2k LOC package). Prime suspect: state that ends up inside rollup's
  serializable `cache` (e.g. `meta` on transform results) or module-level state
  that survives across rebuilds and goes stale.
- `FileCache` comes from `@visulima/packem-share`; the watch cache key is
  `rollup-watch.json` (`watch.ts:46`).
- Note: the rolldown watcher path sets `bundleUseCache = false` unconditionally
  (rolldown manages its own incremental state, `watch.ts:282-284`) — this spike
  concerns the **rollup** backend only.
- Existing watch tests: `packages/packem/__tests__/intigration/watch.test.ts`
  (spawns the built CLI, polls stdout). A CSS-in-watch test does not exist.

## Commands you will need

| Purpose | Command | Run from | Expected |
|---|---|---|---|
| Build packages | `pnpm run build:packages` | repo root | exit 0 |
| Watch tests | `env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/watch.test.ts"` | `packages/packem` | all pass |
| CSS integration tests | `env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/css.test.ts"` | `packages/packem` | all pass |
| Typecheck | `pnpm run lint:types` | repo root | exit 0 |

## Scope

**In scope (committable)**:
- `plans/009-report.md` (create — the deliverable)
- `plans/README.md` (status row)

**Experimentation allowed but MUST NOT be committed**:
- Local edits to `watch.ts` (flipping `useCache`), fixture projects in temp
  dirs, debug logging.

**Out of scope**:
- Committing any fix. If the investigation finds an easy, verified fix, the
  report says so and a follow-up plan implements it.

## Git workflow

- Branch: `advisor/009-css-cache-spike`
- One commit: `docs(plans): report on the CSS watch-cache hack (plan 009)`
- Before committing, `git status` must show only the report + index changes.

## Steps

### Step 1: Archaeology

`git log -L 230,250:packages/packem/src/rollup/watch.ts` (and/or
`git log --all --oneline -S "prevent caching when using css"`) to find the
commit that introduced the hack and any linked issue/message explaining the
original breakage. Record findings in the report.

### Step 2: Build a reproduction fixture

Create a temp project (model on how `watch.test.ts` builds one: `package.json`
with `module: "dist/index.js"`, a `src/index.js` importing a `src/style.css`,
packem config with CSS enabled — see `packages/packem/__tests__/intigration/css.test.ts`
for working CSS config shapes). Run the built packem CLI in `--watch`, touch
files, and record rebuild times from the `⚡️ Build run in Xms` log lines.

**Verify**: you can produce a sequence of ≥3 rebuilds and capture their timings.

### Step 3: Flip the hack and observe

Locally set `useCache = true` with CSS enabled (delete the `if` block), rebuild
packem (`pnpm run build:packages`), and repeat Step 2. Answer in the report:

1. Do rebuilds get faster? By how much (numbers)?
2. Is the output **correct** after: (a) editing the JS entry, (b) editing the
   CSS file, (c) adding a new CSS import? Compare emitted `dist/` contents
   against a no-cache run after each change.
3. Does anything crash or warn?

### Step 4: Root-cause whatever breaks

If Step 3 shows breakage, identify the mechanism: inspect what the CSS plugin
stores per-module (transform `meta`, module-scope maps in
`packages/rollup-plugin-css/src/css-plugin.ts`, loader state under
`src/loaders/`), and whether stale entries from rollup's restored `cache`
bypass the CSS plugin's `transform` on unchanged modules (rollup skips
`transform` for cached modules — a CSS plugin that accumulates per-build state
in `buildStart`/`generateBundle` from transform-time side effects would see
missing entries). Name the exact file:line responsible in the report.

### Step 5: Run the existing suites against the flipped state (informational)

With the local flip still in place:
`css.test.ts` and `watch.test.ts` runs (commands above). Record pass/fail —
these suites mostly don't exercise watch+CSS together, so a green run here is
NOT proof of safety; say so in the report.

### Step 6: Write `plans/009-report.md` and revert experiments

The report must contain: the introducing commit + original symptom (Step 1),
timing numbers with/without cache (Steps 2–3), correctness observations, the
root-cause mechanism with file:line (Step 4, or "could not reproduce breakage —
hack may be removable, but a watch+CSS integration test must land first"), and
a recommendation: one of (a) removable now + the test to add, (b) fixable via
<specific change>, (c) keep the hack, documented why. Then
`git checkout -- packages/packem/src/rollup/watch.ts` and rebuild.

**Verify**: `git status --short` shows only `plans/009-report.md` and
`plans/README.md`.

## Done criteria

- [ ] `plans/009-report.md` exists with: introducing commit, timings, correctness matrix, root cause (or explicit non-repro), recommendation
- [ ] No source files modified in the final commit (`git status --short`)
- [ ] Working tree rebuilt from clean source (`pnpm run build:packages` exit 0)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The hack is already gone at HEAD (see drift check) — mark REJECTED.
- You cannot get a watch fixture rebuilding at all within ~2 hours — report the
  blocker instead of burning the time-box on harness issues.
- The time-box (one day) is reached — write up whatever is established; partial
  findings are an acceptable deliverable.

## Maintenance notes

- Whoever implements the follow-up: a watch+CSS integration test (rebuild
  twice, assert CSS output correct both times) is a prerequisite for removing
  the hack regardless of the root cause.
- This spike's findings feed the known deferred item "CSS watch caching"
  (`plans/README.md`, prior-run notes).
