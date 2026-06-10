# Plan 004: Extract the duplicated dependency-cache load logic in `build.ts`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 15331f451..HEAD -- packages/packem/src/bundler/build.ts`
> If that file changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `15331f451`, 2026-06-10

## Why this matters

`packages/packem/src/bundler/build.ts` has two builders, `buildWithRollup` and
`buildWithRolldown`. Both contain a byte-identical block that (1) checks whether
a persisted dependencies cache exists and (2) reads it and replays its entries
into `context.usedDependencies` / `context.hoistedDependencies`. The same logic
to **write** that cache also appears in both `try` blocks.

This is a lockstep-maintenance hazard: the deserialized cache shape, the
eslint-disable guards, and the cache key all have to stay in sync across two
functions. A change applied to one path and missed in the other silently
desyncs dependency validation between the rollup and rolldown backends — and
those are exactly the kind of divergence the project is trying to avoid. There
is also a small redundancy in the rollup path (`DEPENDENCIES_CACHE_KEY` is read
twice — once for the `hasCachedDependencies` boolean, once for the payload).

This plan extracts two small private helpers — `loadDependenciesCache` and
`persistDependenciesCache` — and has both builders call them. Pure mechanical
de-duplication, no behavior change.

## Current state

`packages/packem/src/bundler/build.ts` (relevant parts, as they exist today):

- Module constants (lines 12-13):
  ```typescript
  const BUNDLE_CACHE_KEY = "rollup-build.json";
  const DEPENDENCIES_CACHE_KEY = "dependencies-cache.json";
  ```
- `buildWithRollup` cache **load** (lines 25-54): computes
  `hasCachedDependencies` (reads `DEPENDENCIES_CACHE_KEY`), then inside
  `if (loadCache)` → `if (hasCachedDependencies)` reads it again and replays:
  ```typescript
  const hasCachedDependencies
      = context.options.validation
          && context.options.validation.dependencies !== false
          && !!fileCache.get<{ hoisted: string[]; used: string[] }>(DEPENDENCIES_CACHE_KEY, subDirectory);
  ...
      if (hasCachedDependencies) {
          const cachedDeps = fileCache.get<{ hoisted: string[]; used: string[] }>(DEPENDENCIES_CACHE_KEY, subDirectory);

          if (cachedDeps) {
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cache JSON read from disk may omit fields
              cachedDeps.used?.forEach((dep) => context.usedDependencies.add(dep));
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cache JSON read from disk may omit fields
              cachedDeps.hoisted?.forEach((dep) => context.hoistedDependencies.add(dep));
          }
      }
  ```
- `buildWithRolldown` cache **load** (lines 102-118): the SAME
  `hasCachedDependencies` + replay block (without the surrounding `loadCache` /
  `BUNDLE_CACHE_KEY` logic, which is rollup-only by design — see the comment at
  lines 98-101).
- Cache **write** — identical block in both `try` bodies (rollup lines 64-73,
  rolldown lines 128-137):
  ```typescript
  if (context.options.validation && context.options.validation.dependencies !== false) {
      fileCache.set(
          DEPENDENCIES_CACHE_KEY,
          {
              hoisted: [...context.hoistedDependencies],
              used: [...context.usedDependencies],
          },
          subDirectory,
      );
  }
  ```

Repo conventions to match:
- This file uses module-private arrow-function consts (e.g.
  `const buildWithRollup = async (...) => {...}`) declared before `build`. Add
  the helpers in the same style, above `buildWithRollup`.
- Keep the existing eslint-disable comments verbatim when moving the replay
  loop — they suppress real, intentional `no-unnecessary-condition` warnings on
  the disk-read payload.
- `FileCache` is imported as a type from `@visulima/packem-share`; the runtime
  `fileCache` instance is passed in. Helpers take `fileCache`, `context`,
  `subDirectory`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck (stricter than build) | `pnpm exec nx run packem:lint:types` OR `cd packages/packem && pnpm exec tsc --noEmit` | exit 0 |
| Lint | `cd packages/packem && pnpm run lint:eslint` | exit 0 |
| Build | `pnpm run build:packages` | exit 0 |
| Rollup integration suite | `cd packages/packem && pnpm run test:rollup` | all pass (baseline) |
| Rolldown integration suite | `cd packages/packem && pnpm run test:rolldown` | all pass (baseline) |

## Scope

**In scope** (the only file you should modify):
- `packages/packem/src/bundler/build.ts`

**Out of scope** (do NOT touch):
- The `BUNDLE_CACHE_KEY` / `loadCache` logic in `buildWithRollup` — that is
  rollup-only by design (rolldown owns its own incremental cache, per the
  comment at lines 98-101). Do NOT try to share it with the rolldown path.
- `build-types.ts` (`DTS_CACHE_KEY`) and `watch.ts` (`WATCH_CACHE_KEY`) — these
  use different, intentionally separate cache keys; this plan does not unify
  cache keys across files.
- The output-write loops, hook calls, and `close()` handling.

## Git workflow

- Branch: `advisor/004-dedupe-dependency-cache-load`
- One commit. Conventional commits, e.g.:
  `refactor(packem): extract shared dependency-cache load/persist helpers`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the two helpers

Above `buildWithRollup`, add:

```typescript
const loadDependenciesCache = (
    context: BuildContext<InternalBuildOptions>,
    fileCache: FileCache,
    subDirectory: string,
): void => {
    const cachedDeps = fileCache.get<{ hoisted: string[]; used: string[] }>(DEPENDENCIES_CACHE_KEY, subDirectory);

    if (cachedDeps) {
        // The deserialized cache payload can be partial despite the typed
        // shape, so the runtime guards are intentional.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cache JSON read from disk may omit fields
        cachedDeps.used?.forEach((dep) => context.usedDependencies.add(dep));
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cache JSON read from disk may omit fields
        cachedDeps.hoisted?.forEach((dep) => context.hoistedDependencies.add(dep));
    }
};

const dependencyValidationEnabled = (context: BuildContext<InternalBuildOptions>): boolean =>
    Boolean(context.options.validation) && context.options.validation.dependencies !== false;

const persistDependenciesCache = (
    context: BuildContext<InternalBuildOptions>,
    fileCache: FileCache,
    subDirectory: string,
): void => {
    if (dependencyValidationEnabled(context)) {
        fileCache.set(
            DEPENDENCIES_CACHE_KEY,
            {
                hoisted: [...context.hoistedDependencies],
                used: [...context.usedDependencies],
            },
            subDirectory,
        );
    }
};
```

Notes:
- `dependencyValidationEnabled` captures the repeated
  `context.options.validation && context.options.validation.dependencies !== false`
  predicate used in 4 places. If TypeScript narrows `context.options.validation`
  awkwardly with `Boolean(...)`, keep the original explicit form
  (`context.options.validation !== undefined && context.options.validation.dependencies !== false`)
  — correctness over brevity. Verify with `tsc --noEmit`.

### Step 2: Use the helpers in `buildWithRollup`

- Replace the inline replay block (the `if (hasCachedDependencies) { const cachedDeps = ... }`)
  with a call to `loadDependenciesCache(context, fileCache, subDirectory)`
  guarded by the existing `if (hasCachedDependencies)`.
- Keep `hasCachedDependencies` (it still gates whether to load) but compute it
  using the cache read you already do for `loadCache`. The simplest correct
  form: keep the boolean as-is. The double-`get` is acceptable (FileCache serves
  from memory after the first read); de-duping it is optional and must not
  change behavior.
- Replace the cache-write block in the `try` with
  `persistDependenciesCache(context, fileCache, subDirectory)`.

### Step 3: Use the helpers in `buildWithRolldown`

- Replace its replay block with the same `if (hasCachedDependencies) loadDependenciesCache(...)`.
- Replace its cache-write block with `persistDependenciesCache(...)`.

**Verify** after Steps 1-3:
```bash
cd packages/packem && pnpm exec tsc --noEmit && pnpm run lint:eslint
```
→ exit 0, no new errors/warnings.

### Step 4: Prove behavior is unchanged under both backends

```bash
pnpm run build:packages
cd packages/packem
pnpm run test:rollup
pnpm run test:rolldown
```

**Verify**: both suites pass with the same pass/skip counts as before the change
(rollup ~all green; rolldown ~469 passed / 0 failed). No snapshot files should
change — if any do, that signals a behavior change and is a STOP condition.

## Test plan

This is a behavior-preserving refactor; it adds no new tests. The full rollup
and rolldown integration suites are the regression net (they exercise the
dependency cache via warm builds and dependency validation). Verification:
- `pnpm run test:rollup` and `pnpm run test:rolldown` both green, unchanged counts.
- `git status` shows no `.snap`/`.rolldown.snap` changes.

## Done criteria

ALL must hold:

- [ ] `build.ts` has `loadDependenciesCache` and `persistDependenciesCache` helpers.
- [ ] Neither `buildWithRollup` nor `buildWithRolldown` contains an inline `cachedDeps.used?.forEach` block anymore (`grep -c "cachedDeps.used" packages/packem/src/bundler/build.ts` returns `1` — only inside the helper).
- [ ] `cd packages/packem && pnpm exec tsc --noEmit` exits 0.
- [ ] `cd packages/packem && pnpm run lint:eslint` exits 0.
- [ ] `pnpm run test:rollup` and `pnpm run test:rolldown` pass with unchanged counts.
- [ ] Only `packages/packem/src/bundler/build.ts` is modified; no snapshot files changed.
- [ ] `plans/README.md` status row for 004 updated.

## STOP conditions

Stop and report back (do not improvise) if:
- Any integration test that passed before now fails, or the pass/skip counts
  change — the refactor altered behavior; do not adjust tests to match.
- `tsc` reports a narrowing error on `context.options.validation` that the
  explicit predicate form doesn't resolve.
- You find the rolldown and rollup cache-load blocks were NOT actually identical
  (the codebase drifted) — report the difference instead of forcing a shared helper.

## Maintenance notes

- If the dependencies-cache payload shape changes (new field), it now changes in
  ONE place (`loadDependenciesCache` / `persistDependenciesCache`).
- The rollup-only `BUNDLE_CACHE_KEY` logic deliberately stays inline in
  `buildWithRollup` — do not fold it into these helpers; rolldown must not write
  that key.
- Reviewer should confirm the diff is purely structural (no changed strings,
  keys, or guard conditions) and that both suites stayed green.
