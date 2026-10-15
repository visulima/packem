# @visulima/rollup-plugin-dts

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

A Rollup plugin to generate and bundle TypeScript declaration (`.d.ts`) files.

## Install

Requires **`rollup@4.0.0`** or later.

```bash
npm i -D @visulima/rollup-plugin-dts

npm i -D typescript # install TypeScript if isolatedDeclarations is not enabled
npm i -D @typescript/native-preview # install TypeScript Go if tsgo is enabled
```

## Usage

Add the plugin to your `rollup.config.js`:

```js
// rollup.config.js
import { dts } from "@visulima/rollup-plugin-dts";

export default {
    input: "./src/index.ts",
    plugins: [dts()],
    output: [{ dir: "dist", format: "es" }],
};
```

### Output file names with shared chunks

Declaration entries are emitted as chunks by this plugin, so rollup does not reserve their names before it names the shared chunks. With a `chunkFileNames` template that has no `[hash]` (for example `"[name].js"`), a shared chunk could therefore take an entry's name — entries `index` and `index2` that both re-export a module rollup also names `index2` would turn the `index2` entry into `index22.d.ts`. The plugin avoids this: a shared chunk whose name equals an entry's name is written as `<name>-shared.d.ts` (`index2-shared.d.ts`), and the entry keeps its own file name. Templates with `[hash]` (the default) never collide and are left alone. In `dtsInput` mode the entries are real rollup entries and keep their names regardless of the template.

## Options

Configuration options for the plugin.

### General Options

#### `generator`

The generator used to produce `.d.ts` files.

- `'tsc'`: The TypeScript 5.x/6.x compiler. Supports all TypeScript features.
- `'oxc'`: [Oxc](https://oxc.rs)'s isolated declaration generator. Much faster than `tsc`, but only supports code that satisfies [`isolatedDeclarations`](https://www.typescriptlang.org/tsconfig/#isolatedDeclarations).
- `'tsgo'`: **[Experimental]** The [TypeScript Go](https://github.com/microsoft/typescript-go) compiler. May not support all TypeScript features yet.

When unset, the generator is inferred:

- `'tsc'` whenever `vue`, `tsMacro`, or a Volar-based entry in `customLanguages` is used (they require the TypeScript compiler API).
- `'tsgo'` if `tsgo` options are provided.
- `'oxc'` if `oxc` options are provided, or `isolatedDeclarations` is enabled in `compilerOptions`.
- `'tsgo'` if TypeScript 7.0 (or `@typescript/native-preview`) is installed.
- `'tsc'` otherwise.

**Default:** `'tsc'`

```ts
dts({ generator: "oxc" });
```

#### `logger`

Logger used for user-facing diagnostics, such as the experimental-feature warning and the compiler version banner. Useful for routing plugin output through your own reporter instead of the global `console`.

**Default:** `console`

```ts
dts({ logger: { error: myLogger.error, info: myLogger.info, warn: myLogger.warn } });
```

#### `cwd`

The directory in which the plugin will search for the `tsconfig.json` file.

#### `dtsInput`

Set to `true` if your entry files are `.d.ts` files instead of `.ts` files.

When enabled, the plugin will skip generating a `.d.ts` file for the entry point.

#### `emitDtsOnly`

If `true`, the plugin will emit only `.d.ts` files and remove all other output chunks.

This is especially useful when generating `.d.ts` files for the CommonJS format as part of a separate build step.

#### `tsconfig`

The path to the `tsconfig.json` file.

- If set to `false`, the plugin will ignore any `tsconfig.json` file.
- You can still specify `compilerOptions` directly in the options.

**Default:** `'tsconfig.json'`

#### `tsconfigRaw`

Pass a raw `tsconfig.json` object directly to the plugin.

See: [TypeScript tsconfig documentation](https://www.typescriptlang.org/tsconfig)

#### `compilerOptions`

Override the `compilerOptions` specified in `tsconfig.json`.

See: [TypeScript compilerOptions documentation](https://www.typescriptlang.org/tsconfig/#compilerOptions)

#### `sourcemap`

If `true`, the plugin will generate declaration maps (`.d.ts.map`) for `.d.ts` files.

#### `resolve`

Controls whether type definitions from `node_modules` are bundled into your final `.d.ts` file or kept as external `import` statements.

By default, dependencies are external, resulting in `import { Type } from 'some-package'`. When bundled, this `import` is removed, and the type definitions from `some-package` are copied directly into your file.

- `true`: Bundles all dependencies.
- `false`: (Default) Keeps all dependencies external.
- `(string | RegExp)[]`: Bundles only dependencies matching the provided strings or regular expressions (e.g. `['pkg-a', /^@scope\//]`).

> [!TIP]
> A workspace package that is published as TypeScript source (its `types` point at `.ts` files, or your `tsconfig` `paths` map it to its sources) is resolved like local code, so its whole type graph is inlined — which can be very large. To keep it as an `import`, mark it external in Rollup (`external: ['@scope/kernel']`).

#### `resolver`

Specifies a resolver to resolve type definitions, especially for `node_modules`.

- `'oxc'`: (Default) Uses Oxc's module resolution, which is faster and more efficient.
- `'tsc'`: Uses TypeScript's native module resolution, which may be more compatible with complex setups, but slower.

**Default:** `'oxc'`

#### `cjsDefault`

Determines how the default export is emitted.

If set to `true`, and you are only exporting a single item using `export default ...`,
the output will use `export = ...` instead of the standard ES module syntax.
This is useful for compatibility with CommonJS.

#### `sideEffects`

Indicates whether the generated `.d.ts` files have side effects.

- If `true`, Rollup will treat the `.d.ts` files as having side effects during tree-shaking.
- If `false`, Rollup may consider the `.d.ts` files as side-effect-free, potentially removing them if they are not imported.

> [!NOTE]
> Module augmentations are always kept, whatever this option is set to. A module that declares `declare global { … }` or `declare module "…" { … }` is marked as side-effectful, so an augmentation-only file imported for its side effect (`import "./augment"`) and a `declare module "./index.js"` block inside a re-exported module both stay in the bundle, even with the default `false`. A relative `declare module` is rewritten to the output chunk that holds its target. This option governs every other module.

**Default:** `false`

#### `check`

If `true`, type errors in your sources are reported while declarations are generated, and they fail the build. By default declarations are emitted without type-checking.

- `tsc`: the syntactic and semantic errors of each emitted file fail the build. With `build: true`, the syntactic and semantic errors of every project in the build fail it, including projects the solution builder skipped as up to date.
- `tsgo`: the compiler runs with type-checking enabled, and a non-zero exit fails the build with its diagnostics.
- `oxc`: has no effect, because isolated declarations are not type-checked. A warning is logged instead.

```ts
dts({ check: true });
```

**Default:** `false`

### `tsc` Options

> [!NOTE]
> These options are only applicable when `oxc` and `tsgo` are not enabled.

#### `banner`

Content to be added at the top of each generated `.d.ts` file.

#### `footer`

Content to be added at the bottom of each generated `.d.ts` file.

#### `build`

Build mode for the TypeScript compiler:

- If `true`, the plugin will use [`tsc -b`](https://www.typescriptlang.org/docs/handbook/project-references.html#build-mode-for-typescript) to build the project and all referenced projects before emitting `.d.ts` files.
- If `false`, the plugin will use [`tsc`](https://www.typescriptlang.org/docs/handbook/compiler-options.html) to emit `.d.ts` files without building referenced projects.

**Default:** `false`

#### `incremental`

Controls how project references and incremental builds are handled:

- If `incremental` is `true`, all built files (including [`.tsbuildinfo`](https://www.typescriptlang.org/tsconfig/#tsBuildInfoFile)) will be written to disk, similar to running `tsc -b` in your project.
- If `incremental` is `false`, built files are kept in memory, minimizing disk usage.

Enabling this option can speed up builds by caching previous results, which is helpful for large projects with multiple references.

**Default:** `true` if your `tsconfig` has [`incremental`](https://www.typescriptlang.org/tsconfig/#incremental) or [`tsBuildInfoFile`](https://www.typescriptlang.org/tsconfig/#tsBuildInfoFile) enabled.

#### `vue`

If `true`, the plugin will generate `.d.ts` files using `vue-tsc`.

Pass an object to override `vueCompilerOptions`. The overrides are merged over the `vueCompilerOptions` in the tsconfig, so a value set here wins over the same key in the tsconfig:

```ts
dts({ vue: { vueCompilerOptions: { fallthroughAttributes: true } } });
```

This is a shortcut for a preconfigured entry in [`customLanguages`](#customlanguages), so it requires the `tsc` generator.

#### `tsMacro`

If `true`, the plugin will generate `.d.ts` files using `@ts-macro/tsc`.

This is a shortcut for a preconfigured entry in [`customLanguages`](#customlanguages), so it requires the `tsc` generator.

#### `parallel`

If `true`, the plugin will launch a separate process for `tsc` or `vue-tsc`, enabling parallel processing of multiple projects.

#### `eager`

If `true`, the plugin will prepare all files listed in `tsconfig.json` for `tsc` or `vue-tsc`.

This is especially useful when you have a single `tsconfig.json` for multiple projects in a monorepo.

#### `newContext`

If `true`, the plugin will create a new isolated context for each build,
ensuring that previously generated `.d.ts` code and caches are not reused.

By default, the plugin may reuse internal caches or incremental build artifacts
to speed up repeated builds. Enabling this option forces a clean context,
guaranteeing that all type definitions are generated from scratch.

Builds in one process share a TypeScript program cache when their tsconfig file,
the config files that file extends, and their custom language set are the same.
A configuration the plugin cannot describe textually — one holding a function or
a class instance — is identified by the object it was given, so a repeated build
with the same object still shares. The caches keep a bounded number of programs
together and drop the least recently used one beyond that, so alternating among
more configurations only costs a rebuild.

The `invalidateContextFile` API can be used to clear invalidated files from the context:

```ts
import { globalContext, invalidateContextFile } from "@visulima/rollup-plugin-dts/tsc";
invalidateContextFile(globalContext, "src/foo.ts");
```

#### `emitJs`

If `true`, the plugin will emit `.d.ts` files for `.js` files as well.
This is useful when you want to generate type definitions for JavaScript files with JSDoc comments.

Enabled by default when `allowJs` in compilerOptions is `true`.

### Oxc

#### `oxc`

If `true`, the plugin will generate `.d.ts` files using [Oxc](https://oxc.rs/docs/guide/usage/transformer.html), which is significantly faster than the TypeScript compiler.

This option is automatically enabled when `isolatedDeclarations` in `compilerOptions` is set to `true`.

### TypeScript Go

> [!WARNING]
> With `typescript@7` installed this is the default generator and is stable. On the `@typescript/native-preview` build it is still experimental.

#### `tsgo`

Enables DTS generation using [`tsgo`](https://github.com/microsoft/typescript-go).

To use this option, ensure that `@typescript/native-preview` is installed as a dependency.

`tsconfigRaw` and `compilerOptions` options will be ignored when this option is enabled.

### Custom Languages

#### `customLanguages`

Registers non-standard source languages, such as Vue or Astro. Each entry describes one language:

- `extensionPatterns`: regular expressions that match the files of the language.
- `id`: optional. Builds in one process share a TypeScript program cache for the same language ids, so change the id when the language's behaviour changes. A language without an `id` is never shared.
- `toTsFilename(id)`: maps a source filename to the TypeScript filename used for declarations, for example `foo.custom` to `foo.custom.ts`.
- `tsFileExtensionInfos`: extra file extensions passed to the TypeScript compiler.
- `volarTypeScript` and `createVolarPlugins`: needed when the language is supported through [Volar](https://volarjs.dev). Both are required together.

```ts
import { dts } from "@visulima/rollup-plugin-dts";

dts({
    customLanguages: [
        {
            extensionPatterns: [/\.custom$/],
            tsFileExtensionInfos: [{ extension: "custom", isMixedContent: true, scriptKind: 7 /* ScriptKind.Deferred */ }],
            toTsFilename: (id) => id.replace(/\.custom$/, ".custom.ts"),
        },
    ],
});
```

`createVueLanguage` and `createTsMacroLanguage` build the entries behind the `vue` and `tsMacro` options. Use them to combine these languages with your own:

```ts
import { createVueLanguage, dts } from "@visulima/rollup-plugin-dts";

dts({ customLanguages: [createVueLanguage({ vueCompilerOptions: { fallthroughAttributes: true } })] });
```

Constraints:

- Volar-based languages require the `tsc` generator, and an explicit `generator` other than `'tsc'` is an error.
- Languages without Volar also work with the `oxc` generator.
- The `tsgo` generator does not support custom languages, and the `tsgo` option is rejected with them.
- Volar-based languages need the classic TypeScript compiler API, so they cannot be used with TypeScript 7.
- Custom languages run in the main process. `parallel` is ignored when `customLanguages` is set, and a warning is logged.
- The `build` option (`tsc -b`) does not apply custom languages.
- With `emitDtsOnly: false`, the JavaScript output of a custom file needs a transform, placed before this plugin, that turns the file into TypeScript.

## Triple-slash reference directives

A `/// <reference path="…" />` in a `.d.ts` input that points at a local global script (a file with only `interface`,
`type`, `enum` and `declare` declarations, no imports or exports) is inlined into the output and the directive is removed.
Inlined declarations are wrapped in `declare global { … }` when the output is a module. When several output chunks reference
the same script, it is inlined into one of them, and the other chunks get a `/// <reference path="…" />` to that chunk. The
copy goes to the first chunk in an import order — a chunk comes after the chunks it imports, and unrelated chunks are ordered
by file name — that every referencing chunk imports, so a shared chunk the others already load carries it, and the references
always point the way an import goes, so they never form a cycle. Consumers that load several entries therefore see one
declaration, so duplicate `type`, `const`, `class` or `enum` declarations do not conflict.

When no chunk is imported by all the chunks that reference the script — two entries with no shared chunk, for example — the
script is written to `_dts-scripts/<name>-<hash>.d.ts` under the output directory instead, and every referencing chunk points
at that file. No chunk then has to load the other declarations of a sibling entry.

Limits: scripts that contain imports or `import()` types, scripts that have a reference directive of their own, and
string-named `declare module` blocks are not inlined. Their directives are kept, with the path rebased to the output
location. Directives in `.ts` sources do not reach the emitted declarations, so nothing is inlined for them.
`/// <reference types="…" />`, `lib=` and `no-default-lib` directives are kept as they are.

## Differences from `rollup-plugin-dts`

### Isolated Declarations

The plugin leverages Oxc's `isolatedDeclarations` to generate `.d.ts` files when `isolatedDeclarations` is enabled,
offering significantly faster performance compared to the `typescript` compiler.

### Single Build for ESM

`@visulima/rollup-plugin-dts` generates separate chunks for `.d.ts` files, enabling both source code (`.js`)
and type definition files (`.d.ts`) to be produced in a single build process.

However, this functionality is limited to ESM output format. Consequently,
**two** distinct build processes are required for CommonJS source code (`.cjs`)
and its corresponding type definition files (`.d.cts`).
In such cases, the `emitDtsOnly` option can be particularly helpful.

## Credits

This project is a Rollup adaptation of [rolldown-plugin-dts](https://github.com/sxzz/rolldown-plugin-dts)
and is inspired by [rollup-plugin-dts](https://github.com/Swatinem/rollup-plugin-dts).
We extend our gratitude to the original creators for their contributions.
The test suite is authorized by them and distributed under the MIT license.

## License

[MIT](./LICENSE) License © 2025-present [Daniel Bannert](https://github.com/prisis)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/@visulima/rollup-plugin-dts.svg?style=flat-square
[npm-version-href]: https://npmjs.com/package/@visulima/rollup-plugin-dts
[npm-downloads-src]: https://img.shields.io/npm/dm/@visulima/rollup-plugin-dts.svg?style=flat-square
[npm-downloads-href]: https://www.npmcharts.com/compare/@visulima/rollup-plugin-dts?interval=30
[license-src]: https://img.shields.io/npm/l/@visulima/rollup-plugin-dts.svg?style=flat-square
[license-href]: https://npmjs.com/package/@visulima/rollup-plugin-dts
