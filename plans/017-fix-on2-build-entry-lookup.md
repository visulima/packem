# Plan 017: Replace O(N·M) build-entry lookup with a Map in the size loop

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e34f3daab..HEAD -- packages/packem/src/packem/build.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `e34f3daab`, 2026-06-16

## Why this matters

In the final size-reporting phase, `build()` walks every file under the output
directory and, for each one, does a linear `Array.prototype.find()` over
`context.buildEntries`. That is O(N·M) — N output files × M build entries. On a
large monorepo package (hundreds of output files, hundreds of entries) this is
the kind of quadratic scan that shows up as a stall right before the build
summary prints. A single `Map` keyed by the entry's absolute output path turns
each lookup into O(1), making the whole phase O(N).

## Current state

`packages/packem/src/packem/build.ts`, the size-reporting loop (lines ~862–909):

```ts
    // Walk dist, then compute size metrics in parallel. The previous shape ran
    // stat → brotli → gzip serially per file (brotli at quality 11 alone was
    // the single largest non-rollup phase for small projects).
    const distributionPath = join(context.options.rootDir, context.options.outDir);
    const sizingTasks: Promise<void>[] = [];

    for await (const file of walk(distributionPath, {
        includeDirs: false,
        includeFiles: true,
    })) {
        let entry = context.buildEntries.find((bEntry) => join(distributionPath, bEntry.path) === file.path);

        if (!entry) {
            entry = {
                chunk: true,
                path: file.path,
            };

            context.buildEntries.push(entry);
        }

        entry.size ??= {};
        // ... async sizing task pushed ...
    }

    await Promise.all(sizingTasks);
```

Key facts that make a precomputed Map safe:
- `walk()` yields each `file.path` exactly once, so each iteration looks up a
  distinct key — there is no repeated lookup of the same path.
- When no entry matches, a new "chunk" entry is created with `path: file.path`
  (the walk's absolute path). The lookup key for entries is
  `join(distributionPath, bEntry.path)`. For these synthesized entries
  `join(distributionPath, file.path) !== file.path`, so they would never match
  a later lookup anyway — meaning entries pushed *during* the loop never need to
  be in the lookup index. A Map built once, before the loop, is therefore
  semantically identical to the live `.find()`.

### Repo conventions to match

- 4-space indent, double quotes, trailing commas, ESM.
- `join` is already imported in this file (used on the line above the loop).

## Commands you will need

| Purpose       | Command                                                                  | Expected on success |
|---------------|--------------------------------------------------------------------------|---------------------|
| Typecheck     | `cd packages/packem && pnpm run lint:types`                              | exit 0, no errors   |
| Lint          | `cd packages/packem && pnpm exec eslint src/packem/build.ts`            | exit 0              |
| Integration   | `cd packages/packem && pnpm exec vitest run __tests__/intigration/cli.test.ts` | all pass     |

## Scope

**In scope** (the only file you should modify):
- `packages/packem/src/packem/build.ts`

**Out of scope** (do NOT touch):
- The async sizing closure body (stat/brotli/gzip) — leave it exactly as is.
- `context.buildEntries` construction earlier in the function (the filter at
  ~lines 853–860) — the Map is built *after* that filter, from the final array.
- The synthesized-chunk-entry push behavior — it must remain, unchanged.

## Git workflow

- Branch: `advisor/002-build-entry-map`
- Conventional-commit message, e.g. `perf(packem): O(1) build-entry lookup in size loop`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Build the lookup Map before the loop

Immediately after the `const distributionPath = ...` line and before
`const sizingTasks`, add:

```ts
    const entryByOutputPath = new Map(context.buildEntries.map((bEntry) => [join(distributionPath, bEntry.path), bEntry]));
```

### Step 2: Use the Map inside the loop

Replace:

```ts
        let entry = context.buildEntries.find((bEntry) => join(distributionPath, bEntry.path) === file.path);
```

with:

```ts
        let entry = entryByOutputPath.get(file.path);
```

Leave the `if (!entry) { ... context.buildEntries.push(entry); }` block and
everything after it unchanged.

**Verify**: `cd packages/packem && pnpm run lint:types` → exit 0; then
`grep -n "context.buildEntries.find" packages/packem/src/packem/build.ts` →
no matches inside this loop.

### Step 3: Confirm build behavior is unchanged

The size numbers printed by a build must be identical to before. Run an
integration test that exercises a real build and its size output.

**Verify**: `cd packages/packem && pnpm exec vitest run __tests__/intigration/cli.test.ts` → all pass.

## Test plan

- No new test is strictly required — this is a behavior-preserving refactor
  covered by existing integration tests that build fixtures and assert output.
- Run the broader integration suite if time permits:
  `cd packages/packem && pnpm exec vitest run __tests__/intigration/` → all pass
  (note any *pre-existing* failures unrelated to this change in your status
  update; do not attempt to fix them here).

## Done criteria

ALL must hold:

- [ ] `cd packages/packem && pnpm run lint:types` exits 0
- [ ] `grep -n "new Map(context.buildEntries.map" packages/packem/src/packem/build.ts` returns 1 match
- [ ] The `.find()` lookup inside the size loop is gone; `entryByOutputPath.get(file.path)` is used
- [ ] `pnpm exec vitest run __tests__/intigration/cli.test.ts` passes
- [ ] No files outside `build.ts` modified (`git status`)
- [ ] `plans/README.md` status row for 017 updated

## STOP conditions

Stop and report back if:

- The "Current state" excerpt no longer matches the live code (drift).
- The loop body has changed such that entries pushed during iteration ARE looked
  up again later (would invalidate the "build Map once" assumption) — if you see
  any later read of `context.buildEntries` that depends on entries added inside
  this loop, STOP.
- Integration tests that assert size output fail after the change.

## Maintenance notes

- If a future change makes the loop look up entries added during iteration, the
  precomputed Map must be updated inside the loop (`entryByOutputPath.set(...)`)
  or reverted — call this out in review.
- Reviewer: confirm the Map key (`join(distributionPath, bEntry.path)`) exactly
  matches the old `.find()` predicate's left-hand side, character for character.
