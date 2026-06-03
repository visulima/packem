# Bug: multi-environment DTS collapse (default-env `index.d.ts` dropped)

> Tracking note for `fix/solid-babel-dts-multi-env-collapse`. Pre-existing bug,
> independent of the oxc-resolver migration. Documented here so the
> investigation isn't lost.

## Symptom

For a package whose `exports` map points **every runtime condition's `types` at one
shared declaration file** but uses **different JS files per condition**, e.g.
(`examples/solid-babel/package.json`):

```jsonc
{
  "exports": {
    "types": "./dist/index.d.ts",
    "workerd": { "types": "./dist/index.d.ts", "import": "./dist/index.server.js" },
    "browser": {
      "types": "./dist/index.d.ts",
      "development": { "types": "./dist/index.d.ts", "import": "./dist/index.development.js" },
      "import": "./dist/index.browser.js"
    },
    "node": { "types": "./dist/index.d.ts", "import": "./dist/index.server.js" },
    "import": "./dist/index.js"
  }
}
```

packem emits the 4 JS files correctly (`index.js`, `index.browser.js`,
`index.development.js`, `index.server.js`) but the **wrong set of `.d.ts`**:

- ✗ `index.d.ts` (the file ALL `types` conditions reference) is **not emitted**
- ✗ `index.browser.d.ts` not emitted
- ✓ `index.development.d.ts` emitted (unreferenced by `exports`)
- ✓ `index.server.d.ts` emitted (unreferenced by `exports`)

This trips the package.json validator: `Potential missing or wrong package.json
files: dist/index.d.ts (did you mean "dist/index.js"?)` → `failOnWarn` fails the
build. Reproduce: `nx run examples_packem_solid_babel:build`.

## What's NOT the cause

- Entry inference is **correct**: only the canonical `index` entry gets
  `declaration` set; the runtime-variant entries (`index.server`/`development`/
  `browser`) carry no declaration. (Verified via `inferEntries`.)
- It is **not** the resolver — reproduces identically on baseline (node-resolve).

## Root cause (where to look)

The DTS build is driven by `buildInputMap` (`src/rollup/get-rollup-options.ts`),
shared with the JS build via `baseRollupOptions(context, type)`. It includes **all
named entries**. But two things interact badly for the multi-environment case:

1. `prepare-entries.ts:~82` applies the **global `declaration` fallback** to every
   entry with `declaration === undefined` — so the runtime-variant entries (which
   inference left undeclared) get `declaration` turned on, and their variant names
   (`index.server`, …) become DTS chunk names → `index.server.d.ts` etc.
2. The build runs **per-environment passes** (default/development/production). The
   default-environment declaration **collapses to an empty facade / is dropped**
   when environment siblings share a runtime — this is the hazard already noted in
   the `getRollupDtsOptions` comment (`get-rollup-options.ts`, the `entriesKey`
   cache-key block). The `entriesKey` fix mitigated some cases but not this one.

So the intended behavior — emit **one** `index.d.ts` (the single shared `types`
target), and **not** per-variant `.d.ts` — is defeated on both ends.

## A first attempt (reverted) and why

Tried: suppress the global-declaration fallback for runtime-variant entries that
share an input with an already-declared entry, + filter the DTS input map to
declared entries only. This removed the spurious `index.server.d.ts` but:

- did **not** restore `index.d.ts` (the default-env collapse — point 2 — is the
  dominant remaining issue), and
- **regressed** `package-json-exports.test.ts > "should emit base declarations for
  the default entry alongside dev/prod conditions"` (a case where dev/prod
  conditions DO have distinct declaration targets and must each emit).

Conclusion: the fix must distinguish "entry has its own explicit `types` export"
from "entry inherited the global `declaration` fallback", AND fix the
per-environment DTS emission so the default-env `index.d.ts` isn't dropped. Both
need to land together, with `package-json-exports.test.ts` (dev/prod-condition
cases) and the solid-babel example as the guard tests, and a rollup **and**
rolldown snapshot pass.
