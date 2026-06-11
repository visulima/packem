# Plan 010: Measured experiment — raise the vitest thread cap (currently 2) if it's actually faster and stable

> **Executor instructions**: This is an EXPERIMENT plan with a keep-or-revert
> gate. Do not commit the config change unless the measurements meet the keep
> criteria in Step 4. If anything in "STOP conditions" occurs, stop and report.
>
> **Drift check (run first)**:
> `git diff --stat 4964b64c7..HEAD -- tools/get-vitest-config.ts`
> If `maxThreads` is no longer `2`, this plan is stale — mark it REJECTED in
> `plans/README.md` and stop.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: MED (raising parallelism can unmask latent test interference)
- **Depends on**: none
- **Category**: perf / dx
- **Planned at**: commit `4964b64c7`, 2026-06-11

## Why this matters

Every vitest suite in the monorepo inherits `tools/get-vitest-config.ts`, which
caps execution at `maxThreads: 2` and `maxConcurrency: 2` ("Conservative thread
settings for stability"). The packem integration suite is dozens of tests that
each spawn full CLI builds; on a many-core dev machine and on CI runners this
cap may be leaving large wall-clock savings on the table — or it may be
load-bearing (each test already spawns CPU-heavy child builds, so threads
multiply load). Nobody has measured. This plan measures, then keeps or reverts.

## Current state

`tools/get-vitest-config.ts:15-25`:

```ts
            pool: "threads",
            poolOptions: {
                threads: {
                    // Conservative thread settings for stability
                    maxThreads: 2,
                    minThreads: 1,
                    isolate: true,
                    useAtomics: true,
                },
            },
            maxConcurrency: 2,
```

Consumers: every `packages/*/vitest.config.ts` imports `getVitestConfig`
(packem, packem-plugins, packem-rollup, packem-rolldown, packem-share,
rollup-plugin-css, css-style-inject). `packages/packem/vitest.config.ts` also
implements the dual-snapshot `resolveSnapshotPath` and a guard that hard-fails
`vitest -u` when `PACKEM_TEST_BUNDLER` is unset — do not touch that logic.

Integration tests use per-test temp dirs (`temporaryDirectory()` /
`mkdtempSync`), which is why higher parallelism is plausible.

## Commands you will need

| Purpose | Command | Run from | Expected |
|---|---|---|---|
| Build packages | `pnpm run build:packages` | repo root | exit 0 |
| Timed integration run | `time env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/"` | `packages/packem` | all pass; note `real` time |
| Other-package suites | `pnpm run test` | each of `packages/packem-plugins`, `packages/rollup-plugin-dts`, `packages/rollup-plugin-css` | all pass |
| Typecheck | `pnpm run lint:types` | repo root | exit 0 |

## Scope

**In scope**:
- `tools/get-vitest-config.ts` (only the `poolOptions.threads` block and
  `maxConcurrency`)

**Out of scope**:
- `packages/packem/vitest.config.ts` (snapshot-path + `-u` guard logic)
- Any per-package vitest config
- CI workflow files — CI picks the change up automatically via the shared config
- Test files themselves — if tests fail at higher parallelism, that's a revert
  signal, not a license to "fix" tests in this plan

## Git workflow

- Branch: `advisor/010-vitest-threads`
- If kept: conventional commit, e.g. `perf(tools): raise vitest thread cap after measured stability run`
  — include the measurement table in the commit body.
- If reverted: commit ONLY a note in `plans/README.md` (status: REJECTED with
  the numbers). No source change.

## Steps

### Step 1: Baseline (current `maxThreads: 2`)

`pnpm run build:packages`, then from `packages/packem` run the timed
integration command **twice**. Record both `real` times and the pass count.

**Verify**: both runs fully pass (if the baseline itself is flaky, STOP — you
can't evaluate the experiment against a flaky baseline).

### Step 2: Raise the cap

In `tools/get-vitest-config.ts` set:

```ts
                    maxThreads: Math.max(2, Math.min(8, Math.floor((os.availableParallelism?.() ?? 4) / 2))),
```

…or, if importing `node:os` into this file is awkward with its current imports,
a plain `maxThreads: 4` is an acceptable first probe. Raise `maxConcurrency` to
match the chosen value. Keep `isolate: true` and `useAtomics: true` unchanged.

**Verify**: `pnpm run lint:types` → exit 0.

### Step 3: Measure (raised cap)

Re-run the timed integration command from `packages/packem` **three times**.
Then run `pnpm run test` once in `packages/packem-plugins`,
`packages/rollup-plugin-dts`, and `packages/rollup-plugin-css`.

Record: three `real` times, pass/fail per run, and any test that failed in any
run.

### Step 4: Keep-or-revert gate

**KEEP** only if ALL hold:
- median raised-cap time is ≥20% faster than the baseline median;
- all three integration runs fully passed (zero flaky failures);
- the three other-package suites passed.

Otherwise **REVERT** (`git checkout -- tools/get-vitest-config.ts`) and record
the numbers in `plans/README.md` as the rationale.

### Step 5: Record the outcome

Either way, put the measurement table (baseline ×2, raised ×3, machine core
count) into the commit body (if kept) and the `plans/README.md` status row.

## Test plan

The experiment IS the test: 2 baseline runs + 3 raised-cap runs of the packem
integration suite + 3 sibling-package suites. No new test files.

## Done criteria

- [ ] Measurement table exists (commit body or README row): 5 timed runs + core count
- [ ] If kept: `tools/get-vitest-config.ts` is the ONLY modified source file, typecheck green, all suites in Step 3 green
- [ ] If reverted: `git status` clean except `plans/README.md`
- [ ] No `.snap` / `.rolldown.snap` files modified
- [ ] `plans/README.md` status row updated (DONE with numbers, or REJECTED with numbers)

## STOP conditions

- Baseline runs are themselves flaky (Step 1) — report which test, do not proceed.
- A raised-cap failure looks like data corruption rather than flakiness (e.g.
  snapshot files modified, cross-test temp-dir collisions) — revert immediately
  and report the colliding tests.
- The machine has ≤4 cores — the experiment can't distinguish thread-cap from
  CPU saturation; report and defer to a CI-based measurement.

## Maintenance notes

- If kept, watch the next ~10 CI runs for new flakiness in the `test` matrix
  (3 node versions × ubuntu + macos); a flaky-after-merge signal means revert,
  not retry-loops.
- The `VITEST_SEQUENCE_SEED = Date.now()` + `console.log` at the top of
  `get-vitest-config.ts` makes run ordering non-reproducible across runs;
  if flakiness appears, capture the printed seed to reproduce.
