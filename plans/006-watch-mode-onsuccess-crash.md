# Plan 006: Make watch mode survive a failing `onSuccess` script (and cover the failure path with a test)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4964b64c7..HEAD -- packages/packem/src/rollup/watch.ts packages/packem/__tests__/intigration/watch.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4964b64c7`, 2026-06-11

## Why this matters

In watch mode, packem registers `async` handlers on the bundler watcher. The
`END` handler awaits `runOnsuccess()`, which **throws** when the user's
`onSuccess` shell command exits non-zero (`packages/packem/src/packem/index.ts:1020-1022`).
Rollup's watcher invokes rebuild cycles through a **floating, un-awaited
`this.run()`** (see `node_modules/.pnpm/rollup@4.60.4/node_modules/rollup/dist/shared/watch.js:162`),
so that thrown error becomes an **unhandled promise rejection**, and packem has
no `process.on("unhandledRejection")` handler anywhere (`grep -rn unhandledRejection packages/packem/src` → no matches).
Net effect: a user whose `onSuccess` command fails once gets their entire watch
process killed by Node instead of an error log and a watcher that keeps
watching. Separately, a rejection from `doOnSuccessCleanup()` inside the
`change` handler is caught by rollup but **aborts the rebuild** and surfaces as
a confusing rollup `ERROR` event. The fix: catch and log errors inside packem's
own handlers so the watcher always keeps running.

## Current state

- `packages/packem/src/rollup/watch.ts` — watch orchestration. The shared
  `watchHandler` (lines 48–134) wires handlers onto the watcher; per the comment
  at lines 256–260 the **same handler is used for both the rollup and rolldown
  backends**, so one fix covers both.
- `packages/packem/src/packem/index.ts` — defines `runOnsuccess` (throws on
  non-zero exit, lines 996–1024) and `doOnSuccessCleanup` (can throw, lines
  975–994). Do NOT change these — throwing is correct for the non-watch path,
  where `await runOnsuccess()` at line 1121 is properly try/caught.

Excerpt of the buggy handlers, `packages/packem/src/rollup/watch.ts:70-133`:

```ts
    watcher.on("change", async (id, { event }) => {
        await doOnSuccessCleanup?.();                       // ← rejection aborts the rebuild

        logger.info({
            message: `${cyan(relative(".", id))} was ${event}d`,
            prefix,
        });
    });
    // ...
    watcher.on("event", async (event: RollupWatcherEvent) => {
        // eslint-disable-next-line default-case
        switch (event.code) {
            case "BUNDLE_END": {
                await event.result.close();
                if (useCache) {
                    fileCache.set(mode === "bundle" ? WATCH_CACHE_KEY : `dts-${WATCH_CACHE_KEY}`, event.result.cache);
                }
                logger.raw(`\n⚡️ Build run in ${String(event.duration)}ms\n\n`);
                await runBuilder?.(true);                   // ← rejection = unhandled
                break;
            }
            // ... BUNDLE_START / ERROR cases ...
            case "END": {
                logger.success({ message: "Rebuild finished", prefix });
                await runOnsuccess?.();                     // ← THROWS on failing onSuccess → process crash
                break;
            }
        }
    });
```

The `logger` in this file is obtained via `getLogger(context)` (line 44) and
has an `error(payload: LogPayload)` method — see the existing `ERROR` case at
lines 120–130 for the exact `logger.error({ context, message, prefix })` call
shape. Match it.

Existing test exemplar: `packages/packem/__tests__/intigration/watch.test.ts`
— first test (lines 44–114) spawns the built CLI with `execaNode`, passes
`--watch --onSuccess=... --no-validation`, polls accumulated stdout for
markers, triggers a rebuild by rewriting `src/index.js`, then kills with
SIGINT. Model the new test on it.

Repo conventions: conventional commits; integration tests run the **built
dist**, so rebuild packem before running them.

## Commands you will need

| Purpose | Command | Run from | Expected on success |
|---|---|---|---|
| Install | `pnpm install --frozen-lockfile` | repo root | exit 0 |
| Build packages | `pnpm run build:packages` | repo root | exit 0 |
| Typecheck | `pnpm run lint:types` | repo root | exit 0 |
| Watch tests (rollup) | `env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/watch.test.ts"` | `packages/packem` | all pass |
| Watch tests (rolldown) | `cross-env PACKEM_TEST_BUNDLER=rolldown pnpm exec vitest run "__tests__/intigration/watch.test.ts"` | `packages/packem` | all pass |
| Lint changed pkg | `pnpm run lint:eslint` | `packages/packem` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/packem/src/rollup/watch.ts`
- `packages/packem/__tests__/intigration/watch.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `packages/packem/src/packem/index.ts` — `runOnsuccess`/`doOnSuccessCleanup`
  throwing is correct for the non-watch path; the fix belongs at the watch
  call sites only.
- Any global `process.on("unhandledRejection")` handler — too blunt; it would
  mask unrelated bugs.
- Snapshot files (`*.snap`) — this change must not alter build output.

## Git workflow

- Branch: `advisor/006-watch-onsuccess-crash`
- Conventional commit, e.g. `fix(packem): keep watch mode alive when onSuccess fails`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Guard the `change` handler

In `watchHandler` (`packages/packem/src/rollup/watch.ts:70-77`), wrap the
`doOnSuccessCleanup?.()` await in try/catch. On error, log via
`logger.error({ context: [error], message: \`onSuccess cleanup failed: ${...message}\`, prefix })`
and continue (the `logger.info` for the change event must still run).

**Verify**: `pnpm run lint:types` (repo root) → exit 0.

### Step 2: Guard the `event` handler

Wrap the body of the `watcher.on("event", ...)` switch (lines 86–133) so that a
rejection from `event.result.close()`, `runBuilder?.(true)` (BUNDLE_END), or
`runOnsuccess?.()` (END) is caught and logged with `logger.error` (same payload
shape as the existing ERROR case) instead of escaping. The simplest correct
shape: a single try/catch around the whole `switch`. Keep the existing `ERROR`
case logic unchanged inside it. The handler must never throw.

**Verify**: `pnpm run lint:types` → exit 0, then `pnpm run lint:eslint` in
`packages/packem` → exit 0. (The file has a cognitive-complexity lint budget —
if the wrap trips it, extract the switch body into a named helper function in
the same file rather than disabling the rule.)

### Step 3: Rebuild the dist

**Verify**: `pnpm run build:packages` (repo root) → exit 0.

### Step 4: Add the failing-onSuccess regression test

In `packages/packem/__tests__/intigration/watch.test.ts`, add a test modeled on
the existing first test (lines 44–114):

`it("should keep watching when the onSuccess command fails", { timeout: 30_000 }, ...)`

1. Spawn watch with `--onSuccess=exit 1` (the command runs with `shell: true`).
2. Wait (polling, like `waitForFirstSuccess`) until stdout+stderr contains
   `onSuccess script failed with exit code 1` (this exact message is thrown at
   `packages/packem/src/packem/index.ts:1021` and must now be *logged*, not
   crash).
3. Assert the process is still alive (`proc.exitCode === undefined` / not
   settled), then rewrite `src/index.js` to trigger a rebuild and wait for a
   second occurrence of the failure message (or a second "Rebuild finished")
   — proving the watcher survived and rebuilt.
4. `proc.kill("SIGINT")` and assert, as the existing test does, that
   termination came from our SIGINT (`result.signal === "SIGINT" || result.exitCode === 0`).
5. Also assert stdout+stderr does NOT contain `UnhandledPromiseRejection`.

Note: capture **both** stdout and stderr into the polled buffer — logger.error
may write to stderr.

**Verify**: from `packages/packem`:
`env -u PACKEM_TEST_BUNDLER pnpm exec vitest run "__tests__/intigration/watch.test.ts"` → all tests pass (existing ones + 1 new).

### Step 5: Run the watch suite under rolldown

The same `watchHandler` drives the rolldown native watcher.

**Verify**: from `packages/packem`:
`cross-env PACKEM_TEST_BUNDLER=rolldown pnpm exec vitest run "__tests__/intigration/watch.test.ts"` → all pass.

## Test plan

- New: `watch.test.ts` → "should keep watching when the onSuccess command fails"
  (covers: failing onSuccess logged not fatal; watcher rebuilds afterwards; no
  unhandled rejection). Pattern: the existing first watch test.
- Existing watch tests stay green on both backends (steps 4–5).

## Done criteria

ALL must hold:

- [ ] `pnpm run lint:types` exits 0 (repo root)
- [ ] `pnpm run lint:eslint` exits 0 in `packages/packem`
- [ ] Watch suite passes under rollup AND rolldown (commands above), including
      the new failing-onSuccess test
- [ ] `git status --short` shows changes ONLY in the two in-scope files
- [ ] No `*.snap` / `*.rolldown.snap` files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The excerpts above don't match `watch.ts` (drift).
- The new test cannot observe the `onSuccess script failed` message in
  stdout+stderr within 10s — the logging path may differ from the plan's
  assumption; report what the output actually contains.
- Fixing the handlers requires modifying `packages/packem/src/packem/index.ts`.
- The rolldown watch run (step 5) fails on a *pre-existing* test — note it as
  pre-existing and continue only if the new test passes on rollup; report the
  rolldown failure.

## Maintenance notes

- Any future handler added to `watcher.on(...)` in `watch.ts` must follow the
  same rule: async watch handlers must never reject — catch and log.
- Reviewer should scrutinize that the ERROR case's existing behavior is
  unchanged and that the catch doesn't swallow the `BUNDLE_END` cache write.
- Deferred (deliberately): replacing the stdout-polling test style with
  event-based waits — tracked as a known test-quality nit, not part of this fix.
