# Plan 016: Handle read-stream errors in gzip/brotli size helpers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e34f3daab..HEAD -- packages/packem/src/packem/utils/gzip-size.ts packages/packem/src/packem/utils/brotli-size.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e34f3daab`, 2026-06-16

## Why this matters

`gzipSize()` and `brotliSize()` compute build-output size metrics by piping a
file through a zlib compressor. They attach an `error` listener to the
**compressor** stream but not to the **read** stream. Node's `.pipe()` does
**not** forward source-stream errors to the destination. So if the file read
fails mid-build (file deleted between walk and stat, permission error, EMFILE
under concurrent builds), the `ReadStream` emits `'error'` with no listener
attached — which Node escalates to an **unhandled `'error'` event that crashes
the whole build process** instead of rejecting the promise. These helpers run
once per output file (`packages/packem/src/packem/build.ts:903`), concurrently,
so the failure surface is real on large builds.

## Current state

Two near-identical files, each with the same defect.

`packages/packem/src/packem/utils/gzip-size.ts` (entire file):

```ts
import { createReadStream } from "node:fs";
import { createGzip } from "node:zlib";

const gzipSize = async (path: string): Promise<number> =>
    await new Promise((resolve, reject) => {
        let size = 0;

        const pipe = createReadStream(path).pipe(createGzip({ level: 9 }));

        pipe.on("error", reject);
        pipe.on("data", (buf: Buffer) => {
            size += buf.length;
        });
        pipe.on("end", () => {
            resolve(size);
        });
    });

export default gzipSize;
```

`packages/packem/src/packem/utils/brotli-size.ts` (entire file):

```ts
import { createReadStream } from "node:fs";
import { constants, createBrotliCompress } from "node:zlib";

// Quality 4 trades ~5% larger reported size for ~10x faster compression vs
// quality 11. The output is build-time reporting only — actual CDN delivery
// re-compresses at the operator's chosen level — so the slow max-quality
// estimate isn't load-bearing.
const brotliSize = async (path: string): Promise<number> =>
    await new Promise((resolve, reject) => {
        let size = 0;

        const pipe = createReadStream(path).pipe(
            createBrotliCompress({
                params: {
                    [constants.BROTLI_PARAM_QUALITY]: 4,
                },
            }),
        );

        pipe.on("error", reject);
        pipe.on("data", (buf: Buffer) => {
            size += buf.length;
        });
        pipe.on("end", () => {
            resolve(size);
        });
    });

export default brotliSize;
```

The defect in both: the `ReadStream` returned by `createReadStream(path)` is
immediately `.pipe()`-d and never bound to a variable, so its `'error'` event
has no handler.

### Repo conventions to match

- ESM, `node:` import prefixes, 4-space indent, trailing commas, double quotes.
- These files use no external helpers — keep them dependency-free.
- Keep the existing comments (the brotli quality note) verbatim.

## Commands you will need

| Purpose   | Command                                                                                 | Expected on success |
|-----------|-----------------------------------------------------------------------------------------|---------------------|
| Typecheck | `cd packages/packem && pnpm run lint:types`                                              | exit 0, no errors   |
| Lint      | `cd packages/packem && pnpm exec eslint src/packem/utils/gzip-size.ts src/packem/utils/brotli-size.ts` | exit 0              |
| Unit test | `cd packages/packem && pnpm exec vitest run __tests__/unit/packem/utils/size.test.ts`    | all pass            |

## Scope

**In scope** (the only files you should modify):
- `packages/packem/src/packem/utils/gzip-size.ts`
- `packages/packem/src/packem/utils/brotli-size.ts`
- `packages/packem/__tests__/unit/packem/utils/size.test.ts` (create)

**Out of scope** (do NOT touch):
- `packages/packem/src/packem/build.ts` — the caller; its `Promise.all` already
  awaits these helpers and will correctly propagate the rejection once these are
  fixed. No change needed there.
- The brotli quality level / gzip level — behavior must stay identical.

## Git workflow

- Branch: `advisor/001-size-stream-errors`
- Conventional-commit message, e.g. `fix(packem): reject size helpers on read-stream errors`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Bind the read stream and attach an error handler — gzip

In `gzip-size.ts`, capture the read stream and forward its errors to `reject`.
Target shape:

```ts
const readStream = createReadStream(path);
const pipe = readStream.pipe(createGzip({ level: 9 }));

readStream.on("error", reject);
pipe.on("error", reject);
pipe.on("data", (buf: Buffer) => {
    size += buf.length;
});
pipe.on("end", () => {
    resolve(size);
});
```

**Verify**: `cd packages/packem && pnpm run lint:types` → exit 0.

### Step 2: Same fix for brotli

In `brotli-size.ts`, apply the identical pattern — bind the `createReadStream`
result to `readStream`, keep the `createBrotliCompress({...})` call and its
quality comment unchanged, and add `readStream.on("error", reject);`.

**Verify**: `cd packages/packem && pnpm exec eslint src/packem/utils/gzip-size.ts src/packem/utils/brotli-size.ts` → exit 0.

### Step 3: Add a regression test

Create `packages/packem/__tests__/unit/packem/utils/size.test.ts`. Model the
structure (imports, `describe`/`it`, `expect`) after any existing test under
`packages/packem/__tests__/unit/` — open one first to match the style and the
vitest import convention used in this package.

Cover:
1. **Happy path**: write a temp file with known content, assert `gzipSize` and
   `brotliSize` each resolve to a positive number.
2. **Regression (the bug)**: call `gzipSize` and `brotliSize` with a path that
   does not exist (e.g. `join(tmpdir(), "packem-does-not-exist-<unique>")`) and
   assert the returned promise **rejects** (e.g.
   `await expect(gzipSize(missing)).rejects.toThrow()`), rather than crashing
   the process. Do not use `Math.random()` for the unique suffix (it is
   unavailable in some runners) — derive uniqueness from `process.pid` or a
   counter.

**Verify**: `cd packages/packem && pnpm exec vitest run __tests__/unit/packem/utils/size.test.ts` → all pass (≥4 assertions).

## Test plan

- New file `__tests__/unit/packem/utils/size.test.ts`, 2 cases per helper
  (happy path + missing-file rejection), 4 tests total.
- If a unit-test directory convention differs (e.g. tests live elsewhere),
  place the file mirroring the nearest existing `utils` unit test and note the
  location in your status update.
- Verification: the vitest command above → all pass.

## Done criteria

ALL must hold:

- [ ] `cd packages/packem && pnpm run lint:types` exits 0
- [ ] `grep -n 'readStream.on("error"' packages/packem/src/packem/utils/gzip-size.ts packages/packem/src/packem/utils/brotli-size.ts` returns 2 matches
- [ ] New test file exists and `pnpm exec vitest run __tests__/unit/packem/utils/size.test.ts` passes, including the missing-file rejection cases
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 016 updated

## STOP conditions

Stop and report back if:

- The "Current state" excerpts no longer match the live files (drift).
- Either helper has already been refactored to bind the read stream (the bug is
  already fixed) — in that case just ensure the regression test exists and note
  it.
- The unit test cannot locate a working vitest config / the package has no
  `__tests__/unit` convention you can mirror.

## Maintenance notes

- If these helpers are ever changed to accept a `Buffer`/stream instead of a
  path, the read-stream error handling becomes moot — revisit the test.
- Reviewer should confirm `.pipe()` source errors are handled (the whole point);
  a green typecheck alone does not prove it — the rejection test does.
