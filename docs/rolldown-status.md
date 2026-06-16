# Rolldown backend: support status and graduation criteria

> **Updated 2026-06-16 (rolldown 1.0.3).** Four of five graduation criteria are
> met: the rolldown suite **gates merges** (folded into the `test` matrix across
> node 22/24/25 + macOS), **native DTS landed** (PR #208, plan 015), the
> **`.rolldown.snap` family is portable + gating**, and the wizard hint dropped
> _"experimental"_. The only open item is the `packem-rolldown` placeholder
> package decision (low-urgency; it is private and unpublished).

## 1. Status today

| Dimension                | State                                                                                                                                                                                                                                                                                                                                                              | Source                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Wizard label             | **"fast, native DTS"** — the _"experimental"_ qualifier was dropped now that the CI-gating and native-DTS criteria are met (the earlier "falls back to rollup for DTS" clause is also gone).                                                                                                                                                                        | `packages/packem/src/bundler/first-run-wizard.ts:52`                                           |
| CI job                   | **Gating** — folded into the `test` matrix via a `bundler: [rollup, rolldown]` dimension, so the full rolldown suite runs on node 22/24/25 (ubuntu) + node 22 (macOS) and is **required** through `test-required-check` (which `needs: [files-changed, test]`). The standalone advisory `test-rolldown` job was removed.                                              | `.github/workflows/test.yml` (`test` job, `bundler` matrix)                                     |
| DTS generation (build)   | **Routes through rolldown natively** when `bundler: "rolldown"` (PR #208). Rollup is no longer pulled in for the DTS path under rolldown; the `@visulima/rollup-plugin-dts` virtual-module guard makes `emitDtsOnly` work under rolldown.                                                                                                                            | `packages/packem/src/packem/index.ts`                                                          |
| DTS watching             | **Runs natively through rolldown** when rolldown is the bundler — the bundle watcher and the DTS watcher both use the rolldown-native watch path (PR #208). No rollup fallback for the watch DTS path.                                                                                                                                                              | `packages/packem/src/rollup/watch.ts:278-296, 341`                                             |
| `packem-rolldown` pkg    | Empty `export {}` placeholder. No rolldown-only plugins have landed yet. The package is **private (`"private": true`) and not published** — pinned at `1.0.0-alpha.0` while its siblings advance, so it is not released on alpha bumps.                                                                                                                              | `packages/packem-rolldown/src/index.ts`, `packages/packem-rolldown/package.json`              |
| Local suite (2026-06-16) | **rolldown: 476 passed / 0 failed / 37 skipped** (41 files passed, 4 skipped); **rollup: 505 passed / 0 failed / 8 skipped**. The earlier 5 snapshot failures (absolute worktree paths in `externals.test.ts`/`css.test.ts`) are fixed by the `normalizeRolldownOutput` portability helper. | `pnpm run test:bundlers` in `packages/packem`                                                  |

## 2. Graduation criteria (proposed)

Each checkbox is a decision point for the maintainer, not a preset constraint.

- [x] **CI stability**: **met (2026-06-16).** Rather than keep a standalone
      `test-rolldown` job and add it to `test-required-check.needs` after N green
      runs, the rolldown suite was folded directly into the `test` matrix via a
      `bundler: [rollup, rolldown]` dimension. Because `test-required-check`
      already `needs: [files-changed, test]`, every rolldown matrix leg (node
      22/24/25 + macOS) now gates merges alongside rollup. The flakiness that
      motivated the advisory carve-out was traced to non-portable snapshots
      (machine-specific absolute pnpm paths and content-derived chunk hashes)
      and fixed with a rolldown-only `normalizeRolldownOutput` helper, so the
      "20 consecutive green runs" probation is moot — the root cause is resolved,
      not merely observed-stable.

- [x] **Native DTS**: **met (2026-06-16, PR #208 / plan 015).** Rolldown-native
      DTS generation landed — packem routes the DTS path through rolldown when
      rolldown is the selected bundler, the rollup-DTS fallback pull-in is gone,
      and the wizard hint's _"falls back to rollup for DTS"_ clause was dropped.
      The plan-012 GO path below records how the blocker was cleared.

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

- [x] **Snapshot currency**: **met (2026-06-16).** The `.rolldown.snap` family
      is now exercised by the **gating** rolldown matrix legs on every qualifying
      PR, and the snapshots were made machine/CI-portable (the
      `normalizeRolldownOutput` helper rewrites absolute pnpm-store paths to
      `<root>` and content-derived chunk hashes to `[HASH]`), so a green CI run
      now proves currency. Regenerate with
      `PACKEM_TEST_BUNDLER=rolldown pnpm exec vitest run "<path>" -u` from
      `packages/packem`.

- [ ] **Package decision**: decide the fate of `packages/packem-rolldown`
      — either (a) activate it when the first rolldown-only plugin lands and
      export it from `src/index.ts`, or (b) delete the placeholder and recreate
      it when real content exists. The package is already private and unpublished
      (pinned at `1.0.0-alpha.0`), so there is no consumer-facing cost either way;
      keeping the reserved barrel is near-zero overhead. Open, low-urgency.

- [x] **Wizard label**: **met (2026-06-16).** The _"experimental"_ qualifier was
      dropped from the wizard hint in
      `packages/packem/src/bundler/first-run-wizard.ts:52`; it now reads
      `"fast, native DTS"`. This was the last user-visible graduation signal, and
      its prerequisites (CI stability + native DTS) were already met.

## 3. What graduation changes (file-by-line)

All rows below are now **DONE**.

| Criterion                             | Status | File / change                                                                                                                                                                            |
| ------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI stability (criterion 1)            | DONE   | Achieved differently than originally planned: instead of adding a `test-rolldown` job to `test-required-check.needs`, rolldown was folded into the `test` matrix (`bundler` dimension), which `test-required-check` already depends on. |
| Native DTS — wizard hint              | DONE   | `first-run-wizard.ts:52` — the _"falls back to rollup for DTS"_ clause was removed.                                                                                                      |
| Native DTS lands                      | DONE   | `packages/packem/src/packem/index.ts` — the rollup-DTS fallback pull-in and informational log line were removed; DTS routes through rolldown natively (PR #208).                          |
| Native DTS lands (watch)              | DONE   | `packages/packem/src/rollup/watch.ts` — DTS watch under rolldown updated alongside PR #208.                                                                                              |
| Wizard label (criterion 5)           | DONE   | `first-run-wizard.ts:52` — `"experimental"` qualifier dropped; hint now `"fast, native DTS"`.                                                                                            |

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
