# Plan 011: Write the rolldown support-status & graduation-criteria document

> **Executor instructions**: This is a DOCUMENTATION plan. You write a decision
> document with concrete, checkable criteria and proposed defaults — the
> maintainer makes the final calls, so contested items are framed as
> recommendations with checkboxes, not silent decisions. Follow the steps; on
> any STOP condition, stop and report. Update this plan's row in
> `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat 4964b64c7..HEAD -- AGENTS.md .github/workflows/test.yml packages/packem/src/bundler/first-run-wizard.ts packages/packem-rolldown/`
> On drift, re-verify the "Current state" facts below before writing.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plan 012's spike result slots into one section if it
  exists; write "pending plan 012" otherwise)
- **Category**: direction / docs
- **Planned at**: commit `4964b64c7`, 2026-06-11

## Why this matters

The rolldown backend has had real investment — plugin ports, native watch,
dual snapshot families, an advisory CI job — but the *commitment* is encoded
nowhere. The wizard calls it "experimental", CI won't gate on it, and
`packages/packem-rolldown` is an empty placeholder. Contributors can't tell
whether to invest in rolldown-path work, and users can't tell whether to adopt
it. A one-page status document with explicit graduation criteria converts an
implicit, drifting state into a checkable roadmap.

## Current state (the evidence the document must cite)

- **Wizard label**: `packages/packem/src/bundler/first-run-wizard.ts:52` —
  `{ hint: "experimental, fast — falls back to rollup for DTS", label: "rolldown", value: "rolldown" }`.
- **CI**: `.github/workflows/test.yml` — `test-rolldown` job ("Test rolldown
  backend (advisory)", `needs: "files-changed"`, runs
  `pnpm --filter @visulima/packem run test:rolldown`). The inline comment says:
  "Advisory: NOT part of test-required-check yet. The rolldown full-suite run
  has known cache/ordering flakiness; surface regressions without gating merges
  until it has proven stable (see plans/001)." `test-required-check` has
  `needs: ["files-changed", "test"]` — rolldown is excluded.
- **Placeholder package**: `packages/packem-rolldown/src/index.ts` is an empty
  `export {}` barrel with a comment explaining rolldown currently shares
  plugins via `@visulima/packem-plugins` and skips rollup-only ones (json,
  cjs-interop, commonjs, node-resolve, transformer adapter, chunk-splitter /
  pure / preserve-directives / jsx-remove-attributes / dynamic-import-vars).
  The package is nonetheless versioned and released with every alpha bump.
- **DTS coupling**: DTS generation and DTS watching always run through rollup
  even under the rolldown backend — `packages/packem/src/packem/index.ts:1034-1043`
  (logs "Declaration (DTS) watching runs through rollup; the bundle watcher is
  rolldown.") and `packages/packem/src/rollup/watch.ts:265-268`
  ("@visulima/rollup-plugin-dts isn't rolldown-compatible yet").
- **Docs**: `AGENTS.md` ("The two bundler backends" section) documents the
  mechanics but not the support status or graduation path. A `docs/` directory
  exists at the repo root.
- **Snapshots**: rolldown has its own `.rolldown.snap` family; CI checks only
  the rollup `.snap` family.

## Commands you will need

| Purpose | Command | Run from | Expected |
|---|---|---|---|
| Prettier on docs | `pnpm run lint:prettier` | repo root | exit 0 (or run the `:fix` variant first) |
| Rolldown suite (to quote its current state) | `pnpm run test:rolldown` | `packages/packem` | record pass/fail count — do not fix failures |

## Scope

**In scope**:
- `docs/rolldown-status.md` (create)
- `AGENTS.md` (add ONE link line in "The two bundler backends" section)
- `plans/README.md` (status row)

**Out of scope**:
- Changing the wizard hint, CI workflow, or `packem-rolldown` package — those
  changes happen *when criteria are met*, not in this plan.
- `memory-bank/` files.
- Making the graduation decisions themselves — propose, don't decide.

## Git workflow

- Branch: `advisor/011-rolldown-status-doc`
- Conventional commit: `docs: add rolldown support status and graduation criteria`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Capture the current rolldown suite state

From `packages/packem` run `pnpm run test:rolldown` once and record the totals
(passed/failed/skipped). This number goes in the doc's "Current state" table.
Do NOT fix anything that fails.

### Step 2: Write `docs/rolldown-status.md`

Structure (keep it to ~1 page):

1. **Status today** — table: wizard label ("experimental"), CI (advisory,
   excluded from required check, with the flakiness rationale quoted),
   DTS (via rollup, with the two file:line citations), packem-rolldown
   (placeholder), local suite result from Step 1 with date.
2. **Graduation criteria** (proposed; each a checkbox the maintainer can edit):
   - [ ] `test-rolldown` green on N consecutive scheduled/PR runs (propose N=20)
     with zero flaky reruns → add it to `test-required-check.needs`.
   - [ ] A documented answer on DTS: either rolldown-compatible
     `@visulima/rollup-plugin-dts` (see `plans/012` spike) or an explicit,
     documented "DTS stays on rollup" decision with the wizard hint reworded
     from "falls back" to "by design".
   - [ ] `.rolldown.snap` family kept current by CI (it is exercised by the
     advisory job; state what "current" means).
   - [ ] Decision on `packages/packem-rolldown`: activate (first rolldown-only
     plugin lands) or stop releasing the placeholder.
   - [ ] Wizard hint drops "experimental".
3. **What graduation changes** — the exact file:line edits each criterion
   triggers (wizard line 52; `test-required-check.needs` in test.yml; the `if`
   condition on the required check).
4. **Non-goals** — e.g. removing the rollup backend; rolldown-only features.

Every factual claim must carry its file:line citation from "Current state"
above (verify each against the live code as you write).

### Step 3: Link it from AGENTS.md

In the "The two bundler backends" section of `AGENTS.md`, add one line:
`Support status and graduation criteria: see [docs/rolldown-status.md](./docs/rolldown-status.md).`

**Verify**: `pnpm run lint:prettier` (repo root) → exit 0 (run
`pnpm run lint:prettier:fix` first if needed; the repo's prettier config
formats markdown).

## Test plan

No tests — documentation. Verification is prettier passing and every file:line
citation in the doc resolving to real code (spot-check each with `sed -n`).

## Done criteria

- [ ] `docs/rolldown-status.md` exists with the four sections and ≥5 checkbox criteria
- [ ] Every file:line citation in the doc matches the live code
- [ ] `AGENTS.md` contains exactly one new link line; no other AGENTS.md edits
- [ ] `pnpm run lint:prettier` exits 0
- [ ] `git status --short` shows only the 3 in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- The advisory CI job or the wizard "experimental" hint no longer exists
  (drift) — the doc's premise changed; report.
- `pnpm run test:rolldown` cannot run at all (infrastructure failure) — write
  the doc with "suite unrunnable on <date>: <error>" only if the error is
  clearly environmental; otherwise report.
- You find yourself wanting to change CI or the wizard "while you're there" —
  that is out of scope; stop the impulse, note it in the doc instead.

## Maintenance notes

- This doc is the canonical place to update as criteria get checked off; the
  AGENTS.md CI section should keep only the one-line summary + link.
- When plan 012's spike report lands, fold its conclusion into criterion 2.
- Reviewer: check the proposed N (consecutive green runs) and the
  placeholder-package recommendation — those are the two genuinely contestable
  defaults.
