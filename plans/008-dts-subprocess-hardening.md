# Plan 008: Harden rollup-plugin-dts subprocess failure paths (fork hang + swallowed tsgo exit code)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4964b64c7..HEAD -- packages/rollup-plugin-dts/src/generate.ts packages/rollup-plugin-dts/src/tsgo.ts packages/rollup-plugin-dts/__tests__/`
> On any in-scope drift, compare the "Current state" excerpts against live code;
> on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4964b64c7`, 2026-06-11

## Why this matters

Two subprocess paths in `@visulima/rollup-plugin-dts` fail badly when the
subprocess fails:

1. **Parallel tsc worker**: `buildStart` `fork()`s a worker and wires birpc
   over its message channel, but registers **no `error` handler** on the child.
   If the fork fails (ENOENT, resource limits), `await rpc!.tscEmit(options)`
   at `generate.ts:289` waits for a message that will never arrive — the build
   **hangs forever** with no diagnostic.
2. **tsgo**: `spawnAsync` in `tsgo.ts` resolves on `close` **without checking
   the exit code**. A failed tsgo run "succeeds", and the user later gets a
   generic "did not generate dts file" error instead of the real cause.

Both fixes are small, local, and make DTS failures loud and immediate.

## Current state

- `packages/rollup-plugin-dts/src/generate.ts` — plugin core.
  `buildStart` (lines 135–160) excerpt:

  ```ts
  if (parallel) {
      childProcess = fork(new URL(WORKER_URL, import.meta.url), {
          stdio: "inherit",
      });
      rpc = (await import("birpc")).createBirpc<TscFunctions>(
          {},
          {
              on: (function_) => childProcess!.on("message", function_),
              post: (data) => childProcess!.send(data),
          },
      );
  }
  ```

  The RPC call site, line 289 (inside the `transform` hook):

  ```ts
  result = parallel ? await rpc!.tscEmit(options) : tscModule.tscEmit(options);
  ```

  `buildEnd` (lines 121–133) does `childProcess?.kill()` — cleanup exists.

- `packages/rollup-plugin-dts/src/tsgo.ts:11-22`:

  ```ts
  const spawnAsync = async (...args: Parameters<typeof spawn>): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
          const child = spawn(...args);

          child.on("close", () => {
              resolve();                       // ← resolves even on exit code 1
          });
          child.on("error", (error) => {
              reject(error);
          });
      });
  };
  ```

  `runTsgo` (lines 45–81) calls `spawnAsync(tsgo, args, { stdio: "inherit" })`
  and returns a `mkdtemp`-created `tsgoDist` directory. `runTsgo` accepts an
  optional `tsgoPath` override — useful for testing.

- Tests live in `packages/rollup-plugin-dts/__tests__/` (`index.test.ts`,
  `tsc.test.ts`, `source-map.test.ts`, helpers in `utils.ts`). Follow their
  vitest style.

## Commands you will need

| Purpose | Command | Run from | Expected on success |
|---|---|---|---|
| Typecheck | `pnpm run lint:types` | `packages/rollup-plugin-dts` | exit 0 |
| Unit tests | `pnpm run test` | `packages/rollup-plugin-dts` | all pass |
| Lint | `pnpm run lint:eslint` | `packages/rollup-plugin-dts` | exit 0 |
| Build all (downstream check) | `pnpm run build:packages` | repo root | exit 0 |
| Packem integration (DTS-heavy) | `env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/typescript.test.ts"` | `packages/packem` | all pass |

## Scope

**In scope**:
- `packages/rollup-plugin-dts/src/generate.ts` (the `buildStart` fork block and
  the line-289 call site only)
- `packages/rollup-plugin-dts/src/tsgo.ts`
- `packages/rollup-plugin-dts/__tests__/tsgo.test.ts` (create)

**Out of scope**:
- `packages/rollup-plugin-dts/src/tsc/` — the worker/tsc internals are fine.
- The birpc protocol or `WORKER_URL` resolution.
- Any behavior change on the success path (no output differences — snapshots
  must not change).

## Git workflow

- Branch: `advisor/008-dts-subprocess-hardening`
- Conventional commit, e.g. `fix(rollup-plugin-dts): fail fast when the tsc worker fork or tsgo run fails`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make `spawnAsync` reject on non-zero exit

In `tsgo.ts`, change the `close` handler to receive `(code, signal)` and:
- resolve when `code === 0`;
- reject with `new Error(\`tsgo exited with ${signal ? \`signal ${signal}\` : \`code ${String(code)}\`}\`)` otherwise.

Also `export` `spawnAsync` so it can be unit-tested (it is currently
module-private; exporting is the repo-cheap way to test it — there is no
test-only export convention in this package).

**Verify**: `pnpm run lint:types` in `packages/rollup-plugin-dts` → exit 0.

### Step 2: Unit-test `spawnAsync`

Create `packages/rollup-plugin-dts/__tests__/tsgo.test.ts` (vitest, style per
`tsc.test.ts`):

- success: `await spawnAsync(process.execPath, ["-e", "process.exit(0)"])`
  resolves.
- failure: `await expect(spawnAsync(process.execPath, ["-e", "process.exit(1)"])).rejects.toThrow(/code 1/)`.
- spawn error: `await expect(spawnAsync("/nonexistent-binary-xyz", [])).rejects.toThrow()`.

**Verify**: `pnpm run test` in `packages/rollup-plugin-dts` → all pass,
including 3 new tests.

### Step 3: Fail fast on fork errors in `generate.ts`

In the `parallel` branch of `buildStart`, await the child's spawn before
creating the rpc, so a failed fork rejects `buildStart` (rollup will surface it
as a build error) instead of hanging later:

```ts
childProcess = fork(new URL(WORKER_URL, import.meta.url), { stdio: "inherit" });

await new Promise<void>((resolve, reject) => {
    childProcess!.once("spawn", () => resolve());
    childProcess!.once("error", (error) => reject(new Error(`Failed to start the parallel tsc worker: ${error.message}`, { cause: error })));
});
```

Then replace the `rpc!` non-null assertion at line 289 with an explicit guard
in the `parallel` branch:

```ts
if (!rpc) {
    return this.error(new Error("Parallel tsc worker is not initialized"));
}
```

(or an equivalent early throw — the point is no `!` assertion on `rpc`).

**Verify**: `pnpm run lint:types` and `pnpm run lint:eslint` in
`packages/rollup-plugin-dts` → exit 0.

### Step 4: Prove no regression on the success path

**Verify**:
1. `pnpm run test` in `packages/rollup-plugin-dts` → all pass.
2. `pnpm run build:packages` (repo root) → exit 0.
3. From `packages/packem`:
   `env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/typescript.test.ts"` → all pass,
   and `git status --short` shows **no modified `.snap` files**.

## Test plan

- New `__tests__/tsgo.test.ts`: 3 `spawnAsync` cases (exit 0, exit 1, spawn
  error). Pattern: existing `tsc.test.ts`.
- Fork-failure path: not directly unit-tested (forcing a fork failure
  deterministically is environment-dependent); covered by typecheck + the
  explicit promise wiring. Note this in the PR description.
- Regression: full rollup-plugin-dts suite + packem `typescript.test.ts`
  integration run, zero snapshot changes.

## Done criteria

ALL must hold:

- [ ] `pnpm run lint:types` and `pnpm run lint:eslint` exit 0 in `packages/rollup-plugin-dts`
- [ ] `pnpm run test` in `packages/rollup-plugin-dts` passes with 3 new tsgo tests
- [ ] `grep -n "rpc!" packages/rollup-plugin-dts/src/generate.ts` returns no matches
- [ ] packem `typescript.test.ts` integration suite passes; `git status` shows no `.snap` changes
- [ ] Changes confined to the 3 in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The excerpts don't match the live code (drift).
- `child_process.fork` in this Node version doesn't emit `spawn` (it does on
  Node ≥15.1, and engines require ≥22.14 — but if the spawn-wait hangs in
  tests, STOP and report rather than adding timeouts).
- Step 4's integration run produces `.snap` diffs — the change leaked into the
  success path; revert and report.
- Exporting `spawnAsync` trips a lint rule that forbids it — report instead of
  restructuring the module.

## Maintenance notes

- If a `vue`/`tsMacro` path later adds more subprocesses, they must follow the
  same rule: every spawned/forked child needs an `error` handler and an
  exit-code check before its output is trusted.
- Reviewer: confirm `buildEnd`'s `childProcess?.kill()` still runs when
  `buildStart` rejects mid-way (rollup calls `buildEnd` on build failure).
- Deferred: surfacing tsgo's stderr into the thrown error (stdio is
  `"inherit"`, so the user sees it in the terminal already).
