# AGENTS.md

Operating manual for the `@visulima/packem` monorepo. Keep it accurate — a stale
command here is worse than none. For project narrative and design history see
[`memory-bank/`](./memory-bank/).

## Repository layout

A pnpm + [vis](https://github.com/visulima/vis) monorepo (task config in `vis.config.ts`). Workspace packages live under `packages/`:

| Package             | Role                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| `packem`            | Main CLI / bundler. Integration tests run packem from its built `dist/`.       |
| `packem-rollup`     | Rollup-specific plugins (e.g. `jsx-remove-attributes`, `preserve-directives`). |
| `packem-rolldown`   | Placeholder for rolldown-only plugins (currently minimal).                     |
| `packem-plugins`    | Shared, backend-agnostic plugins.                                              |
| `packem-share`      | Shared utilities (e.g. `FileCache`) and types.                                 |
| `rollup-plugin-dts` | Local `.d.ts` generation plugin.                                               |
| `rollup-plugin-css` | CSS handling plugin.                                                           |
| `css-style-inject`  | Runtime style-injection helper.                                                |

## The two bundler backends

packem builds with **rollup** (default) or **rolldown** (`bundler: "rolldown"`
in `packem.config.ts`); code selects via `isRolldown = backend === "rolldown"`.

- Backend-agnostic plugins live in `packem-plugins`; rollup-specific ones in
  `packem-rollup`; rolldown-only ones would go in `packem-rolldown`.
- **DTS generation always runs through rollup** (via
  `@visulima/rollup-plugin-dts`) even under the rolldown backend.

Support status and graduation criteria: see [docs/rolldown-status.md](./docs/rolldown-status.md).

## Build / test / lint commands

| Purpose                                              | Command                   | Run from               |
| ---------------------------------------------------- | ------------------------- | ---------------------- |
| Build everything                                     | `pnpm run build`          | repo root              |
| Build all packages                                   | `pnpm run build:packages` | repo root              |
| Typecheck (stricter than the bundler build)          | `pnpm run lint:types`     | repo root or a package |
| Lint (prettier + eslint)                             | `pnpm run lint`           | repo root              |
| ESLint only                                          | `pnpm run lint:eslint`    | a package              |
| `are-the-types-wrong` (ESM-only)                     | `pnpm run lint:attw`      | a package              |
| Rollup integration tests (writes `.snap`)            | `pnpm run test:rollup`    | `packages/packem`      |
| Rolldown integration tests (writes `.rolldown.snap`) | `pnpm run test:rolldown`  | `packages/packem`      |
| Both backends                                        | `pnpm run test:bundlers`  | `packages/packem`      |
| TypeScript 7 lane (writes `.ts7.snap`)               | `pnpm run test:ts7`       | `packages/packem`      |
| All lanes (rollup, rolldown, TS 7) concurrently      | `pnpm run test:matrix`    | `packages/packem`      |

Integration tests live in `packages/packem/__tests__/intigration/` (note the
spelling) and run packem from its built `dist/` — **rebuild after source
changes** (`pnpm run build:packages`) or tests run against stale output.

## Snapshot workflow — read before running `vitest -u`

> **Footgun**: the `.rolldown` snapshot suffix is implemented ONLY in
> `packages/packem/vitest.config.ts`'s `resolveSnapshotPath`. Running `vitest -u`
> from the **repo root** loads the root config (no suffix) and overwrites the
> CI-checked rollup `.snap` files with whatever backend ran. **Always
> `cd packages/packem` before `-u`.** CI checks only the rollup `.snap` variant.

Regenerate from `packages/packem` with one of:

```bash
# rollup (CI-checked .snap)
env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "<path>" -u

# rolldown (.rolldown.snap)
PACKEM_TEST_BUNDLER=rolldown pnpm exec vitest run "<path>" -u
```

Then **always** verify only the intended snapshot family changed:

```bash
git status --short
```

The TypeScript 7 lane (`PACKEM_TEST_TYPESCRIPT=7`) links the isolated
`tools/typescript-7` install into fixtures as `typescript` and owns `.ts7.snap`
baselines (declaration output differs from TS 6). Regenerate with
`PACKEM_TEST_BUNDLER=rollup PACKEM_TEST_TYPESCRIPT=7 pnpm exec vitest run "<path>" -u`.
The workspace itself stays on TypeScript 6 — the tsc dts backend, vue-tsc and volar
need the classic compiler API that TS 7 does not ship.

As a guardrail, `vitest.config.ts` now hard-fails a bare `vitest -u`/`--update`
when `PACKEM_TEST_BUNDLER` is unset, so an accidental root-level update aborts
with a self-explaining error instead of corrupting a baseline.

## Conventions

- **ESM-only** by design — do not add CJS entry points; `lint:attw` uses
  `--profile esm-only`.
- Conventional-commit messages.
- Node engines: `^22.22.2 || >= 24.10.0`.
- Match the surrounding code's style; run `lint:types` (stricter than the
  bundler build) when validating a change.

## CI

`.github/workflows/test.yml` runs the rollup suite via `test:affected` across a
node 22/24/25 + macos matrix; `test-required-check` is the single required
GitHub check. An advisory `test-rolldown` job runs the rolldown integration
suite (`pnpm --filter @visulima/packem run test:rolldown`) — it surfaces
rolldown regressions but is **not** required (not in `test-required-check`'s
`needs`) until the suite proves stable. The advisory `test-typescript-7` job runs
`test:ts7` the same way.

## Further context

- [`memory-bank/`](./memory-bank/) — project narrative
  (`activeContext.md`, `productContext.md`, `progress.md`, `projectbrief.md`,
  `systemPatterns.md`, `techContext.md`). Reference it; this file is the
  executable operating manual.
