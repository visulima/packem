# Plan 019: Destroy both streams on error in the url-plugin copy helper

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e34f3daab..HEAD -- packages/packem-plugins/src/plugins/url.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e34f3daab`, 2026-06-16

## Why this matters

The `copy()` helper in the url plugin pipes a read stream into a write stream.
On error it calls `reject`, but it never destroys the *other* stream:
`.pipe()` only auto-closes the destination on the source's `'end'` — not on an
`'error'`. So a read error leaves the write file descriptor open, and a write
error leaves the read stream flowing; both leak a handle until GC. Under builds
that emit many assets (images/fonts) this can contribute to fd pressure on the
error path. Low impact, but a clean, contained fix.

## Current state

`packages/packem-plugins/src/plugins/url.ts:21-36`:

```ts
const copy = async (source: string, destination: string): Promise<void> => {
    await new Promise((resolve, reject) => {
        const read = createReadStream(source);

        read.on("error", reject);

        const write = createWriteStream(destination);

        write.on("error", reject);
        write.on("finish", () => {
            resolve(undefined);
        });

        read.pipe(write);
    });
};
```

Imports already present at top of file:
`import { createReadStream, createWriteStream } from "node:fs";`

### Repo conventions to match

- 4-space indent, double quotes, ESM, `node:` prefixes. This file is a
  "Modified copy of" the rollup url plugin (see header comment) — keep the
  header and surrounding style intact.

## Commands you will need

| Purpose   | Command                                                                       | Expected on success |
|-----------|-------------------------------------------------------------------------------|---------------------|
| Typecheck | `cd packages/packem-plugins && pnpm run lint:types`                            | exit 0, no errors   |
| Lint      | `cd packages/packem-plugins && pnpm exec eslint src/plugins/url.ts`            | exit 0              |
| Tests     | `cd packages/packem-plugins && pnpm exec vitest run`                           | all pass (note pre-existing failures separately) |

## Scope

**In scope** (the only file you should modify):
- `packages/packem-plugins/src/plugins/url.ts`

**Out of scope** (do NOT touch):
- The rest of the url plugin (filter logic, svg encoding, emit logic).
- The header license comment.

## Git workflow

- Branch: `advisor/004-url-copy-cleanup`
- Conventional-commit message, e.g. `fix(packem-plugins): destroy streams on error in url copy`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Destroy the counterpart stream on each error

Update the two error handlers so each tears down the other stream before
rejecting. Target shape:

```ts
        read.on("error", (error) => {
            write.destroy();
            reject(error);
        });

        write.on("error", (error) => {
            read.destroy();
            reject(error);
        });
```

Note `write` is declared after `read` in the current code — move the
`const write = createWriteStream(destination);` declaration **above** the
`read.on("error", ...)` handler so both references are in scope, e.g.:

```ts
        const read = createReadStream(source);
        const write = createWriteStream(destination);

        read.on("error", (error) => {
            write.destroy();
            reject(error);
        });

        write.on("error", (error) => {
            read.destroy();
            reject(error);
        });
        write.on("finish", () => {
            resolve(undefined);
        });

        read.pipe(write);
```

**Verify**: `cd packages/packem-plugins && pnpm run lint:types` → exit 0.

### Step 2: Lint and test

**Verify**:
- `cd packages/packem-plugins && pnpm exec eslint src/plugins/url.ts` → exit 0
- `cd packages/packem-plugins && pnpm exec vitest run` → all pass (record any
  failures that are clearly pre-existing and unrelated to url.ts; do not fix
  them here).

## Test plan

- This is an error-path hardening fix; the happy-path copy is already covered by
  existing url/asset integration tests. A dedicated unit test for the
  destroy-on-error path is optional — only add one if `packem-plugins` already
  has a unit-test harness you can mirror for stream helpers. If you add it:
  trigger a write error by targeting an unwritable destination (e.g. a directory
  path) and assert the promise rejects.

## Done criteria

ALL must hold:

- [ ] `cd packages/packem-plugins && pnpm run lint:types` exits 0
- [ ] `grep -n "write.destroy()" packages/packem-plugins/src/plugins/url.ts` and `grep -n "read.destroy()" packages/packem-plugins/src/plugins/url.ts` each return 1 match
- [ ] `pnpm exec eslint src/plugins/url.ts` exits 0
- [ ] No files outside `url.ts` modified (`git status`)
- [ ] `plans/README.md` status row for 019 updated

## STOP conditions

Stop and report back if:

- The "Current state" excerpt no longer matches the live code (drift).
- The copy helper has already been rewritten to use `stream/promises`
  `pipeline()` (which handles cleanup automatically) — in that case the bug is
  already fixed; just confirm and note it.

## Maintenance notes

- A cleaner long-term shape is `await pipeline(read, write)` from
  `node:stream/promises`, which destroys both streams on error automatically.
  Deferred out of this plan to keep the diff minimal; flag it if the file is
  touched again.
- Reviewer: confirm `write` is declared before the `read` error handler (scope),
  and that `resolve`/`reject` are still called exactly once on every path.
