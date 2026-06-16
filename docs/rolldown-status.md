# Rolldown backend: support status and graduation criteria

> **As of 2026-06-11 (rolldown 1.0.3).** These criteria are proposals; the
> maintainer decides by ticking (or editing) the checkboxes below.

## 1. Status today

| Dimension                | State                                                                                                                                                                                                                                                                                                                                                              | Source                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Wizard label             | **"experimental, fast — falls back to rollup for DTS"**                                                                                                                                                                                                                                                                                                            | `packages/packem/src/bundler/first-run-wizard.ts:52`                                           |
| CI job                   | Advisory — runs on every PR touching packages but is **excluded from `test-required-check`**. Rationale: "known cache/ordering flakiness; surface regressions without gating merges until it has proven stable."                                                                                                                                   | `.github/workflows/test.yml:150-196`                                                           |
| DTS generation (build)   | Always routes through rollup, even when `bundler: "rolldown"`. Rollup is pulled in automatically when rolldown + `declaration: true` is configured.                                                                                                                                                                                                                | `packages/packem/src/packem/index.ts:930-935`                                                  |
| DTS watching             | A log line informs the user: _"Declaration (DTS) watching runs through rollup; the bundle watcher is rolldown."_ Watching also falls back to rollup for DTS.                                                                                                                                                                                                       | `packages/packem/src/packem/index.ts:1035-1040`, `packages/packem/src/rollup/watch.ts:266-268` |
| `packem-rolldown` pkg    | Empty `export {}` placeholder. No rolldown-only plugins have landed yet. The package is versioned and released with every alpha bump.                                                                                                                                                                                                                              | `packages/packem-rolldown/src/index.ts`                                                        |
| Local suite (2026-06-11) | **465 passed / 5 failed / 37 skipped** across 507 tests (44 test files: 37 passed, 3 failed, 4 skipped). The 5 failures are snapshot mismatches in `externals.test.ts` and `css.test.ts` whose diffs contain absolute worktree paths — likely load-induced or path-sensitive rather than logic failures; CI on the canonical checkout is the authoritative signal. | `pnpm run test:rolldown` in `packages/packem`                                                  |

## 2. Graduation criteria (proposed)

Each checkbox is a decision point for the maintainer, not a preset constraint.

- [ ] **CI stability**: `test-rolldown` is green on **20 consecutive** scheduled or PR
      runs with zero flaky reruns. Once that bar is met, add `test-rolldown` to
      `test-required-check.needs` in `.github/workflows/test.yml:201-204` so
      rolldown failures gate merges alongside the rollup suite.

    > Rationale for N = 20: that is roughly two weeks of typical PR cadence
    > (about 10 merges/week), which is long enough to observe intermittent
    > cache/ordering flakes without requiring months of data. The maintainer may
    > lower this threshold once the root cause of current flakiness is
    > understood and fixed.

- [ ] **Native DTS**: rolldown-native DTS generation lands (per the plan-012
      spike GO path described below), **or** an explicit documented decision is
      recorded that "DTS stays on rollup by design" and the wizard hint is
      reworded from _"falls back to rollup for DTS"_ to _"DTS runs through rollup
      by design"_.

    Plan-012 spike (2026-06-11, on branch
    `advisor/012-rolldown-dts-spike`) returned **GO (conditional)**:
    `@visulima/rollup-plugin-dts` is ~97% rolldown-compatible today (rolldown
    1.0.3). The single hard blocker was a one-line virtual-module guard in
    `packages/rollup-plugin-dts/src/generate.ts`: `if (id.startsWith("\0"))`
    prevents the plugin's `transform` hook from clobbering rolldown's injected
    `\0rolldown/runtime.js` module, which previously caused a fatal
    `RUNTIME_MODULE_SYMBOL_NOT_FOUND` error.

    **Progress (2026-06-11, plan 014 merged):** the plugin side is DONE — the
    virtual-module guard landed, rolldown is declared as an optional peer (+
    dev) dependency, the `rollupBuild as rolldownBuild` alias misnomer in
    `__tests__/index.test.ts` is fixed, and a real rolldown test lane
    (`packages/rollup-plugin-dts/__tests__/rolldown.test.ts`, 4 fixtures × both
    `emitDtsOnly` modes, content assertions) enforces the compat claim.
    Remaining before this criterion can be ticked (plan 015): update
    `packages/packem/src/packem/index.ts` and `packages/packem/src/rollup/watch.ts`
    to route DTS through rolldown when rolldown is the selected bundler, and
    decide on stripping rolldown `//#region` comments from emitted d.ts.

- [ ] **Snapshot currency**: `.rolldown.snap` files are kept up-to-date by the
      advisory CI job. "Current" means: no obsolete snapshot entries that differ
      from what `pnpm run test:rolldown -- -u` would regenerate, and no
      rolldown-specific snapshot in the `test-rolldown` job's failure set on the
      canonical branch. The advisory job already exercises the `.rolldown.snap`
      family on every qualifying PR.

- [ ] **Package decision**: decide the fate of `packages/packem-rolldown`
      — either (a) activate it when the first rolldown-only plugin lands and
      export it from `src/index.ts`, or (b) stop releasing the placeholder and
      remove the package from the release pipeline until real content exists.
      Releasing an empty barrel with every alpha bump is low-cost but may confuse
      consumers who install it expecting plugin exports.

- [ ] **Wizard label**: drop the word _"experimental"_ from the wizard hint in
      `packages/packem/src/bundler/first-run-wizard.ts:52`. This is the
      user-visible graduation signal. Do this only after the CI-stability and
      DTS criteria above are resolved.

## 3. What graduation changes (file-by-line)

| Criterion met                         | File:line to edit                                                               | Change                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| CI stability (criterion 1)            | `.github/workflows/test.yml:202`                                                | Add `"test-rolldown"` to `test-required-check.needs`                                                              |
| CI stability (criterion 1)            | `.github/workflows/test.yml:205` (the `if:` condition of `test-required-check`) | Extend the `always() &&` expression to also guard on `needs.test-rolldown.result`                                 |
| Native DTS or explicit stay-on-rollup | `packages/packem/src/bundler/first-run-wizard.ts:52`                            | Reword hint: either remove _"falls back to rollup for DTS"_ or replace with _"DTS runs through rollup by design"_ |
| Native DTS lands                      | `packages/packem/src/packem/index.ts:930-935` and `:1038-1043`                  | Remove the rollup-DTS fallback pull-in and the informational log line                                             |
| Native DTS lands                      | `packages/packem/src/rollup/watch.ts:266-268`                                   | Remove the rolldown-compatibility comment and route DTS watch through rolldown                                    |
| Wizard label (criterion 5)            | `packages/packem/src/bundler/first-run-wizard.ts:52`                            | Drop `"experimental, "` prefix from the hint string                                                               |

## 4. Non-goals

The following are explicitly **out of scope** for rolldown graduation:

- **Removing the rollup backend.** Rollup remains the default and the
  full-featured path. Graduation means rolldown reaches feature parity for
  the common case, not that rollup is deprecated.
- **Rolldown-only features.** Any capability that rolldown supports but rollup
  does not (e.g., native module federation, rolldown-specific chunk semantics)
  is a separate roadmap item, not a graduation blocker.
- **Changing the rolldown version pin** (`rolldown@1.0.3` in
  `pnpm-workspace.yaml`). Version upgrades follow the normal dependency
  process; graduation criteria are feature-based, not version-based.
