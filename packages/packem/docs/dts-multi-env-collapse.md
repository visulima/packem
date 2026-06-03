# Fixed: multi-environment DTS collapse (default-env `index.d.ts` dropped)

> **RESOLVED.** Root cause was a shared DTS rollup-cache slot across sibling
> builds; the fix isolates the cache per entry-set in
> `src/bundler/build-types.ts`. Kept as a record of the root-cause analysis.

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

packem emitted the 4 JS files correctly but **dropped the shared `index.d.ts`**
(while writing per-variant `index.development.d.ts` / `index.server.d.ts`),
tripping the validator: `Potential missing or wrong package.json files:
dist/index.d.ts (did you mean "dist/index.js"?)` → `failOnWarn` failed the build.

## Root cause

Entries are grouped by `(environment, runtime, type)` (see `prepareRollupConfig`
in `src/packem/build.ts`), so the example produces four build groups — `index`
(default), `index.development`, `index.browser` (all **browser** runtime) and
`index.server` (node). Each group runs its own `@visulima/rollup-plugin-dts`
build, concurrently (`DEFAULT_DTS_CONCURRENCY = 2`).

The DTS rollup cache was fetched/stored with `fileCache.get(DTS_CACHE_KEY,
subDirectory)` where `subDirectory` is derived from `(environment, runtime)`
only. The three **browser** groups therefore shared **one** cache slot. Because
`rollup-plugin-dts` carries TypeScript program state in its rollup cache, the
concurrent browser builds read/wrote the same slot and clobbered each other —
the default entry's declaration collapsed and a sibling's chunk
(`index.development.d`) was written in place of the real `index.d.ts`.

(The earlier `entriesKey` work in `getRollupDtsOptions` only isolated the *plugin
instance* memoization, not this `fileCache` slot.)

## Fix

`src/bundler/build-types.ts`: key the DTS cache on `subDirectory` **plus a hash of
the build's entry names**, so each DTS build gets its own cache slot and the
concurrent sibling builds can't contaminate one another. Emission semantics are
unchanged — per-variant declarations are still produced, so the dev/prod-condition
behavior asserted by `package-json-exports.test.ts` ("emit base declarations for
the default entry alongside dev/prod conditions") is preserved.

Guard tests: the `examples/solid-babel` build, and
`package-json-exports.test.ts > "should emit the shared declaration when several
runtime conditions point types at one file"`.
