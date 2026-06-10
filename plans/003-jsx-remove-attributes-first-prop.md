# Plan 003: Fix `jsx-remove-attributes` corrupting output when the stripped attribute is the first prop

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 15331f451..HEAD -- packages/packem-rollup/src/plugins/jsx-remove-attributes.ts packages/packem/__tests__/intigration/jsx.test.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `15331f451`, 2026-06-10

## Why this matters

The `jsxRemoveAttributes` plugin strips configured attributes (e.g.
`data-testid`) from automatic-runtime JSX calls. In its **rollup `transform`
path** it removes a matched property with:

```typescript
// -2 to remove the comma and the space before the property
magicString.overwrite(start - 2, end, "");
```

This assumes there is always a `, ` (comma + space) immediately before the
property. That is true for every property **except the first one in the props
object**, where what precedes is the object's `{` (and a space). When the
stripped attribute is the first property — e.g. `<tr data-testid="x" className=.../>`
transpiles to `jsx("tr", { "data-testid": "x", className: ... })` — `start - 2`
lands on the opening `{`, so the overwrite deletes the brace and produces
syntactically broken output like `jsx("tr", , className: ... })`.

The existing tests never catch this because they all put `data-testid` **after**
`className` in source (`jsx.test.ts:216`, `:320`), so the stripped attribute is
never first. The rolldown `renderChunk` path already does this safely (it scans
forward for the property's own trailing comma). This plan makes the rollup path
use the same safe removal, and adds a regression test that strips a
**first-position** attribute.

## Current state

- `packages/packem-rollup/src/plugins/jsx-remove-attributes.ts` — the plugin.
  The removal logic in `stripAttributes` (lines ~75-97):
  ```typescript
  const { end, start } = property as PropertyLiteralValue;

  if (trailingComma) {
      // Remove the property, then consume any whitespace + one
      // trailing comma after it.
      let removeEnd = end;

      while (removeEnd < code.length && WHITESPACE_RE.test(code[removeEnd] as string)) {
          removeEnd += 1;
      }

      if (code[removeEnd] === ",") {
          removeEnd += 1;
      }

      magicString.remove(start, removeEnd);
  } else {
      // -2 to remove the comma and the space before the property
      magicString.overwrite(start - 2, end, "");
  }

  changed = true;
  ```
  - `trailingComma === true` is the rolldown `renderChunk` path (safe).
  - `trailingComma === false` is the rollup `transform` path (the buggy `-2`).
  - `WHITESPACE_RE` is `/\s/` (already defined at the top of the file, line 22).
  - `start`/`end` are the property node's source offsets (estree).
- How it's wired (context only — do not modify): `get-build-options.ts:451-455`
  constructs the plugin from `context.options.rollup.jsxRemoveAttributes.attributes`.
- Existing tests in `packages/packem/__tests__/intigration/jsx.test.ts`:
  - `:210` "should delete a attribute…" — `data-testid` is the **second** prop.
  - `:314` "should delete a attributes…" — both stripped attrs come after `className`.
  - The test harness pattern: write `src/index.tsx`, `createPackageJson`,
    `createTsConfig({ compilerOptions: { jsx: "react-jsx", moduleResolution: "bundler" } })`,
    `createPackemConfig({ config: { rollup: { jsxRemoveAttributes: { attributes: [...] } } } })`,
    install `typescript`/`react`/`react-dom`, `execPackem("build", [], { cwd })`,
    then read `dist/index.mjs` and assert. Tests branch on
    `const isRolldown = process.env.PACKEM_TEST_BUNDLER === "rolldown"` and use
    `normalizeBundleOutput` for the rollup byte assertion.

Why the fix is safe: the rollup `transform` path operates on the per-module
transformer output, which (like the rolldown chunk) has the property followed
by `, ` when it is not the last prop, and by ` }` / `}` when it is. Removing
the property **and its own trailing separator** (forward scan) is correct for
every position, including the first — exactly what the `trailingComma === true`
branch already does. The only nuance: when the stripped prop is the **last**
prop there is no trailing comma; the forward-scan branch handles that (it only
consumes a comma `if (code[removeEnd] === ",")`), but it can leave the leading
`, ` from the previous prop. See Step 1 for handling that cleanly.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `pnpm exec nx run packem-rollup:lint:types` OR `cd packages/packem-rollup && pnpm exec tsc --noEmit` | exit 0 |
| Build the packages tests use | `pnpm run build:packages` | exit 0 |
| Run the jsx suite (rollup) | `cd packages/packem && pnpm run test:rollup -- __tests__/intigration/jsx.test.ts` | all pass |
| Run the jsx suite (rolldown) | `cd packages/packem && pnpm run test:rolldown -- __tests__/intigration/jsx.test.ts` | all pass (no regression) |
| Lint the plugin | `cd packages/packem-rollup && pnpm run lint:eslint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/packem-rollup/src/plugins/jsx-remove-attributes.ts` — fix the removal.
- `packages/packem/__tests__/intigration/jsx.test.ts` — add the regression test.

**Out of scope** (do NOT touch):
- The `renderChunk` (rolldown) branch logic — it is already correct; only the
  `trailingComma === false` branch's removal strategy changes.
- `get-build-options.ts` and the plugin's wiring — the public API is unchanged.
- Any snapshot file — assert with explicit `expect(...).toBe(...)` / `includes`,
  not snapshots (the existing jsx tests do not snapshot).

## Git workflow

- Branch: `advisor/003-jsx-remove-attributes-first-prop`
- Commit per logical unit (fix, then test) or one combined commit. Conventional
  commits, e.g.: `fix(packem-rollup): handle first-position attribute in jsx-remove-attributes`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make the rollup `transform` path remove the property safely

Replace the `else` branch (the `magicString.overwrite(start - 2, end, "")`
line) so it no longer assumes a leading `, `. Use a position-independent
removal: remove the property, consume a following whitespace+comma if present;
if the property was the **last** one (no following comma), instead consume the
**preceding** whitespace+comma so no dangling `, ` is left.

Target shape for the `else` branch:

```typescript
} else {
    // Position-independent removal: a leading `, ` only exists when the
    // property is NOT first. Scan forward for the property's own trailing
    // comma; if there is none (the property is last), scan backward to
    // consume the preceding comma instead, so we never leave a dangling
    // separator or delete the object's opening `{`.
    let removeEnd = end;

    while (removeEnd < code.length && WHITESPACE_RE.test(code[removeEnd] as string)) {
        removeEnd += 1;
    }

    if (code[removeEnd] === ",") {
        removeEnd += 1;
        magicString.remove(start, removeEnd);
    } else {
        // No trailing comma → property is last; consume the preceding comma.
        let removeStart = start;

        while (removeStart > 0 && WHITESPACE_RE.test(code[removeStart - 1] as string)) {
            removeStart -= 1;
        }

        if (code[removeStart - 1] === ",") {
            removeStart -= 1;
        }

        magicString.remove(removeStart, end);
    }
}
```

Notes:
- Use `magicString.remove(a, b)` (not `overwrite(a, b, "")`) — `remove` is the
  idiomatic call already used in the `trailingComma` branch.
- Do NOT change the `trailingComma === true` branch.
- The existing tests strip a middle property (`className, data-testid, ...` or
  `data-testid` followed by more) — these hit the "trailing comma present"
  sub-branch and must still pass byte-for-byte against the current rollup
  assertions in `jsx.test.ts:270-275` and `:289-292`.

**Verify**:
```bash
pnpm run build:packages
cd packages/packem && pnpm run test:rollup -- __tests__/intigration/jsx.test.ts
```
→ all existing jsx tests pass (proves the fix didn't change the
already-covered middle/second-position behavior).

### Step 2: Add a regression test — strip a FIRST-position attribute

In `packages/packem/__tests__/intigration/jsx.test.ts`, add a new `it(...)`
modeled exactly on the existing `:210` "should delete a attribute…" test, but:
- The JSX source puts the stripped attribute **first**:
  ```tsx
  const Tr = () => (<tr data-testid="test" className={"keep-me"} />);

  export default Tr;
  ```
- Config strips `["data-testid"]` (the first attribute).
- Assertions (bundler-aware, matching the existing tests' structure):
  - `expect(binProcess.stderr).toBe("")`
  - `expect(binProcess.exitCode).toBe(0)`  ← this is the key regression guard:
    before the fix, the rollup build emits broken JS.
  - Read `dist/index.mjs`; assert `mjsContent.includes("data-testid")` is `false`.
  - Assert the kept attribute survives and the object is intact:
    `expect(mjsContent.includes("keep-me")).toBe(true)`.
  - Follow the `isRolldown` branching convention used by neighbors for any
    byte-exact assertion (only assert byte-exact output in the `else`/rollup
    branch; for rolldown assert presence/absence via `.includes`, as the
    sibling tests do).

Match the surrounding `expect.assertions(...)` style and the
`// eslint-disable-next-line` comments only where the neighbors use them (do not
add disables you do not need).

**Verify**:
```bash
cd packages/packem && pnpm run test:rollup -- __tests__/intigration/jsx.test.ts
```
→ the new test passes. To prove the test actually catches the bug, temporarily
revert Step 1 (`git stash` the plugin change), re-run — the new test must FAIL
(non-zero exit / broken output) — then restore the fix (`git stash pop`). Report
if it does NOT fail without the fix (means the test isn't exercising the bug).

### Step 3: Confirm no rolldown regression

```bash
cd packages/packem && pnpm run test:rolldown -- __tests__/intigration/jsx.test.ts
```
**Verify**: all jsx tests pass under rolldown too (the `renderChunk` path was
untouched, and the new first-position test should pass there as well).

## Test plan

- New test in `jsx.test.ts`: "should delete a first-position attribute…",
  modeled after the existing `:210` test. Cases covered: stripped attribute is
  the first property (the regression), kept attribute survives, build exits 0,
  attribute absent from output.
- Existing tests (`:210`, `:314`, etc.) continue to pass unchanged — they cover
  middle/second-position and multi-attribute removal.
- Run under BOTH bundlers (Steps 1–3).

## Done criteria

ALL must hold:

- [ ] The `else` (rollup `transform`) branch no longer uses `start - 2` / `overwrite`.
- [ ] `pnpm run build:packages` exits 0.
- [ ] `cd packages/packem && pnpm run test:rollup -- __tests__/intigration/jsx.test.ts` — all pass, including the new first-position test.
- [ ] `cd packages/packem && pnpm run test:rolldown -- __tests__/intigration/jsx.test.ts` — all pass.
- [ ] With Step 1 reverted, the new test FAILS (proves it guards the bug).
- [ ] `cd packages/packem-rollup && pnpm run lint:eslint` exits 0.
- [ ] Only the two in-scope files are modified (`git status`); no snapshot files changed.
- [ ] `plans/README.md` status row for 003 updated.

## STOP conditions

Stop and report back (do not improvise) if:
- The existing `:210`/`:314` jsx tests fail after Step 1 (the new removal
  changed already-covered output — the byte assertions are the contract; do not
  edit those assertions to make them pass).
- The new first-position test passes even with Step 1 reverted (the test isn't
  reaching the bug — the transformer output shape may differ from the assumed
  `{ "data-testid": "x", … }`; report the actual `dist/index.mjs` content).
- The transformer emits an unexpected object shape (e.g. no space after `{`,
  or props quoted differently) that the forward/backward scan doesn't handle —
  report the observed output rather than special-casing.

## Maintenance notes

- The rollup `transform` path and the rolldown `renderChunk` path now share the
  same "scan for the property's own separator" strategy. If you later unify them
  into one helper, preserve the first/last-position handling proven by the new test.
- A reviewer should check that the byte-exact rollup assertions in the existing
  tests are unchanged (they are the behavioral contract for middle-position removal).
- Deferred: classic-runtime (`React.createElement`) JSX is still out of scope by
  design (see the plugin's header comment); this plan does not change that.
