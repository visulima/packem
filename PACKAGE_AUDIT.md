# Packem Monorepo — Package Audit

**Date:** 2026-06-11 · **Branch:** `alpha` · **Method:** 8 parallel read-only audits (one per package) covering security, DX, performance, code quality, and feature gaps. Every code claim cites `file:line` at the audit-time HEAD.

Packages audited: `packem`, `packem-rollup`, `packem-rolldown`, `packem-plugins`, `packem-share`, `rollup-plugin-dts`, `rollup-plugin-css`, `css-style-inject`.

---

## Executive summary

No high-severity exploitable vulnerabilities were found. The most impactful issues:

1. **Broken for users right now (verified):**
   - The attw validator is broken for npm and yarn — `npm pack --json` returns an array, the parser expects an object, so it always throws "Invalid npm pack output format". Only pnpm works. Zero tests. (`packem/src/validator/attw.ts:328-343`)
   - `rollup-plugin-dts` crashes with cryptic rollup parse errors on `import A = NS.Inner` and `export = NS.thing` (verified empirically). (`rollup-plugin-dts/src/fake-js.ts:1663-1696`)
   - `mode: "inline"` is silently ignored by the PostCSS loader in `rollup-plugin-css` — `inline` is never passed to `generateJsExports`. (`rollup-plugin-css/src/loaders/postcss/index.ts:222-236`)
   - `packem-rollup`'s README documents plugins that live in a different package; every README import example fails. Its published `dist/index.d.ts` imports types from devDependencies, breaking strict consumers.
   - CLI flags lose to config-file values (defu precedence inverted); `--no-cache` is a complete no-op; `packem build --help` shows a placeholder description "Demonstrate options required".
2. **Silent cache destruction:** alternating `--development`/`--production` builds delete each other's FileCache every run because the keystore is recreated, not updated (`packem/src/packem/index.ts:913` missing the `shouldUpdate` arg).
3. **Watch-mode stale state:** `preserve-directives` never resets its per-module directive/shebang records — a removed `"use client"` keeps being emitted until watcher restart (`packem-rollup/src/plugins/preserve-directives.ts:168-169, 196-203`). `rollup-plugin-dts` leaks declaration ASTs across watch rebuilds.
4. **Top security items (all medium/low):** SEA Node binaries downloaded without checksum verification; CSP nonce set as a readable DOM attribute in `css-style-inject`; `url()`/`@import` can read and embed arbitrary files (e.g. `~/.npmrc`) into build output with no warning; `FileCache.getFilePath` has a latent path traversal.

---

## Security findings (cross-package)

| Sev | Package | Finding | Location |
|---|---|---|---|
| MED | packem | SEA builds download Node binaries from nodejs.org with **no SHASUMS256 verification**; corrupted/MITM'd binary is embedded into user-shipped executables and cached forever | `src/exe/download.ts:71-82` |
| MED | rollup-plugin-css | `url()`/`@import` resolve absolute and `../` paths and read/embed any file (secrets exfiltration into published bundles via malicious dependency CSS); no root confinement, no warning | `src/loaders/postcss/url/url-resolve.ts:20-41`, `import/import-resolve.ts:15-21` |
| MED | css-style-inject | Nonce set via `setAttribute("nonce", …)` reflects into a DOM-readable attribute → CSS-exfiltration of the CSP nonce; should use the IDL property `styleTag.nonce` | `src/index.ts:159` |
| MED | packem-share | `FileCache.getFilePath` joins unsanitized key names — `..` segments escape the cache dir; writes are silent (`overwrite: true`, errors swallowed). Latent: current callers hash keys | `src/utils/file-cache.ts:278-291` |
| LOW | packem-rollup | Unescaped directive text re-emitted into chunks — a loosened user `directiveRegex` lets a dependency inject statements via a crafted directive prologue; fix with quote escaping | `src/plugins/preserve-directives.ts:236` |
| LOW | packem-rollup | optimize-deps interpolates filesystem paths into generated code inside single quotes — paths containing `'` break/splice code; use `JSON.stringify` | `src/plugins/esbuild/utils/optimize-deps.ts:104` |
| LOW | packem-plugins | url plugin emits `export default "${data}"` unescaped — asset filename containing `"` injects into the emitted module; use `JSON.stringify` | `src/plugins/url.ts:187` |
| LOW | packem-plugins | Babel worker script located by 6-level upward filesystem walk, then executed — a planted `<proj>/babel-runtime/.../worker.js` runs on build; anchor to packem's dist root | `src/plugins/babel/index.ts:79-107` |
| LOW | packem-share | `replaceContentWithinMarker`: marker unescaped into `new RegExp`, replacement passed as `$`-pattern — third-party license text containing `$'` corrupts the user's LICENSE file | `src/utils/replace-content-within-marker.ts:11,17` |
| LOW | rollup-plugin-css | Known super-linear sourcemap-comment regex (eslint-disabled) runs on every CSS file incl. node_modules — quadratic on crafted input | `src/utils/sourcemap.ts:8-10` |
| LOW | rollup-plugin-css | CSS-module class names unescaped in generated `.d.ts` written into the source tree | `src/utils/generate-js-exports.ts:136-139,303-308` |
| LOW | rollup-plugin-dts | Unbounded recursion on crafted `.d.ts` (deep qualified names) → stack-overflow DoS when `resolve` inlines node_modules types | `src/fake-js.ts:1395-1414,827-924` |
| LOW | css-style-inject | `attributes` map allows `on*` event-handler attributes on the style element | `src/index.ts:92` |
| LOW | packem | attw `pack` uses shell `exec` with unquoted temp path (breaks on Windows paths with spaces) | `src/validator/attw.ts:315` |
| LOW | packem | Shared, predictable download temp path → cross-process race corrupts the cached SEA Node binary | `src/exe/download.ts:78` |
| LOW | packem-share | `svgEncoder` strips literal `"//gs"` — corrupts any SVG URL with a host starting `gs` (e.g. gstatic.com) in emitted assets | `src/utils/svg-encoder.ts:13` |

Verified clean: no `eval`/`new Function` anywhere; CSS→JS injection in style generation fully mitigated via `JSON.stringify`; babel worker-pool protocol uses structured clone with a fixed method registry; chunk-scanning regexes in the rolldown ports are linear.

---

## Per-package highlights

### `@visulima/packem` (core CLI)

**Bugs / DX**
- attw validator broken for npm & yarn (always throws on parse); tarball path also resolved against cwd instead of the pack destination; temp dir leaked on two early exits; zero tests. `src/validator/attw.ts:328-343,432-485`
- CLI < config precedence: `customDefu(buildConfig, …, cliOptions)` makes every CLI flag a mere default — `--bundler`, `--minify`, `--sourcemap` silently ignored when the config sets them. The hand-rolled `--no-validation` patch is a symptom. `src/cli/commands/build.ts:205`
- Broken/missing config silently ignored: jiti `try: true` swallows config syntax errors AND a typo'd `--config path`; build proceeds with defaults. `src/config/utils/load-packem-config.ts:18-27`, `find-packem-file.ts:15-32`
- `--no-cache` declared but unwired (no-op). `src/cli/commands/build.ts:406-410`
- `--env.KEY=value` truncates values containing `=`. `build.ts:339`
- `--runtime` help says "nodejs" but only "node" is accepted. `build.ts:445-453`
- Stale "will change in packem v2" warning on every run — package is already 2.0.0-alpha. `src/packem/index.ts:553-557`
- Watch mode "restarts on config change" but rebuilds with **stale** options (config never reloaded). `src/rollup/watch.ts:360-411`
- `packem add --dir <other>` reads/writes the **cwd's** packem.config (relative path returned by `findPackemFile`). `src/cli/commands/add.ts:526,576`
- String presets loaded without `{ default: true }` — `export default definePreset(...)` presets are silently inert. `src/config/utils/load-preset.ts:53`
- `.env` loading with default `PACKEM_` prefix silently loads 0 vars; missing explicit env file silently ignored. `src/config/utils/load-env-file.ts:61-66`

**Performance**
- Keystore recreated every build → dev/prod FileCache thrash (missing `shouldUpdate`). `src/packem/index.ts:913`
- Brotli quality-11 + gzip computed for **every** dist file on every build, no opt-out (Vite has `reportCompressedSize: false`). `src/packem/build.ts:866-911`
- `browserslist()` resolved unconditionally even for node-runtime builds. `src/packem/index.ts:135`
- O(n·m) `buildEntries.find` per walked file in size collection. `src/packem/build.ts:872`

**Quality**
- The structural `Logger` workaround for `@visulima/pail` types is copy-pasted ~10× — belongs in packem-share.
- Dead `v8-compile-cache` fallback referencing an undeclared dependency. `src/cli/index.ts:19-30`
- Unescaped `sourceDir`/`outDir` interpolated into `new RegExp`. `src/config/utils/prepare-entries.ts:70`, `src/validator/validate-bundle-size.ts:81`
- Cache key drops functional config (hooks don't invalidate). `src/packem/index.ts:892-910`
- `src/packem/index.ts` is 1,145 lines — extract the ~580-line defaults object.

### `@visulima/packem-rollup`

- **README documents plugins from another package** (dataUriPlugin, urlPlugin, lazy-barrel — all in packem-plugins); the plugins it actually ships are undocumented.
- **`dist/index.d.ts` imports types from devDependencies** (`@babel/core`, `oxc-transform`, `@swc/types`) — broken types for strict consumers; meanwhile `clean-css`, `html-minifier-next`, `oxc-resolver`, `@visulima/package` are runtime deps never imported.
- `cjs-interop` regex rewrites are context-blind: corrupts `exports.default =` inside string literals, double-evaluates non-identifier RHS in `addDefaultProperty`, exact-string `__esModule` strip breaks on rollup format changes. Should be an AST pass (this.parse is available in renderChunk). `src/plugins/cjs-interop.ts:4,42,53-78`
- `preserve-directives` watch-mode stale state: closure records never reset → deleted directives/shebangs keep being re-emitted; unbounded growth in long sessions. `src/plugins/preserve-directives.ts:168-169,347-353`
- `jsx-remove-attributes` renderChunk parses every chunk unconditionally — add a `code.includes()` pre-check (the pure plugin already does this); transform mode always generates hires sourcemaps regardless of build setting. `src/plugins/jsx-remove-attributes.ts:164-181,224`
- `SwcPluginConfig` uses `Exclude<>` where `Omit<>` was meant — claimed-excluded keys are accepted and silently clobbered. `src/plugins/swc/types.ts:4`
- esbuild plugin's `include` dead for non-default extensions (native hook filter excludes them before the JS check); `options.context` misused as a cwd. `src/plugins/esbuild/esbuild-plugin.ts:74-110`
- optimizeDeps: sync `readFileSync` in async onLoad; no cross-run cache (re-bundles all deps on every cold build).
- swc/sucrase plugins lack rollup ≥4.38 native `transform.filter` (esbuild adapter shows the pattern).
- `browserslist-to-esbuild` silently drops mobile browsers (`and_chr`, `samsung`, …). `src/plugins/browserslist-to-esbuild.ts` (mapping at `src/plugins/esbuild/browserslist-to-esbuild.ts:6-9`)

### `@visulima/rollup-plugin-dts`

- **Two verified crashes** with cryptic rollup parse errors: local `import A = NS.Inner` (no rewrite, no warning) and `export = <non-identifier>`. `src/fake-js.ts:1663-1696`
- tsgo failures masked: exit code never checked; user gets a misleading "check your tsconfig" later. `src/tsgo.ts:14-17`
- Only the first oxc isolated-declarations error reported (10 violations = 10 build cycles). `src/generate.ts:254-261`
- Silent externalization when a package explicitly on the `resolve` list can't be found — no signal at all. `src/resolver.ts:68-70,84-86`
- Error messages still point to the upstream sxzz repo post-fork. `src/tsc/emit-build.ts:274`
- `import("pkg")` resolution cache scoped per-declaration instead of per-module — 50 declarations = 50 `context.resolve` calls. `src/fake-js.ts:818`
- Watch-mode memory growth: `declarationMap`/`moduleExportsMap` never pruned, full Babel ASTs stay reachable forever. `src/fake-js.ts:92-94`
- Fragile name-based helper detection: a user type named `foo_exports` or `__export` is silently mis-rewritten. `src/fake-js.ts:1418-1423,1566`
- `fake-js.ts` is 1,743 lines with file-wide eslint-disable of ~25 rules including correctness rules.
- `build` script swallows failures with `|| exit 0`. `package.json:55-56`
- `/// <reference path>` directives re-attached without rebasing → silently wrong paths in emitted chunks.

### `@visulima/rollup-plugin-css`

- **`mode: "inline"` silently ignored** by the postcss loader (`inline` never passed; lightningcss loader does pass it) — inline mode unreachable in the default stack. `src/loaders/postcss/index.ts:222-236`
- Broken `.d.ts` for plain CSS with `dts: true` and no `namedExports` (`export default css` references an undeclared identifier). `src/utils/generate-js-exports.ts:146,420-423`
- Sass uses one-shot sync `compileString` per file — the slowest sass-embedded mode; a shared `AsyncCompiler` is the documented fast path. No content cache for any preprocessor across watch rebuilds. `src/loaders/sass/utils/get-sass-compiler.ts`
- Less always generates source maps regardless of the sourcemap setting. `src/loaders/less/index.ts:64`
- LightningCSS loader silently drops cross-file `composes` (runtime class strings missing names, no warning). `src/loaders/lightningcss.ts:43-47`
- Resolver errors swallowed (`catch { /* noop */ }`), diagnostics via bare `console.debug` bypassing the plugin logger. `src/loaders/postcss/url/index.ts:134-139`, `src/utils/resolve.ts:47-73`
- css-modules-types writes a `.d.ts` then `addWatchFile`s the file it just wrote — watch-loop hazard. `src/css-modules-types.ts:109,117`
- `let assetDirectory = "assert"` typo that only coincidentally works. `src/css-plugin.ts:448`
- `UV_THREADPOOL_SIZE=1` → PQueue concurrency 0 → cryptic crash. `src/loaders/loader-manager.ts:21,146`
- No `dir-dependency` PostCSS message handling (Tailwind/vanilla-extract watch). `src/loaders/postcss/index.ts:168-196`
- Per-class hashing of the entire stylesheet; quadratic `moved.includes` in generateBundle; module-level `/g` regexes with `.exec` (latent lastIndex bug in the public `getMap`).
- `peerDependenciesMeta` lists packages that aren't peers at all (copy-paste cruft). `package.json:201-277`
- Test gaps: no direct tests for Sass/Less/postcss-pipeline/lightningcss loaders, the @import parser fork, or `css-plugin.ts` extract logic.

### `@visulima/packem-plugins`

- Babel parallel→inline fallback is silent and **discards the ready-made diagnostic** (`findNonSerializableOption` returns the offending key; it's thrown away). One warn would make it observable. `src/plugins/babel/index.ts:172-183`
- Worker protocol re-clones the full babel options object per file — send once per worker instead. `src/plugins/babel/index.ts:220`
- cache-plugin still writes negative-result entries for `transform`/`resolveId` (the `load` hook learned not to — same fix applies). `src/plugins/cache-plugin.ts:154-243`
- minify-html-literals TS-parses every module (no default include, full TS compiler); a `code.includes("html\`")` pre-check would skip most. `src/plugins/minify-html-literals/index.ts:60`
- source-maps plugin reads every file twice; oxc-resolve runs the native resolver on `\0` virtual ids (no filter). `src/plugins/source-maps.ts:27,49`, `src/plugins/oxc/oxc-resolve-plugin.ts:30-35`
- require-cjs-transformer returns a sourcemap that only maps the dedup pass, discarding the actual import-rewrite mappings. `src/plugins/require-cjs-transformer.ts:331-333`
- externals plugin interpolates package names into RegExp unescaped — `lodash.merge` pattern matches `lodashxmerge`. `src/plugins/externals.ts:202,210`
- Runtime imports of devDependencies (`mime`, `estree-walker`) — only works because the package is inlined; publishConfig says it intends to publish.
- `copy` plugin JSDoc defaults contradict the code for both `copyOnce` and `flatten`. `src/plugins/copy.ts:22-42`
- data-uri JSDoc documents `?data-uri and encoding=css` syntax that URLSearchParams cannot parse. `src/plugins/data-uri.ts:20-48`
- Module-level state leaks across builds: `calledImplicitExternals`, `calledDtsFiles`, `packageJsonCache` (never invalidated in watch).
- debarrel applies disk-file offsets to in-pipeline (possibly already-transformed) code — earlier offset-shifting plugins silently corrupt output. `src/plugins/debarrel.ts:408-414,572`
- cpus() can be `[]` in containers → 0 workers; `parallel: 0` treated as a count. `src/plugins/babel/index.ts:186`
- Untested: externals (538 lines, most behavior-dense plugin), cache-plugin, copy, url, shebang, license, metafile, source-maps, import-attributes, both oxc plugins, all resolve-* plugins; babel worker-pool happy path.
- Vendored minify-html-literals drags full `typescript` into dependencies just for template parsing — port to the already-present oxc-parser.

### `@visulima/packem-rolldown`

The package is an empty scaffold (`src/index.ts` exports `{}`); the actual rolldown ports live in packem-rollup and packem core. Findings on those ports:

- `pure.functions` RegExp entries and dotted `constructors` silently dropped under rolldown — same config key, weaker behavior, no warning. `packem-rollup/src/plugins/pure-new-expression-plugin.ts:72-76`
- Parse failures: jsx plugin warns; pure plugin swallows silently — inconsistent. `pure-new-expression-plugin.ts:103-107`
- "Rolldown is not installed" message can be a lie — `tryImport` swallows native-binding/ABI load errors too. `packem/src/rolldown/get-rolldown.ts:23-27`
- Rollup-shaped watch options (`chokidar`, `buildDelay`, `clearScreen`) silently ignored under rolldown; tsconfig is not watched despite a comment claiming it is. `packem/src/rollup/watch.ts:204-228,355-411`
- Watch restart race: 100ms debounce but no in-flight guard → concurrent restarts can orphan watchers building with stale config. `watch.ts:385-394`
- Behavioral divergence: under rolldown, jsx-remove-attributes/pure operate on whole chunks (incl. vendored code) where the rollup path scopes to `.jsx/.tsx` modules — a source of rollup-vs-rolldown snapshot drift.
- Zero unit tests for either plugin's `renderChunk` mode (the jsxDEV trailing-comma and first-position-attribute bug classes are covered only by advisory integration CI).
- `lint:eslint:fix` script has a trailing `--fix,` typo (also present in rollup-plugin-dts).

### `@visulima/packem-share`

- README API reference is substantially wrong: 6+ documented signatures don't match the code; the "Module-based Imports" example is impossible; widely-used real exports undocumented.
- `warn()` never logs — it only records into `context.warnings`; misleading name with 49 consumer files.
- `FileCache`: `has()`+`get()` pattern recomputes `getFilePath` twice per probe on the hottest path; sync disk reads inside async hooks serialize the event loop; cwd stripping is substring-based (`replaceAll`) → potential cache-key collisions. `src/utils/file-cache.ts:126-186,282-290`
- Dead exports: `arrayIncludes` (zero consumers), `getRegexMatches` (test-only), `CHUNKS_PACKEM_FOLDER`/`SHARED_PACKEM_FOLDER`.
- Stale divergent duplicate `packem/src/utils/import-specifier.ts` with zero importers — delete it.
- `memoize` allocates on its fast path and has a cache-key collision for function args.
- Public types reference devDeps (`esbuild`, `hookable`, `jiti`, `@visulima/pail`, `@visulima/tsconfig`) not declared for consumers.
- Untested: import-specifier, get-entry-file-names (platform-dependent Windows branch is wrong), replace-content-within-marker, sort-user-plugins, enhance-rollup-error, get-cache-hash.

### `@visulima/css-style-inject`

- Solid baseline: textNode-based injection (no innerHTML XSS), SSR-safe, benchmarked hot path.
- Returns `void` — no handle, so no removal/update (HMR, theme switching) without DOM queries. `src/index.ts:39`
- `container` is string-selector-only — Shadow DOM consumers can't use the package. `src/index.ts:32`
- Module-level `containers`/`styleTags` arrays leak removed DOM elements forever; O(n) `indexOf` per singleTag call — use a WeakMap. `src/index.ts:12-14,138`
- Dead IE `styleSheet.cssText` branch shipped to every browser in an ESM-only package (plus 3 tests covering it). `src/index.ts:162-168`
- Tests run against a hand-rolled document mock — the real `document.head` fast path is never asserted; `insertAdjacentElement` mock references nothing.
- SSR global store is append-only (id-less entries grow unboundedly on long-running servers; README pattern leaks CSS across responses).
- README SSR example produces broken CSS (React escapes `>` in raw-text elements); README claims Node 20 support, engines require 22+.

---

## Feature roadmap (what users would want)

### Core bundler (`packem`) — vs tsup / unbuild / bunchee / tsdown
1. **Positional entries + `--format` + `--out-dir` on the CLI** — `packem build src/index.ts --format esm,cjs -d dist` is the muscle memory users bring from tsup/tsdown; today only config/package.json inference exists.
2. **`--silent` / `--log-level`** — there is currently no way to quiet the banners, ESM/CJS notices, and size tables; CI and turbo monorepos want one-line output.
3. **Config-key validation with did-you-mean** — defu accepts any shape, so `minifiy: true` is silently ignored; `fastest-levenshtein` and `find-alternatives.ts` are already shipped.
4. **`exports`-map generation, not just validation** — an opt-in `--fix`/`writeToPackageJson` that emits correct `exports`/`main`/`types` from resolved entries (the typesVersions writer already exists) would leapfrog bunchee's main selling point.
5. **Interactive watch mode** — keypress handling (`r` rebuild, `q` quit, `c` clear) plus actually reloading `packem.config.ts` on change.
6. **Checksum-verified, streaming, progress-reporting SEA downloads** (currently a silent in-memory `fetch` of ~50 MB).
7. **`reportCompressedSize: false` analog** to skip brotli/gzip size computation.

### CSS pipeline (`rollup-plugin-css`) — vs Vite / rollup-plugin-styles
8. **Per-import query modifiers**: `?inline`, `?url`, `?raw` to override the global `mode` per file (Vite parity; packem already handles `?raw` elsewhere).
9. **Shared async Sass compiler + content-hash preprocessor cache** — biggest watch-mode perf win for Sass-heavy projects.
10. **CSS code-splitting controls** — `cssChunking`/manual chunk grouping and deterministic cross-chunk cascade ordering.
11. **Cross-file `composes` in the LightningCSS loader** — would make lightningcss a full postcss-modules replacement.
12. **`dir-dependency` message support + glob watching** — required for first-class Tailwind-PostCSS and vanilla-extract workflows.
13. **Asset confinement option** (`urlOptions.rootDir`) that warns/errors when `url()`/`@import` resolves outside the project — closes the exfiltration vector.
14. **Safe minification preset** — guard cssnano against `@container`/`@layer` breakage (lightningcss path already forwards targets).

### DTS (`rollup-plugin-dts`) — vs api-extractor / dts-bundle-generator
15. **Post-build self-verification** (`verify: true` runs a TS program over emitted chunks) — would catch the silent-corruption classes found in this audit.
16. **Release-tag trimming** (`@internal`/`@alpha`/`@beta`) for the tsc/tsgo backends; oxc `stripInternal` is already wired.
17. **Negation patterns in `resolve`** (`resolve: [/.*/, '!huge-pkg']`) — common dts-bundle-generator workflow.
18. **Declaration bundle-size attribution** — per-package inlined byte counts ("why is my .d.ts 2 MB"); no competitor does this well.
19. **`export as namespace` preservation** (UMD global types) — currently stripped unconditionally.
20. **Reference-directive policy option** (`preserve | rebase | strip`).

### Rolldown backend (`packem-rolldown`) — exploit native capabilities
21. **Fused single-pass renderChunk plugin** (one parse → pure annotations + jsx attribute strip + directive prepend) — both a perf fix and the first real resident of the empty package.
22. **Native `dynamicImportVarsPlugin`** wiring (rolldown ships a Rust builtin).
23. **Native `isolatedDeclarationPlugin` DTS fast-path** — removes the dual-watcher setup for isolatedDeclarations projects.
24. **Directive-layer chunk splitting via `output.advancedChunks`** — the natural substrate for the currently-blocked bundled `"use client"`/`"use server"` split.
25. **Native `bundleAnalyzerPlugin`** as the rolldown visualizer replacement.

### Plugins (`packem-plugins`)
26. **Reusable parallel-transform helper** — generalize the babel workerpool pattern (`createParallelTransform(workerPath, options)`); minify-html-literals is the obvious second client.
27. **esbuild-compatible metafile schema** — inputs/outputs with byte sizes so output drops into existing analyzers (bundle-buddy, esbuild analyzer).
28. **Asset query matrix completion**: `?url` (force-copy), `?inline` (force-data-uri), `import … with { type: "json" }`.
29. **Copy plugin `transform`/`rename`** — the type already reserves `transform`; matches rollup-plugin-copy.
30. **debarrel build-end report** ("rewrote N imports across M barrels; hot barrels: …").
31. **Configurable shebang chmod + `failOnMissingShebang`** validation for declared `bin` entries.

### Browser runtime (`css-style-inject`)
32. **Return a handle**: `{ element, remove(), update(css) }` — unblocks HMR, theme switching, micro-frontend teardown.
33. **Constructable stylesheets mode** — eliminates tag churn, is CSP-nonce-exempt, and enables shadow-root sheet sharing.
34. **`Element | ShadowRoot` container targets** — web-component consumers currently can't use the package.
35. **Auto-nonce discovery** (`document.currentScript?.nonce` / `<meta property="csp-nonce">` — the style-loader convention).
36. **SSR store ergonomics**: `flushSSRStyles()` (drains the global, fixing the leak) + `renderSSRStyles()` (pre-escaped markup).

### Shared (`packem-share`)
37. Centralize: `getPackageNameFromPath`, exported `tryParseJson`, `getShortHash`, an "array-or-empty" arrayify variant, the structural `Logger` interface (currently copy-pasted ~10× in packem), and finish the import-specifier migration.

---

## Suggested priority order

**P0 — broken functionality (small fixes, big impact)**
1. attw pack-output parsing for npm/yarn + tarball path + a test (`packem/src/validator/attw.ts`)
2. FileCache keystore `shouldUpdate` (dev/prod cache thrash, `packem/src/packem/index.ts:913`)
3. `mode: "inline"` pass-through in the postcss loader (`rollup-plugin-css`)
4. dts crashes on `import A = NS.Inner` / `export = NS.x` → rewrite or actionable error (`rollup-plugin-dts`)
5. preserve-directives watch-mode stale state reset (`packem-rollup`)
6. `--config` existence check + stop swallowing config errors; wire or remove `--no-cache`; fix help placeholder, `--env` splitting, `--runtime` help (`packem`)
7. packem-rollup README/exports mismatch + devDep types in `dist/index.d.ts`

**P1 — security hardening**
8. SHASUMS verification for SEA Node downloads
9. `styleTag.nonce` IDL property instead of setAttribute
10. `JSON.stringify` the three generated-code interpolation sites (url plugin, optimize-deps, directives)
11. FileCache path-confinement assertion + prefix-based cwd strip
12. `url()`/`@import` outside-project warning (or `rootDir` confinement option)
13. replaceContentWithinMarker escaping (marker + replacer function)

**P2 — performance**
14. Cheap `code.includes()` pre-checks before chunk parses (jsx-remove-attributes; fused rolldown pass)
15. Shared sass-embedded AsyncCompiler + preprocessor caching
16. Stop caching negative transform/resolveId results in cache-plugin; send babel options once per worker
17. Lazy/opt-out compressed-size reporting; lazy browserslist
18. dts per-module resolve cache + watch-mode map pruning

**P3 — quality/maintenance**
19. AST-based cjs-interop rewrite
20. Test the untested: externals plugin, attw, renderChunk modes, CSS loaders, import-specifier
21. Delete dead code: stale import-specifier copy, v8-compile-cache fallback, IE branch in css-style-inject, dead share exports, stale snapshots/todo.md
22. Fix the `"assert"` typo, `Exclude→Omit`, `--fix,` script typos, copy-plugin JSDoc defaults, upstream-repo error URLs in rollup-plugin-dts
23. Decompose `fake-js.ts` (1,743 lines) and `packem/index.ts` (1,145 lines)
