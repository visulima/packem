# Plan 005: Add a root `AGENTS.md` for the monorepo

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `ls AGENTS.md CLAUDE.md 2>/dev/null`
> If either already exists at the repo root, STOP — this plan assumes neither
> does; reconcile with the existing file instead of overwriting it.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but its content should reflect plans 001 & 002 once landed)
- **Category**: dx / docs
- **Planned at**: commit `15331f451`, 2026-06-10

## Why this matters

This is a dual-backend bundler monorepo with several non-obvious, easy-to-break
workflows that currently live only in tribal/agent memory:
- the rollup-vs-rolldown backend split and how to test each,
- the snapshot footgun (running `vitest -u` from the repo root silently
  corrupts the CI-checked rollup `.snap` files),
- the exact build/test/typecheck commands and the `intigration` (sic) test dir.

A human or AI contributor with no prior context will rediscover these the hard
way — the snapshot footgun has already caused two bad commits. A concise root
`AGENTS.md` (the emerging cross-tool convention many agents read automatically)
captures the operating manual once. This plan writes a **factual, verifiable**
`AGENTS.md` — every command in it must be copied from the repo's actual scripts,
not invented.

## Current state

- No `AGENTS.md` or `CLAUDE.md` exists at the repo root (verified).
- A `memory-bank/` directory exists (`activeContext.md`, `productContext.md`,
  `progress.md`, `projectbrief.md`, `systemPatterns.md`, `techContext.md`) — that
  is project narrative, not an executable operating manual. Reference it, don't
  duplicate it.
- Verified facts the file must contain (do NOT alter these — they are correct as
  of this commit; re-verify each before writing):
  - **Workspace packages** (`packages/`): `packem` (main CLI/bundler),
    `packem-rollup` (rollup-side plugins), `packem-rolldown` (placeholder for
    rolldown-only plugins, currently ~13 LOC), `packem-plugins` (shared,
    backend-agnostic plugins), `packem-share` (shared utils incl. `FileCache`),
    `rollup-plugin-dts`, `rollup-plugin-css`, `css-style-inject`.
  - **Package manager / orchestrator**: pnpm + nx. Node engines:
    `^22.14.0 || >= 24.10.0`.
  - **Two bundler backends**: rollup (default) and rolldown
    (`bundler: "rolldown"` in `packem.config.ts`). Selected in code via
    `isRolldown = backend === "rolldown"`.
  - **Build**: root `pnpm run build` (all) / `pnpm run build:packages`
    (packages only). Integration tests run packem from its built `dist/`, so
    rebuild after source changes.
  - **Typecheck**: `pnpm run lint:types` (per package: `tsc --noEmit`). It is
    stricter than the bundler build — run it when validating.
  - **Lint**: `pnpm run lint` (prettier + eslint); `lint:eslint`, `lint:attw`
    (`--profile esm-only`), `lint:package-json` (`publint --strict`).
  - **Tests** (from inside `packages/packem`): `pnpm run test:rollup` (rollup,
    writes `.snap`), `pnpm run test:rolldown` (rolldown, writes
    `.rolldown.snap`), `pnpm run test:bundlers` (both). Integration tests live
    in `packages/packem/__tests__/intigration/` (note the spelling).
  - **Snapshot footgun**: the `.rolldown` snapshot suffix is implemented ONLY in
    `packages/packem/vitest.config.ts`'s `resolveSnapshotPath`. Running
    `vitest -u` from the **repo root** uses the root config (no suffix) and
    overwrites the CI-checked rollup `.snap` with whatever backend ran. ALWAYS
    `cd packages/packem` before `-u`. CI checks only the rollup `.snap` variant.
  - **Packages are ESM-only** by design (do not add CJS entry points);
    `lint:attw` uses `--profile esm-only`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Confirm no existing agent doc | `ls AGENTS.md CLAUDE.md 2>/dev/null; echo done` | prints only `done` |
| Verify every script you cite exists | `node -e "const s=require('./packages/packem/package.json').scripts; for (const k of ['test:rollup','test:rolldown','test:bundlers','lint:types','build']) console.log(k, '=>', s[k])"` | prints each script |
| Verify root scripts | `node -e "const s=require('./package.json').scripts; for (const k of ['build','build:packages','lint','lint:types','test']) console.log(k,'=>',s[k])"` | prints each script |
| Markdown lint (if configured) | `pnpm run lint:text 2>/dev/null || echo "no text lint"` | exit 0 or "no text lint" |
| Prettier check | `pnpm exec prettier --config=.prettierrc.cjs --check AGENTS.md` | exit 0 (after writing) |

## Scope

**In scope** (the only file you should create):
- `AGENTS.md` at the repo root.

**Out of scope** (do NOT touch):
- `memory-bank/*` — do not edit or move it; only reference it.
- `README.md` — do not restructure it; you may, if trivial, add a single line
  linking to `AGENTS.md`, but skip it if the README's structure makes that
  awkward (it is not required for done).
- Any source, config, or CI file.
- Do NOT create a `CLAUDE.md` symlink or duplicate; one `AGENTS.md` is the deliverable.

## Git workflow

- Branch: `advisor/005-agents-md`
- One commit. Conventional commits, e.g.:
  `docs: add AGENTS.md operating manual for the monorepo`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-verify every fact, then write `AGENTS.md`

Run the verification commands above to confirm each script/command still exists
and matches before writing it into the doc. Then create `AGENTS.md` with these
sections (keep it concise — a one-screen operating manual, not a tutorial):

1. **Repository layout** — one line per `packages/*` package (roles from
   "Current state"). Note it's a pnpm + nx monorepo.
2. **Build / test / lint commands** — a table of the verified commands above,
   each with where to run it from (repo root vs `packages/packem`).
3. **The two bundler backends** — rollup (default) vs rolldown
   (`bundler: "rolldown"`); shared plugins live in `packem-plugins`,
   rollup-specific in `packem-rollup`, rolldown-only would go in
   `packem-rolldown`. Mention DTS generation always runs through rollup even
   under the rolldown backend (it routes through `@visulima/rollup-plugin-dts`).
4. **Snapshot workflow (read before running `vitest -u`)** — the footgun, in a
   callout: ALWAYS `cd packages/packem` first; rollup → `.snap` (CI-checked),
   rolldown → `.rolldown.snap`; CI checks only `.snap`. Give the two exact
   regen commands:
   - rollup: `env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "<path>" -u`
   - rolldown: `PACKEM_TEST_BUNDLER=rolldown pnpm exec vitest run "<path>" -u`
   - mandatory post-check: `git status --short` shows only the intended snapshot family changed.
   If plan 002 has landed, mention that `vitest.config.ts` now hard-fails a
   bare root-level `-u`; if not, omit that sentence.
5. **Conventions** — ESM-only (no CJS), conventional-commit messages, tests run
   against built `dist/` (rebuild after source changes), the `intigration`
   directory spelling.
6. **CI** — what the required check runs (rollup via `test:affected`); if plan
   001 landed, note the advisory rolldown job.
7. **Further context** — a pointer to `memory-bank/` for project narrative.

Write in the repo's documentation tone (see `README.md` / package READMEs).
Use fenced code blocks for commands. Do not invent commands or flags — if a
verification command shows a script differs from this plan, use the actual one
and note the discrepancy in your final report.

**Verify**:
```bash
pnpm exec prettier --config=.prettierrc.cjs --check AGENTS.md
```
→ exit 0 (run `--write` if it reports formatting, then re-check).

### Step 2: Sanity-check the commands you documented actually run

Pick two commands from the doc you have NOT already run this session and dry-run
their existence (do not run a full build/test if slow — just confirm the script
resolves), e.g.:
```bash
node -e "require('./packages/packem/package.json').scripts['test:bundlers'] || process.exit(1)" && echo OK
```

**Verify**: every command cited in `AGENTS.md` corresponds to a real script or a
real CLI invocation. Any that doesn't is a STOP condition.

## Test plan

No code tests. Verification is documentary accuracy:
- Every command in `AGENTS.md` maps to a real script in `package.json`
  (root or `packages/packem`) or a real binary invocation (Step 2).
- `prettier --check AGENTS.md` passes.
- Manual reviewer read confirms the snapshot-footgun section is correct and prominent.

## Done criteria

ALL must hold:

- [ ] `AGENTS.md` exists at the repo root with all seven sections from Step 1.
- [ ] Every command in it matches a real script/binary (spot-checked in Step 2).
- [ ] The snapshot-footgun section names the `cd packages/packem` requirement and both regen commands.
- [ ] `pnpm exec prettier --config=.prettierrc.cjs --check AGENTS.md` exits 0.
- [ ] No file other than `AGENTS.md` (and optionally one README link line) is changed.
- [ ] `plans/README.md` status row for 005 updated.

## STOP conditions

Stop and report back (do not improvise) if:
- An `AGENTS.md` or `CLAUDE.md` already exists at the root (reconcile, don't overwrite).
- A command this plan tells you to document does not exist as a script (the
  scripts drifted since this plan was written) — report which, use the real one.
- The package layout has changed (a package added/removed) — document the actual layout.

## Maintenance notes

- Keep `AGENTS.md` in sync when build/test scripts or the package layout change;
  it is an operating manual, so a stale command is worse than none.
- When plans 001 (CI rolldown job) and 002 (snapshot guard) land, update the CI
  and snapshot sections to reflect them.
- Reviewer should verify the snapshot-footgun guidance against
  `packages/packem/vitest.config.ts` so the doc and the config agree.
