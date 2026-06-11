# Plan 012: Spike — can `@visulima/rollup-plugin-dts` run under rolldown? (go/no-go report)

> **Executor instructions**: This is a time-boxed INVESTIGATION plan (one day).
> The deliverable is a written go/no-go report; prototype code stays
> uncommitted or lands in a clearly-marked scratch directory listed below.
> Honor the STOP conditions. Update this plan's row in `plans/README.md` when
> done.
>
> **Drift check (run first)**:
> `git diff --stat 4964b64c7..HEAD -- packages/rollup-plugin-dts/src packages/packem/src/rollup/watch.ts`
> If `watch.ts` no longer says "isn't rolldown-compatible yet" (lines ~265-268),
> someone may have done this work — investigate `git log` for it and reconcile
> before proceeding.

## Status

- **Priority**: P3
- **Effort**: M (time-box: one day)
- **Risk**: LOW (report-only deliverable)
- **Depends on**: none (feeds plan 011's criterion 2)
- **Category**: direction
- **Planned at**: commit `4964b64c7`, 2026-06-11

## Why this matters

The single structural reason rolldown can't be a self-sufficient packem backend
is DTS: `packages/packem/src/rollup/watch.ts:265-268` ("DTS, when enabled,
still watches through rollup below — @visulima/rollup-plugin-dts isn't
rolldown-compatible yet") and `packages/packem/src/packem/index.ts:1034-1043`
(DTS watching routed through rollup, with a user-facing info log). Under the
rolldown backend, packem therefore runs **two bundlers** whenever declarations
are on. Historical note that makes this spike cheaper than it looks: this
plugin was migrated **from rolldown to rollup** (commit
`feat(rollup-plugin-dts): migration from rolldown to rollup with oxc/dts-resolver`
— find it via `git log --oneline --all | grep "migration from rolldown"`), so a
rolldown-compatible ancestor exists in history as a reference.

This spike answers: what exactly breaks today, how big is the gap, and is
dual-compat (one plugin, both engines) or a fork the right shape — without
committing to the build-out.

## Current state

- `packages/rollup-plugin-dts/src/` — the plugin: `index.ts` (entry),
  `generate.ts` (core hooks: `buildStart`/`buildEnd`/`transform`/
  `generateBundle` + tsc/tsgo/oxc emit paths), `fake-js.ts` (renders d.ts
  through a fake-JS AST pipeline; heavy `renderChunk`/`generateBundle` work),
  `resolver.ts`, `dts-input.ts`, `banner.ts`, `filename.ts`, `tsgo.ts`,
  `tsc/` (worker + emit).
- Rolldown version pinned in the workspace: see `pnpm-workspace.yaml` catalog
  (`rolldown@1.x`). Rolldown advertises rollup-plugin compatibility; known
  divergences relevant here (from packem's own porting experience, recorded in
  the repo's plugin comments): `this.parse()` availability differs by hook
  (works in `renderChunk` under rolldown), and some rollup-only plugins were
  kept off rolldown because of `this.parse()` usage —
  `packages/packem-rolldown/src/index.ts` comment lists them.
- The plugin consumes rollup-specific types (`Plugin`, `PluginContext`) — type
  compat vs runtime compat are separate questions; runtime is what matters for
  the spike.
- Existing test harness: `packages/rollup-plugin-dts/__tests__/index.test.ts`
  and `fixtures/` — tests build small fixtures through **rollup** with the
  plugin and snapshot the d.ts output. This harness is the template for the
  rolldown prototype run.

## Commands you will need

| Purpose | Command | Run from | Expected |
|---|---|---|---|
| Plugin unit/snapshot tests | `pnpm run test` | `packages/rollup-plugin-dts` | all pass (baseline) |
| Typecheck | `pnpm run lint:types` | `packages/rollup-plugin-dts` | exit 0 |
| Find the migration commit | `git log --oneline --all \| grep -i "rolldown"` | repo root | the migration commit SHA |

## Scope

**In scope (committable)**:
- `plans/012-report.md` (create — the deliverable)
- `plans/README.md` (status row)

**Experimentation allowed but NOT committed**: a scratch script (e.g.
`packages/rollup-plugin-dts/__tests__/temp/rolldown-spike.ts` — the `temp/`
dir already exists and is for throwaway use) that feeds 2–3 existing fixtures
through `rolldown` + the plugin.

**Out of scope**:
- Shipping any compatibility change to the plugin.
- Touching packem's `watch.ts` / `index.ts` routing.
- Adding `rolldown` as a dependency of `rollup-plugin-dts` (use the workspace's
  existing rolldown installation from the scratch script).

## Git workflow

- Branch: `advisor/012-rolldown-dts-spike`
- One commit: `docs(plans): rolldown-compat spike report for rollup-plugin-dts (plan 012)`

## Steps

### Step 1: Hook + context-API inventory

Grep the plugin source for every rollup plugin-API touchpoint:
hooks implemented (`buildStart`, `buildEnd`, `transform`, `resolveId`, `load`,
`renderStart`, `renderChunk`, `generateBundle`, `options`…), and every
`this.<method>` context call (`this.parse`, `this.resolve`, `this.error`,
`this.emitFile`, `this.getModuleInfo`…). Produce a table: API → where used
(file:line) → rolldown support status (check rolldown's plugin-API docs for the
pinned version; note any "partial" entries).

### Step 2: Prototype run

Write the scratch script: import `rolldown` (workspace install), build 2–3 of
the **existing** test fixtures (start with the simplest in
`__tests__/fixtures/`) with the dts plugin attached, write output to a temp
dir. Run it. For each fixture record: builds? d.ts emitted? d.ts identical to
the rollup-built baseline (diff them)? If it crashes, record the exact error
and which hook/context call it implicates.

### Step 3: Probe the known risk areas

Whatever Step 2's result, explicitly check:
- `fake-js.ts` AST pipeline under rolldown's `renderChunk`/`generateBundle`
  (chunk shape differences, `chunk.moduleIds` availability).
- The parallel fork path (`generate.ts` `parallel: true`) — does it behave
  identically? (It's engine-independent child-process code; confirm.)
- Sourcemap output (`source-map.test.ts` covers the rollup baseline).

### Step 4: Write `plans/012-report.md`

Must contain: the API inventory table (Step 1), per-fixture prototype results
with diffs summarized (Step 2), risk-area notes (Step 3), the migration-commit
reference and what the rolldown-era ancestor did differently (one paragraph),
and a **recommendation**: GO (dual-compat feasible — list the N concrete
changes needed, each with file:line and an effort guess) or NO-GO (list the
hard blockers, each with the rolldown limitation it hits, and what upstream
rolldown change would unblock). Coarse effort estimate for the GO path,
labeled as coarse.

### Step 5: Clean up

Delete or leave the scratch script uncommitted; `git status --short` must show
only the report + index.

**Verify**: `pnpm run test` in `packages/rollup-plugin-dts` still passes
(nothing was accidentally modified).

## Test plan

No new committed tests. The prototype runs against existing fixtures; the
baseline comparison is the rollup-built output of those same fixtures.

## Done criteria

- [ ] `plans/012-report.md` exists with: API inventory table, ≥2 fixture prototype results, risk-area notes, GO/NO-GO with itemized follow-up work
- [ ] `pnpm run test` in `packages/rollup-plugin-dts` passes (tree unmodified)
- [ ] `git status --short` shows only the report and `plans/README.md`
- [ ] `plans/README.md` status row updated, and plan 011's criterion-2 note
      referenced (if plan 011's doc exists, add one line linking the report)

## STOP conditions

- Rolldown cannot even be imported/run from the scratch script within ~1 hour
  (environment issue) — report the blocker.
- The pinned rolldown version's plugin docs are unreachable AND behavior can't
  be established empirically — write the report with "unverified" markers
  rather than guessing.
- Time-box reached — ship partial findings with an explicit "not yet checked"
  list.

## Maintenance notes

- If GO: the follow-up implementation plan should make the rolldown fixture run
  a permanent test lane in `rollup-plugin-dts` (mirroring packem's
  dual-bundler suites) before any compat code lands.
- If NO-GO: plan 011's criterion 2 resolves to "DTS stays on rollup, by
  design" — the wizard hint and AGENTS.md wording should then be updated to
  present it as a design decision, not a fallback.
