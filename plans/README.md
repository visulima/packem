# Implementation Plans

Maintained by the improve skill. Execute in the order below unless dependencies
say otherwise. Each executor: read the plan fully before starting, honor its
STOP conditions, and update your row when done.

- **Batch 1** (001–005): generated 2026-06-10 against commit `15331f451` —
  all executed and verified DONE (commits in the status column).
- **Batch 2** (006–012): generated 2026-06-11 against commit `4964b64c7`, from
  a fresh `standard` full-repo audit (4 parallel read-only subagents, all nine
  categories) that reconciled against batch 1's rejected-findings list. Several
  new subagent findings were refuted during vetting — see "Findings considered
  and rejected" so they aren't re-audited.

## Execution order & status

| Plan | Title | Priority | Effort | Risk | Depends on | Status |
|------|-------|----------|--------|------|------------|--------|
| 001  | Run the rolldown integration suite in CI (advisory job) | P1 | S | LOW | — | DONE (4d8f4eacf) |
| 002  | Guard against cross-polluting rollup/rolldown snapshots on `vitest -u` | P1 | S | LOW | — | DONE (a0a490cbb) |
| 003  | Fix `jsx-remove-attributes` corrupting output when stripped attr is first prop | P2 | S | LOW | — | DONE (5b36f504c) |
| 004  | Extract the duplicated dependency-cache load logic in `build.ts` | P3 | S | LOW | — | DONE (00e2e7954) |
| 005  | Add a root `AGENTS.md` for the monorepo | P2 | S | LOW | — | DONE (4964b64c7) |
| 006  | Make watch mode survive a failing `onSuccess` script (+ regression test) | P1 | S | LOW | — | DONE — APPROVED (branch `advisor/006-watch-onsuccess-crash`, commit a41363750; unmerged) |
| 007  | Clear the failing `pnpm audit` gate (shell-quote critical + hono moderates) | P1 | S | LOW | — | DONE — APPROVED after 1 revision (branch `advisor/007-audit-overrides`, commit 0cf648896; unmerged; NOTE: adds `.pnpmfile.cjs` — pnpm v11 doesn't apply `overrides` to peer-resolved hono; remove the hook once `@modelcontextprotocol/sdk` ships hono>=4.12.21) |
| 008  | Harden rollup-plugin-dts subprocess failure paths (fork hang, tsgo exit code) | P2 | S | LOW | — | DONE — APPROVED after 1 revision (branch `advisor/008-dts-subprocess-hardening`, commits e40c119d8 + d816d6c36; unmerged; NOTE: main tree has an uncommitted competing tsgo.ts fix — expect a small merge conflict) |
| 011  | Write the rolldown support-status & graduation-criteria document | P2 | S | LOW | — (012 feeds one section) | DONE — APPROVED after 1 revision (branch `advisor/011-rolldown-status-doc`, commit 2c995e8e7; unmerged. Adds `docs/rolldown-status.md` + one AGENTS.md link line; criterion 2 cites 012's GO verdict. Maintainer decides: N=20 CI-green threshold, packem-rolldown placeholder fate) |
| 009  | Spike: why does CSS disable the watch-mode cache? (report-only) | P3 | M | LOW | — | DONE — APPROVED (branch `advisor/009-css-cache-spike`, commit ae3fc2e18; report copied to `plans/009-report.md`. Root cause verified: css-plugin's `extracted` Map only repopulates in `transform`, which rollup skips for cached modules. Recommended Fix B (`meta.extracted` + `moduleParsed` recovery). Deviation: no live timings — harness blocker, disclosed; mechanism independently verified against rollup 4.60.4 dist) |
| 010  | Experiment: raise the vitest thread cap if measurably faster and stable | P3 | S | MED | — | REJECTED — measured, gate failed (12-core machine, idle: baseline maxThreads=2 median 191.69s vs maxThreads=4 median 186.28s = 2.82% faster, needed ≥20%; 500/500 pass in all 5 runs, zero flakes). Bottleneck is the spawned CLI child builds saturating cores, not vitest thread count. No change committed; branch `advisor/010-vitest-threads` is empty |
| 012  | Spike: rolldown compatibility of `@visulima/rollup-plugin-dts` (go/no-go report) | P3 | M | LOW | — | DONE — APPROVED (branch `advisor/012-rolldown-dts-spike`, commit 8890a5021; report copied to `plans/012-report.md`. Verdict: GO — one-line `\0`-virtual-module guard in generate.ts unblocks `emitDtsOnly` under rolldown; ~1 day total for dual-compat) |
| 013  | Fix the CSS watch-cache root cause and remove the `useCache` hack (009 follow-up) | P2 | M | MED | 009 | IN PROGRESS (executor running, branch `advisor/013-css-watch-cache-fix`) |
| 014  | Make `rollup-plugin-dts` dual-compatible rollup+rolldown (012 GO path, items 1–5) | P2 | M | LOW-MED | 012 | DONE — APPROVED, merged into alpha (commit 8e2b95d7b, merge a737680b7). Guard at `generate.ts` transform top; rolldown optional peer + dev dep (lockfile +3 lines, confined); alias rename verified pure via sed-normalized diff; 9 new rolldown-lane tests; reviewer re-ran suite (96 pass), lint, and packem typescript.test.ts (62 pass) in the worktree |
| 015  | Route packem's DTS through rolldown natively (012 GO path, item 6) | P2 | M | MED | 014 | TODO (next: write the plan now that 014 is merged) |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (one-line reason) | REJECTED (one-line rationale)

## Recommended order & dependency notes (batch 2)

- **006 and 007 first** — both P1, independent, S-effort, clean verification
  stories (006: a confirmed watch-mode crash path, verified down to rollup's
  un-awaited `this.run()`; 007: the repo's own `pnpm run audit` gate fails today).
- **008** is independent; do any time.
- **011 before or after 012** — 011 works standalone (it writes "pending plan
  012" into criterion 2 if the spike hasn't run); 012's report makes 011's DTS
  criterion concrete. Running 012 first gives a stronger doc.
- **009 and 010** are self-contained report/experiment plans with keep-or-revert
  gates; lowest urgency.
- File-overlap: 006 and 009 both concern `packages/packem/src/rollup/watch.ts`
  — but 009 commits **no source changes** (report only), so they don't
  conflict. Run 006's fix before 009's measurements if doing both the same day
  (009's drift check will then show watch.ts changed — re-verify its excerpt,
  which targets lines 237–243, untouched by 006).
- No other plan modifies the same file as another.

In-scope files per plan:
- 006 → `packages/packem/src/rollup/watch.ts` + `packages/packem/__tests__/intigration/watch.test.ts`
- 007 → `pnpm-workspace.yaml` (overrides only) + `pnpm-lock.yaml`
- 008 → `packages/rollup-plugin-dts/src/generate.ts`, `src/tsgo.ts`, `__tests__/tsgo.test.ts` (new)
- 009 → `plans/009-report.md` (new; no source commits)
- 010 → `tools/get-vitest-config.ts` (only if the keep-gate passes)
- 011 → `docs/rolldown-status.md` (new) + one link line in `AGENTS.md`
- 012 → `plans/012-report.md` (new; no source commits)

## Findings considered and rejected

(So nobody re-audits them. Each was opened and verified against the code.)

From the 2026-06-10 audit:

- **onSuccess "command injection"** (index.ts:1008): by-design — `onSuccess` is
  the user's own configured shell command (like tsup). Not an attacker vector.
- **attw `pack` shell string** (attw.ts:315): the interpolated paths are
  `mkdtemp`-generated + config-controlled, not attacker input in the CLI threat
  model. Not worth the refactor risk.
- **defu hooks prototype pollution** (create-defu-with-hooks-merger.ts): object
  spread doesn't trigger `__proto__` pollution, defu guards it, and the config
  is trusted executed code. Non-issue.
- **fs.watch handle "leak" / empty `.catch`** (watch.ts:389-411): both are
  documented-intentional; the handles are created once at top level (not
  re-registered on restart) and the OS reclaims them on SIGINT.
- **`buildResult.output` array cast not validated** (build.ts:79,143): packem
  always constructs `output` as an array; the cast is safe.
- **rolldown DTS "silently skipped"**: false — `index.ts` pulls rollup in for
  the DTS path under rolldown with explicit comments. Intentional and handled
  (now also the subject of direction plan 012).
- **cache keys "duplicated across files"**: false — `build.ts`,
  `build-types.ts`, `watch.ts` each define *distinct* keys.

From the 2026-06-11 audit:

- **fake-js "module-scope shared-state race"**: false — the maps live inside
  the `createFakeJsPlugin` factory (`fake-js.ts:90-99`), i.e. per plugin
  instance, and `resolvedExportsByModule` is documented as reset in
  `renderStart` for watch mode. Mis-attributed evidence.
- **CI rollup/rolldown jobs "run sequentially"**: false — both `test` and
  `test-rolldown` have `needs: "files-changed"` only; they already run in
  parallel.
- **"Babel workerpool doesn't exist"**: false — it's at
  `packages/packem-plugins/src/plugins/babel/{index,worker}.ts`. (Subagent grep
  failure.)
- **SIGINT handler "floating promise"** (index.ts:1107-1114): documented-
  intentional — the handler comment explains the synchronous-signal-listener
  constraint and the rejection is caught and logged.
- **onSuccess exitCode race** (the `Cannot read properties of undefined
  (reading 'exitCode')` crash): already fixed — `index.ts:1006-1022` captures
  the process locally and null-checks `exitCode`; the watch test's assertion is
  the regression guard.
- **data-url magic slice offsets** (rollup-plugin-css `data-url.ts`): style nit
  ("could break if a future edit forgets"), not a bug. Not worth a plan.
- **"stale GHSA ignores"** (pnpm-workspace.yaml:23-28): the cited evidence was
  wrong — the 5 ignored IDs don't appear in `pnpm audit` output *because*
  `ignoreGhsas` suppresses them; their absence proves nothing. Validating them
  means temporarily removing the list, which remains the known low-leverage
  housekeeping item from batch 1.
- **Unit tests for `get-rollup-options.ts`**: real gap, deliberately not
  planned — the 469-test dual-backend integration suite is its de-facto
  characterization harness, mocking `BuildContext` is heavy, and the module's
  refactor is already deferred until the rolldown port stabilizes. Revisit
  together with that refactor.
- **fake-js overload offset bounds** (`fake-js.ts:634-643`): the `if
  (mergedChild)` guards make this defensive-but-silent; no concrete failing
  input was demonstrated. Downgraded to "watch in review", no plan.
- **sort-package-json 3→4 major bump**: dev-only, zero current cost. Routine
  maintenance, not a plan.

## Noted but deliberately not planned

- **God module `get-rollup-options.ts`** (1141 LOC, highest churn): real debt,
  but refactoring mid-evolution is high-risk for low return. Revisit once the
  rolldown port stabilizes (plan 011's criteria define "stabilizes").
- **Scattered `isRolldown` branching** (~28 sites): L-effort architectural
  change; premature while the backend split is still settling. Same revisit
  trigger as above.
- **Edit-test loop requires manual `pnpm run build:packages`**: real friction,
  but documented in AGENTS.md and partially mitigated by nx caching; the
  candidate fixes (pretest hooks, tsx-loading the CLI) each change test
  semantics. Revisit if contributors keep tripping on it.
- **TODO comment audit** (18+ scattered `@TODO`s): the two load-bearing ones
  became plans (009 CSS cache hack; 008's vicinity). The rest are
  low-information; a bulk audit is churn without leverage.
- **Snapshot-diff tooling between `.snap` and `.rolldown.snap` families**:
  interesting, M-effort, unproven need. Revisit if dual-family review pain
  materializes in PRs.

## Direction (for the maintainer — not problems to fix)

- **Make rolldown's status explicit and checkable** — plan 011 writes the
  criteria doc; plan 012 answers the one structural blocker (DTS). Together
  they turn "experimental, advisory, placeholder" into a graduation checklist.
- **Extract the dual-backend snapshot harness** (`resolveSnapshotPath`-by-env)
  as a reusable vitest helper — genuinely useful to other dual-engine projects,
  but a post-2.0 nicety; low confidence it's worth the maintenance.
