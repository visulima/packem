# Plan 002: Guard against cross-polluting rollup/rolldown snapshots on `vitest -u`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 15331f451..HEAD -- packages/packem/vitest.config.ts`
> If that file changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `15331f451`, 2026-06-10

## Why this matters

`packem`'s integration tests run under two bundlers. The snapshot file a test
writes is chosen by `packages/packem/vitest.config.ts`'s `resolveSnapshotPath`:
with `PACKEM_TEST_BUNDLER=rolldown` it appends a `.rolldown` suffix
(`foo.test.ts.snap.rolldown`-style), otherwise it writes the plain `.snap`
that CI checks.

**The footgun**: this suffix logic lives ONLY in
`packages/packem/vitest.config.ts`. If you run `vitest -u` (update snapshots)
from the **repo root**, vitest loads the root config, which has no suffix
logic — so even with `PACKEM_TEST_BUNDLER=rolldown` set, rolldown's output
(with `//#region` markers, `var x_default`, backtick literals, oxc helpers)
gets written into the rollup `.snap` files that CI validates. This has caused
a bad commit twice: 18 CI-checked `.snap` files silently overwritten with
rolldown output. The damage is invisible until CI fails on an unrelated PR.

This plan adds a **fail-fast guard inside `vitest.config.ts`** that refuses to
run snapshot updates unless `PACKEM_TEST_BUNDLER` is explicitly set, with an
error message telling the developer exactly what to do. It converts a silent,
delayed, hard-to-diagnose corruption into an immediate, self-explaining error.

## Current state

- `packages/packem/vitest.config.ts` (full file as it exists today):
  ```typescript
  import { getVitestConfig } from "../../tools/get-vitest-config";

  // Snapshots routinely diverge between rollup and rolldown (chunk hashes,
  // `var x = ...` vs `const x = ...`, `//#region` markers, hoist order, etc.).
  // Suffix snapshot files with the active bundler so each backend owns its own
  // frozen baseline and the same test can match either bundler.
  const bundlerSnapshotSuffix = process.env.PACKEM_TEST_BUNDLER === "rolldown" ? ".rolldown" : "";

  // https://vitejs.dev/config/
  export default getVitestConfig({
      test: {
          resolveSnapshotPath: (testPath, snapExtension) => {
              const dir = testPath.replace(/(\\|\/)([^\\/]+)$/, "$1__snapshots__$1");
              const file = testPath.replace(/^.*(\\|\/)/, "");

              return `${dir}${file}${bundlerSnapshotSuffix}${snapExtension}`;
          },
          testTimeout: 15_000,
      },
  });
  ```
- The config is a plain module evaluated by vitest at startup. `process.argv`
  is available at module-eval time and contains the vitest CLI flags. When the
  user passes `-u` or `--update`, `process.argv` includes `"-u"` or
  `"--update"` (vitest's update flag).
- `process.env.PACKEM_TEST_BUNDLER` is `"rollup"`, `"rolldown"`, or unset.

Why the guard works: a developer who deliberately regenerates snapshots always
knows which backend they mean and can set the env var (the package's own
`test:rollup` / `test:rolldown` scripts already set it via `cross-env`). An
accidental root-level `vitest -u` with no env var is exactly the dangerous case
— and that is the only case the guard blocks.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck the config | `cd packages/packem && pnpm exec tsc --noEmit -p tsconfig.json` | exit 0 (or unchanged from baseline) |
| Prove the guard does NOT fire on a normal run | `cd packages/packem && pnpm run test:rollup -- shebang.test.ts` | suite runs normally |
| Prove the guard fires on a bad update | `cd packages/packem && env -u PACKEM_TEST_BUNDLER pnpm exec vitest run __tests__/intigration/shebang.test.ts -u` | process exits non-zero with the guard error message |
| Prove a deliberate update still works | `cd packages/packem && PACKEM_TEST_BUNDLER=rollup pnpm exec vitest run __tests__/intigration/shebang.test.ts -u` | runs and updates only `.snap` |

## Scope

**In scope** (the only file you should modify):
- `packages/packem/vitest.config.ts`

**Out of scope** (do NOT touch):
- The root `vitest.config.ts` — adding suffix logic there is a larger, riskier
  change with its own trade-offs; this plan deliberately solves the problem
  with a localized guard, not by relocating the suffix logic.
- Any `.snap` or `.rolldown.snap` file — this plan must not regenerate snapshots.
- `tools/get-vitest-config.ts` — the shared factory is used by other packages;
  do not put packem-specific logic there.

## Git workflow

- Branch: `advisor/002-snapshot-update-guardrail`
- One commit. Conventional-commits style, e.g.:
  `test(packem): fail fast when updating snapshots without PACKEM_TEST_BUNDLER`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the update-without-bundler guard to `vitest.config.ts`

Insert, immediately after the `bundlerSnapshotSuffix` line and before the
`export default`, a guard that throws when a snapshot update is requested
without `PACKEM_TEST_BUNDLER` set. Produce this shape:

```typescript
const bundlerSnapshotSuffix = process.env.PACKEM_TEST_BUNDLER === "rolldown" ? ".rolldown" : "";

// Guardrail: the `.rolldown` snapshot suffix above lives only in THIS config.
// Running `vitest -u` from the repo root loads the root config (no suffix), so
// rolldown output silently overwrites the CI-checked rollup `.snap` files.
// Refuse to update snapshots unless the bundler is explicit, so an accidental
// bare `vitest -u` fails fast instead of corrupting a baseline.
const isSnapshotUpdate = process.argv.includes("-u") || process.argv.includes("--update");

if (isSnapshotUpdate && !process.env.PACKEM_TEST_BUNDLER) {
    throw new Error(
        "Refusing to update snapshots without PACKEM_TEST_BUNDLER set.\n"
        + "The .rolldown snapshot suffix only applies when vitest runs from inside packages/packem.\n"
        + "Regenerate from packages/packem with one of:\n"
        + "  rollup   (CI-checked .snap):     env -u PACKEM_TEST_BUNDLER pnpm exec vitest run \"<path>\" -u\n"
        + "  rolldown (.rolldown.snap):       PACKEM_TEST_BUNDLER=rolldown pnpm exec vitest run \"<path>\" -u\n"
        + "Or use the package scripts: pnpm run test:rollup -- -u / pnpm run test:rolldown -- -u",
    );
}
```

Keep the existing `export default getVitestConfig({...})` block exactly as is.

**Verify**: `cd packages/packem && pnpm exec tsc --noEmit -p tsconfig.json` →
exit 0 (or no new errors vs. the pre-change baseline — run it once before
editing to capture the baseline if unsure).

### Step 2: Prove the guard fires on the dangerous case

```bash
cd packages/packem
env -u PACKEM_TEST_BUNDLER pnpm exec vitest run __tests__/intigration/shebang.test.ts -u
```

**Verify**: the command exits non-zero and prints the
"Refusing to update snapshots without PACKEM_TEST_BUNDLER set" message. No
snapshot file is modified — confirm with `git status --short` showing no
`.snap`/`.rolldown.snap` changes.

### Step 3: Prove normal runs and deliberate updates are unaffected

```bash
cd packages/packem
# normal run (no -u): must NOT be blocked
pnpm run test:rollup -- __tests__/intigration/shebang.test.ts
# deliberate rollup update: must work
PACKEM_TEST_BUNDLER=rollup pnpm exec vitest run __tests__/intigration/shebang.test.ts -u
```

**Verify**: the first command runs the suite normally (guard does not fire,
because there is no `-u`). The second runs and, if anything changed, touches
only `shebang.test.ts.snap`. Immediately revert any snapshot churn from this
verification: `git checkout -- __tests__/intigration/__snapshots__/`.

## Test plan

There is no dedicated unit-test harness for the vitest config; the verification
IS the test (Steps 2–3 are positive and negative cases):
- Negative case (guard SHOULD fire): bare `-u` with env unset → throws.
- Positive case A (guard SHOULD NOT fire): run without `-u` → normal.
- Positive case B (guard SHOULD NOT fire): `-u` with `PACKEM_TEST_BUNDLER` set → updates.

Leave no snapshot changes committed from these checks (`git status` clean for
`__snapshots__/`).

## Done criteria

ALL must hold:

- [ ] `packages/packem/vitest.config.ts` throws when `-u`/`--update` is present and `PACKEM_TEST_BUNDLER` is unset.
- [ ] `cd packages/packem && pnpm exec tsc --noEmit` shows no new errors.
- [ ] Step 2 command exits non-zero with the guard message and changes no snapshot files.
- [ ] Step 3 normal run is unaffected; deliberate `PACKEM_TEST_BUNDLER=rollup ... -u` works.
- [ ] `git status --short` shows ONLY `packages/packem/vitest.config.ts` modified (no `.snap`/`.rolldown.snap`).
- [ ] `plans/README.md` status row for 002 updated.

## STOP conditions

Stop and report back (do not improvise) if:
- vitest's update flag is not `-u`/`--update` in the installed version (check
  `pnpm exec vitest --help | grep -i update`); if the flag differs, report the
  actual flag rather than guessing.
- Throwing from `vitest.config.ts` does not abort the run in the installed
  vitest version (the guard would be ineffective) — report this.
- The config file has drifted and no longer contains the `bundlerSnapshotSuffix` line.

## Maintenance notes

- If a `windows`/different shell path ever needs snapshot regen, the env-var
  approach still works (`cross-env` is already a dependency and the package
  scripts use it).
- This guard is defense-in-depth, not a substitute for the documented workflow
  (see plan 005 / `AGENTS.md`): always `cd packages/packem` before `-u`.
- Reviewer should confirm the guard text names the exact recovery commands so a
  developer who hits it can self-serve.
- A complementary lint-staged guard (reject commits that touch `.snap` without
  matching `.rolldown.snap`) was considered but deferred — it has false-positive
  risk on legitimately rollup-only snapshot changes.
