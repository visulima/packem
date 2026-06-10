# Plan 001: Run the rolldown integration suite in CI (advisory job)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 15331f451..HEAD -- .github/workflows/test.yml packages/packem/package.json`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests / dx
- **Planned at**: commit `15331f451`, 2026-06-10

## Why this matters

`packem` supports two bundler backends — rollup (default) and rolldown
(`bundler: "rolldown"`). The rolldown backend was recently brought to a fully
green integration suite (469 passed / 0 failed). But **CI never runs it**: no
workflow sets `PACKEM_TEST_BUNDLER=rolldown` or invokes the `test:rolldown` /
`test:bundlers` scripts. Every PR is validated against rollup only, so any
change to the shared bundler core can silently break rolldown and ship
undetected — the entire rolldown investment will rot the first time someone
refactors `get-build-options.ts` without manually running the rolldown suite.

This plan adds a **non-blocking (advisory)** CI job that runs the rolldown
integration suite. Non-blocking is deliberate: the rolldown full-suite run has
known cache/ordering flakiness (some suites pass alone but flake in the full
run), so we surface regressions as a visible check without gating merges until
the suite has proven stable over several weeks (see Maintenance notes).

## Current state

- `.github/workflows/test.yml` — the Tests workflow. It has three jobs:
  - `files-changed` — detects whether package files changed; exposes
    `outputs.packages` (`'true'`/`'false'`).
  - `test` — matrix (ubuntu node 22/24/25 + macos node 22). Builds with
    `pnpm run build:affected:packages`, then runs `pnpm run test:affected`
    (rollup default, **no `PACKEM_TEST_BUNDLER`**).
  - `test-required-check` — the single required GitHub check; `needs: ["files-changed", "test"]`.
- The `test` job's relevant steps (lines ~123-134):
  ```yaml
        - name: "Build"
          shell: "bash"
          run: "pnpm run build:affected:packages"

        - name: "Run tests"
          shell: "bash"
          run: |
              if [[ "${{ matrix.os }}" == "ubuntu-latest" && "${{ matrix.node_version }}" == 22 ]]; then
                  pnpm run test:affected:coverage
              else
                  pnpm run test:affected
              fi
  ```
- `packages/packem/package.json` test scripts (verified):
  ```json
  "test:rolldown": "cross-env PACKEM_TEST_BUNDLER=rolldown vitest run --cache __tests__/intigration",
  "test:rollup":   "cross-env PACKEM_TEST_BUNDLER=rollup   vitest run --cache __tests__/intigration",
  "test:bundlers": "pnpm run test:rollup && pnpm run test:rolldown",
  ```
- Root `package.json` has `"build:packages": "nx run-many --target=build --parallel --projects=tag:type:package"` — builds every workspace package (so `packem`'s dist and all its workspace deps are built). The integration tests run packem from its built `dist/`.

Repo conventions to match (copy these exactly — CI YAML is unforgiving):
- All third-party actions are pinned by full commit SHA with a `# vX.Y.Z`
  comment. Reuse the **exact** pinned versions already in `test.yml`:
  - `step-security/harden-runner@9af89fc71515a100421586dfdb3dc9c984fbf411 # v2.19.4`
  - `actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3`
  - `anolilab/workflows/step/setup@802f3b1d00b0ab47c3102b4f4ebd866b9f7f8fcf # v18.0.3`
- Every job starts with the Harden Runner step (`egress-policy: "audit"`).
- The checkout step uses the same `GIT_*`/`EMAIL` env block and `fetch-depth: 0`.
- Strings are double-quoted, indentation is 4 spaces (match the file).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| YAML lint (if available) | `pnpm exec yamllint .github/workflows/test.yml` | exit 0 (skip if yamllint absent) |
| Local smoke of the suite this job runs | `cd packages/packem && pnpm run test:rolldown` | suite runs; ~469 passed / 0 failed (some skips OK) |
| Confirm scripts exist | `node -e "console.log(require('./packages/packem/package.json').scripts['test:rolldown'])"` | prints the cross-env command |

## Scope

**In scope** (the only files you should modify):
- `.github/workflows/test.yml` — add ONE new job.

**Out of scope** (do NOT touch):
- The existing `test` job — do not add the rolldown run as a step inside it;
  a flaky rolldown run there would fail the required check. Keep it a separate job.
- `test-required-check` — do NOT add the new job to its `needs:` list in this
  plan (that would make rolldown blocking). Making it blocking is a deferred
  follow-up (see Maintenance notes).
- Any `package.json` scripts — they already exist.

## Git workflow

- Branch: `advisor/001-ci-rolldown-suite-gate`
- One commit. Message style is conventional commits (see `git log`), e.g.:
  `ci(packem): run the rolldown integration suite as an advisory check`
  Append the repo's commit trailer if one is in use.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the `test-rolldown` job to `test.yml`

Insert a new job **between** the existing `test` job and the
`test-required-check` job. It must mirror the repo's setup conventions but run
a single ubuntu/node-22 combination and execute only the rolldown suite.

Add this job (match surrounding indentation — jobs are indented 4 spaces under
`jobs:`):

```yaml
    test-rolldown:
        name: "Test rolldown backend (advisory)"
        if: "needs.files-changed.outputs.packages == 'true'"
        needs: "files-changed"
        runs-on: "ubuntu-latest"
        # Advisory: NOT part of test-required-check yet. The rolldown full-suite
        # run has known cache/ordering flakiness; surface regressions without
        # gating merges until it has proven stable (see plans/001).
        steps:
            - name: "Harden Runner"
              uses: "step-security/harden-runner@9af89fc71515a100421586dfdb3dc9c984fbf411" # v2.19.4
              with:
                  egress-policy: "audit"

            - name: "Git checkout ${{ env.HEAD_REPOSITORY }}:${{ env.HEAD_REF }}"
              uses: "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10" # v6.0.3
              env:
                  GIT_COMMITTER_NAME: "GitHub Actions Shell"
                  GIT_AUTHOR_NAME: "GitHub Actions Shell"
                  EMAIL: "github-actions[bot]@users.noreply.github.com"
              with:
                  fetch-depth: 0

            - name: "Setup resources and environment"
              id: "setup"
              uses: "anolilab/workflows/step/setup@802f3b1d00b0ab47c3102b4f4ebd866b9f7f8fcf" # v18.0.3
              with:
                  node-version: "22"
                  install-packages: "false"
                  install-node-gyp: "true"

            - name: "Install packages"
              shell: "bash"
              run: "pnpm install --frozen-lockfile --prefer-offline"
              env:
                  "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD": true
                  "CYPRESS_INSTALL_BINARY": true
                  "SKIP_CHECK": "true"
                  "HUSKY": 0

            - name: "Build packages"
              shell: "bash"
              run: "pnpm run build:packages"

            - name: "Run rolldown integration suite"
              shell: "bash"
              run: "pnpm --filter @visulima/packem run test:rolldown"
```

Notes for you, the executor:
- `pnpm run build:packages` builds all workspace packages (nx resolves
  `packem`'s build-time deps), guaranteeing the `packem` dist the integration
  tests load is present. Do not swap it for `build:affected` — this job has no
  nx-affected SHA setup.
- `pnpm --filter @visulima/packem run test:rolldown` runs the package's own
  script, which sets `PACKEM_TEST_BUNDLER=rolldown` via `cross-env` and runs
  vitest from inside `packages/packem` (so the local `vitest.config.ts`'s
  `.rolldown` snapshot suffix applies). Do NOT run vitest from the repo root.

**Verify**: `git diff .github/workflows/test.yml` shows exactly one new job
added, no other jobs modified. If `yamllint` is available:
`pnpm exec yamllint .github/workflows/test.yml` → exit 0.

### Step 2: Confirm the suite the job runs is actually green locally

Before trusting the new job, run the same command locally once:

```bash
cd packages/packem && pnpm run test:rolldown
```

**Verify**: the suite completes with 0 failures (skips are fine). If it is not
green locally, this is a STOP condition — the CI job would fail, but the cause
is the suite, not this plan.

## Test plan

This plan changes CI config only; there is no unit test to add. Verification is:
- Static: the YAML parses (yamllint or a YAML parser) and the new job is
  syntactically a sibling of `test`.
- Dynamic: `pnpm --filter @visulima/packem run test:rolldown` passes locally
  (Step 2). The real proof is the job turning green on the next PR, which the
  reviewer observes — not something the executor can assert offline.

## Done criteria

ALL must hold:

- [ ] `.github/workflows/test.yml` contains a new job named `test-rolldown`.
- [ ] The new job runs `pnpm --filter @visulima/packem run test:rolldown`.
- [ ] The new job is NOT listed in `test-required-check`'s `needs:`.
- [ ] No other job in `test.yml` is modified (`git diff` shows only the addition).
- [ ] All action `uses:` in the new job are SHA-pinned with the same versions as elsewhere in the file.
- [ ] `cd packages/packem && pnpm run test:rolldown` passes locally (0 failures).
- [ ] `plans/README.md` status row for 001 updated.

## STOP conditions

Stop and report back (do not improvise) if:
- `pnpm run test:rolldown` is NOT green locally (the suite regressed since this
  plan was written — fixing the suite is out of scope for this plan).
- The `test.yml` structure has drifted (no `files-changed` job, or
  `test-required-check` no longer exists) so the excerpts don't match.
- The `build:packages` script no longer exists in the root `package.json`.
- You find yourself needing to modify the existing `test` job to make this work.

## Maintenance notes

- **Graduating to blocking**: once `test-rolldown` has been green on `main` for
  ~2–4 weeks, add it to `test-required-check`'s `needs:` array
  (`needs: ["files-changed", "test", "test-rolldown"]`) so rolldown regressions
  block merges. Do this in a separate change, not here.
- If the rolldown suite proves flaky in CI, investigate the full-suite
  cache/ordering issue (raw-data suite is a known offender) before making it
  required — do not paper over it with retries.
- Reviewer should confirm the job appears on the PR checks list and that it is
  NOT marked required yet.
