<div align="center">
  <img src="./assets/packem.png" width="200">
  <h3>Visulima Packem</h3>
  <p>
  A fast and modern bundler for Node.js and TypeScript.
<br /> Supports multiple runtimes, shared modules, server components, dynamic import, wasm, css, and more.
<br /> Built on top of Rollup, combined with your preferred transformer like esbuild, swc, or sucrase.
  </p>
</div>

<br />

<div align="center">

[![typescript-image]][typescript-url] [![npm-image]][npm-url] [![license-image]][license-url]

</div>

---

<div align="center">
    <p>
        <sup>
            Daniel Bannert's open source work is supported by the community on <a href="https://github.com/sponsors/prisis">GitHub Sponsors</a>
        </sup>
    </p>
</div>

---

## Overview

`Visulima Packem` is built on top of Rollup, combined with your preferred transformer like `esbuild`, `swc`, or `sucrase`.
It enables you to generate multiple bundles (CommonJS or ESModule) simultaneously while adhering to Node.js’ native file type support.

It uses the `exports` configuration in `package.json` and recognizes entry file conventions to match your exports and build them into bundles.

## Features

-   ✅ package.json#exports, package.json#main, package.json#module to define entry-points
-   ✅ package.json#bin to define executables
-   ✅ package.json#types to define types
-   ✅ Generates package.json#typeVersions to support node 10
-   ✅ Dependency externalization
-   ✅ Minification
-   ✅ TypeScript support + .d.ts bundling
-   ✅ Watch mode
-   ✅ CLI outputs (auto hashbang insertion)
-   ✅ Validates package.json and checks if all fields that are needed to publish your package are configured correctly
-   ✅ Supports multiple runtimes (default, react-server, edge-light)
-   ✅ Supports react server and client components
-   ✅ Supports shared modules
-   ✅ Supports dynamic import
-   ✅ Supports `tsconfig.json` paths and `package.json` imports resolution
-   ✅ ESM ⇄ CJS interoperability
-   ✅ Supports isolated declaration types (experimental)
-   ✅ Supports wasm [WebAssembly modules](http://webassembly.org)
-   ✅ Supports css and css modules (coming soon)
-   ✅ [TypeDoc](https://github.com/TypeStrong/TypeDoc) documentation generation

And more...

## Install

```sh
npm install --save-dev @visulima/packem
```

```sh
yarn add -D @visulima/packem
```

```sh
pnpm add -D @visulima/packem
```

## Prepare your project

You need to prepare your project to be able to bundle it with `packem`.

You can check out the following cases to configure your package.json.

<details>
  <summary> JavaScript</summary>

Then use the [exports field in package.json](https://nodejs.org/api/packages.html#exports-sugar) to configure different conditions and leverage the same functionality as other bundlers, such as webpack. The exports field allows you to define multiple conditions.

```json
{
    "files": ["dist"],
    "exports": {
        "import": "./dist/index.mjs",
        "require": "./dist/index.cjs"
    },
    "scripts": {
        "build": "packem build"
    }
}
```

</details>

<details>
  <summary>TypeScript</summary>

When building a TypeScript library, separate the types from the main entry file by specifying the `types` path in `package.json`.
When you're using `.mjs` or `.cjs` extensions with TypeScript and modern module resolution (above node16), TypeScript will require specific type declaration files like `.d.mts` or `.d.cts` to match the extension. `packem` can automatically generate them to match the types to match the condition and extensions.
One example is to configure your exports like this in package.json:

```json
{
    "files": ["dist"],
    "exports": {
        "import": {
            "types": "./dist/index.d.mts",
            "default": "./dist/index.mjs"
        },
        "require": {
            "types": "./dist/index.d.cts",
            "default": "./dist/index.cjs"
        }
    },
    "scripts": {
        "build": "packem build"
    }
}
```

</details>

<details>
  <summary>Hybrid (CJS & ESM) Module Resolution with TypeScript</summary>

If you're using TypeScript with `Node 10` and `Node 16` module resolution, you can use the `types` field in package.json to specify the types path.
Then `packem` will generate the types file with the same extension as the main entry file.

```json
{
    "files": ["dist"],
    "main": "./dist/index.cjs",
    "module": "./dist/index.mjs",
    "types": "./dist/index.d.ts",
    "exports": {
        "import": {
            "types": "./dist/index.d.mts",
            "default": "./dist/index.mjs"
        },
        "require": {
            "types": "./dist/index.d.cts",
            "default": "./dist/index.cjs"
        }
    },
    "scripts": {
        "build": "packem build"
    }
}
```

Enable the automatic `node 10` typesVersions generation in packem.config.js:

```js
export default defineConfig({
    // ...
    rollup: {
        // ...
        node10Compatibility: {
            typeScriptVersion: ">=5.0", // Chose the version of TypeScript you want to support
            writeToPackageJson: true,
        },
        // ...
    },
    transformer,
});
```

You can validate your package.json exports configuration with [are the types wrong](https://github.com/arethetypeswrong/arethetypeswrong.github.io) cli tool.

</details>

Links:

-   https://github.com/frehner/modern-guide-to-packaging-js-library#set-the-main-field

## Usage

### Initialize the packem configuration

Initialize packem in your project, this will create a `packem.config.ts` or `packem.config.js` file in the root of your project.

```bash
packem init [options]
```

This command will ask you some questions about your project and create the configuration file.

### Bundle files

Run the following command to bundle your files:

```bash
packem build [options]
```

Then files in `src` folders will be treated as entry files and match the export names in package.json.

> [!NOTE]
> The `src` folder can be configured in the packem configuration file.

For example: `src/index.ts` will match the exports name `"."` or the only main export.

Now just run `npm run build` or `pnpm build` / `yarn build` if you're using these package managers, `packem` will find the entry files and build them.
The output format will be based on the exports condition and also the file extension. Given an example:

-   It's CommonJS for `require` and ESM for `import` based on the exports condition.
-   It's CommonJS for `.cjs` and ESM for `.mjs` based on the extension regardless the exports condition. Then for export condition like "node" you could choose the format with your extension.

> [!NOTE]
> All the `dependencies` and `peerDependencies` will be marked as external automatically and not included in the bundle. If you want to include them in the bundle, you can use the `--no-external` option.

This will write the files into the `./dist` folder.

> [!NOTE]
> The `dist` folder can be configured in the packem configuration file.

#### Multiple Runtime

For exports condition like `react-native`, `react-server` and `edge-light` as they're special platforms, they could have different exports or different code conditions.
In this case `packem` provides an override input source file convention if you want to build them as different code bundle.

For instance:

```json
{
    "exports": {
        "react-server": "./dist/react-server.mjs",
        "edge-light": "./dist/edge-light.mjs",
        "import": "./dist/index.mjs"
    }
}
```

> [!NOTE]
> The edge-light export contains a `process.env.EdgeRuntime` variable true, for all other runtimes false is returned.

#### `production` and `development` exports condition

If you need to separate the `production` and `development` exports condition, `packem` provides `process.env.NODE_ENV` injected by default if present that you don't need to manually inject yourself.

-   When the `production` exports condition is defined and the file ends with `*.production.*` in the package.json, the bundle will be minified.
-   When the `development` exports condition is defined and the file ends with `*.development.*` in the package.json, the bundle will not be minified.

```json
{
    "exports": {
        "development": "./dist/index.development.mjs",
        "production": "./dist/index.production.mjs"
    }
}
```

#### Executables

To build executable files with the `bin` field in package.json. The source file matching will be same as the entry files convention.

> [!NOTE] > `packem` automatically preserves and prepends the shebang to the executable file, and fix correct permissions for the executable file.

For example:

```bash
|- src/
  |- bin/
    |- index.ts
```

This will match the `bin` field in package.json as:

```json
{
    "bin": "./dist/bin/index.cjs"
}
```

or `.mjs` if the `type` field is `module` in package.json.

```json
{
    "type": "module",
    "bin": "./dist/bin/index.mjs"
}
```

For multiple executable files, you can create multiple files.

```bash
|- src/
  |- bin/
    |- foo.ts
    |- bar.ts
```

This will match the `bin` field in package.json as:

```json
{
    "bin": {
        "foo": "./dist/bin/foo.cjs",
        "bar": "./dist/bin/bar.cjs"
    }
}
```

#### Server Components

`packem` supports to build server components and server actions with library directives like `"use client"` or `"use server"`. It will generate the corresponding chunks for client and server that scope the client and server boundaries properly.
Then when the library is integrated to an app such as `Next.js`, app bundler can transform the client components and server actions correctly and maximum the benefits.

If you're using `"use client"` or `"use server"` in entry file, then it will be preserved on top and the dist file of that entry will become a client component.
If you're using `"use client"` or `"use server"` in a file that used as a dependency for an entry, then that file containing directives be split into a separate chunk and hoist the directives to the top of the chunk.

#### Shared Modules (Experimental)

There are always cases that you need to share code among bundles, but they don't have to be a separate entry or exports. You want to have them bundled into a shared chunk and then use them in different bundles. You can use shared module convention `[name].[layer]-runtime.[ext]` to create shared modules bundles.

<details>
  <summary>Shared Utils Example</summary>

```js
// src/util.shared-runtime.js
export function sharedUtil() {
    /* ... */
}
```

Then you can use them in different entry files:

```js
// src/index.js
import { sharedUtil } from "./util.shared-runtime";
```

```js
// src/lite.js
import { sharedUtil } from "./util.shared-runtime";
```

`packem` will bundle the shared module into a separate **layer** which matches the file name convention, in the above case it's "shared", and that bundle will be referenced by the different entry bundles.

</details>

With multiple runtime bundles, such as having `default` and `react-server` together. They could have the modules that need to be shared and kept as only one instance among different runtime bundles. You can use the shared module convention to create shared modules bundles for different runtime bundles.

<details>
  <summary>Shared Runtime Module Example</summary>

```js
"use client";
// src/app-context.shared-runtime.js
export const AppContext = React.createContext(null);
```

Then you can use them in different entry files:

```js
// src/index.js
import { AppContext } from "./app-context.shared-runtime";
```

```js
// src/index.react-server.js
import { AppContext } from "./app-context.shared-runtime";
```

`app-context.shared-runtime` will be bundled into a separate chunk that only has one instance and be shared among different runtime bundles.

</details>

#### Text or Data Files

`packem` supports importing of file as string content, you can name the extension as .txt or .data, and it will be bundled as string content.

```js
// src/index.js
import { text } from "./text.txt";

console.log(text); // "Hello World"
```

#### Visualize Bundle Makeup

Use the `--visualize` flag to generate a `packem-bundle-analyze.html` file at build time, showing the makeup of your bundle.

#### Building Module Workers (Experimental) (WIP)

`packem` supports building module workers with the `--workers` flag, which are a special type of bundle that can be used to run code in a web worker.

```js
worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
// or simply:
worker = new Worker("./worker.js", { type: "module" });
```

#### CSS and CSS Modules (Coming Soon)

### Aliases

Aliases can be configured in the [import map](https://nodejs.org/api/packages.html#imports), defined in `package.json#imports`.

For native Node.js import mapping, all entries must be prefixed with `#` to indicate an internal [subpath import](https://nodejs.org/api/packages.html#subpath-imports). `Packem` takes advantage of this behavior to define entries that are _not prefixed_ with `#` as an alias.

Native Node.js import mapping supports conditional imports (eg. resolving different paths for Node.js and browser), but `packem` does not.

> ⚠️ Aliases are not supported in type declaration generation. If you need type support, do not use aliases.

```json5
{
    // ...

    imports: {
        // Mapping '~utils' to './src/utils.js'
        "~utils": "./src/utils.js",

        // Native Node.js import mapping (can't reference ./src)
        "#internal-package": "./vendors/package/index.js",
    },
}
```

### ESM ⇄ CJS interoperability

Node.js ESM offers [interoperability with CommonJS](https://nodejs.org/api/esm.html#interoperability-with-commonjs) via [static analysis](https://github.com/nodejs/cjs-module-lexer). However, not all bundlers compile ESM to CJS syntax in a way that is statically analyzable.

Because `packem` uses Rollup, it's able to produce CJS modules that are minimal and interoperable with Node.js ESM.

This means you can technically output in CommonJS to get ESM and CommonJS support.

#### `require()` in ESM

Sometimes it's useful to use `require()` or `require.resolve()` in ESM. ESM code that uses `require()` can be seamlessly compiled to CommonJS, but when compiling to ESM, Node.js will error because `require` doesn't exist in the module scope.

When compiling to ESM, `packem` detects `require()` usages and shims it with [`createRequire(import.meta.url)`](https://nodejs.org/api/module.html#modulecreaterequirefilename).

Not only does `packem` shim `ESM ⇄ CJS`, but fixes the `export` and `export types` for `default` exports in your commonjs files.

To enable both features you need to add `cjsInterop: true` to your `packem` config.

```js
export default defineConfig({
    cjsInterop: true,
    // ...
});
```

### Environment variables

Pass in compile-time environment variables with the `--env` flag.

This will replace all instances of `process.env.NODE_ENV` with `'production'` and remove unused code:

```sh
packem build --env.NODE_ENV=production
```

## Validating

`Packem` validates your `package.json` file and checks if all fields are configured correctly, that are needed to publish your package.

> [!NOTE]
> To have a full validation checkup, visit [publint](https://github.com/bluwy/publint) and [are the types wrong](https://github.com/arethetypeswrong/arethetypeswrong.github.io).

## TypeDoc

### Installation

To generate api documentation for your project, you need to install `typedoc` to your project.

```sh
npm exec packem add typedoc
```

```sh
yarn exec packem add typedoc
```

```sh
pnpm exec packem add typedoc
```

To generate documentation for your project, you can use the `--typedoc` flag.

```sh
packem build --typedoc
```

This will generate a `api-docs` folder in the root of your project.

### Different formats

You can specify the output format inside the `packem.config.js` file.

```js
export default defineConfig({
    // ...
    typedoc: {
        format: "inline",
        readmePath: "./README.md",
    },
    // ...
});
```

## Configuration

### packem.config.js

The packem configuration file is a JavaScript file that exports an object with the following properties:

#### transformer

You choose which one of the three supported transformer to use.

-   [esbuild](https://github.com/evanw/esbuild)
-   [@swc/core](https://github.com/swc-project/swc)
-   [sucrase](https://github.com/alangpierce/sucrase)

## Api Docs

<!-- TYPEDOC -->

# cli
# config

## Functions

### defineConfig()

```ts
function defineConfig(config): BuildConfig | BuildConfigFunction
```

Define a build configuration.

#### Parameters

• **config**: [`BuildConfig`](packem.md#buildconfig) \| [`BuildConfigFunction`](config.md#buildconfigfunction)

#### Returns

[`BuildConfig`](packem.md#buildconfig) \| [`BuildConfigFunction`](config.md#buildconfigfunction)

#### Defined in

[config.ts:14](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/config.ts#L14)

***

### definePreset()

```ts
function definePreset(preset): BuildPreset
```

Define a build preset.

#### Parameters

• **preset**: [`BuildPreset`](packem.md#buildpreset)

#### Returns

[`BuildPreset`](packem.md#buildpreset)

#### Defined in

[config.ts:24](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/config.ts#L24)

## Type Aliases

### BuildConfigFunction()

```ts
type BuildConfigFunction: (enviroment, mode) => BuildConfig | Promise<BuildConfig>;
```

#### Parameters

• **enviroment**: [`Environment`](packem.md#environment-2)

• **mode**: [`Mode`](packem.md#mode-1)

#### Returns

[`BuildConfig`](packem.md#buildconfig) \| `Promise`\<[`BuildConfig`](packem.md#buildconfig)\>

#### Defined in

[config.ts:3](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/config.ts#L3)

## References

### BuildConfig

Re-exports [BuildConfig](packem.md#buildconfig)

### BuildHooks

Re-exports [BuildHooks](packem.md#buildhooks)

### BuildPreset

Re-exports [BuildPreset](packem.md#buildpreset)
# packem

## Functions

### packem()

```ts
function packem(
   rootDirectory, 
   mode, 
   environment, 
   logger, 
inputConfig): Promise<void>
```

#### Parameters

• **rootDirectory**: `string`

• **mode**: [`Mode`](packem.md#mode-1)

• **environment**: [`Environment`](packem.md#environment-2)

• **logger**: `PailServerType`

• **inputConfig**: `object` & [`BuildConfig`](packem.md#buildconfig) = `{}`

#### Returns

`Promise`\<`void`\>

#### Defined in

[packem.ts:610](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/packem.ts#L610)

## Interfaces

### BuildConfig

In addition to basic `entries`, `presets`, and `hooks`,
there are also all the properties of `BuildOptions` except for BuildOption's `entries`.

#### Extends

- `DeepPartial`\<`Omit`\<[`BuildOptions`](packem.md#buildoptions), `"entries"`\>\>

#### Properties

##### alias?

```ts
optional alias: DeepPartial<Record<string, string>>;
```

###### Inherited from

`DeepPartial.alias`

###### Defined in

[types.ts:181](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L181)

##### analyze?

```ts
optional analyze: DeepPartial<boolean>;
```

###### Inherited from

`DeepPartial.analyze`

###### Defined in

[types.ts:182](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L182)

##### builder?

```ts
optional builder: DeepPartial<Record<string, (context, cachePath, fileCache, logged) => Promise<void>>>;
```

###### Inherited from

`DeepPartial.builder`

###### Defined in

[types.ts:183](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L183)

##### cjsInterop?

```ts
optional cjsInterop: DeepPartial<boolean>;
```

###### Inherited from

`DeepPartial.cjsInterop`

###### Defined in

[types.ts:184](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L184)

##### clean?

```ts
optional clean: DeepPartial<boolean>;
```

###### Inherited from

`DeepPartial.clean`

###### Defined in

[types.ts:185](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L185)

##### debug?

```ts
optional debug: DeepPartial<boolean>;
```

###### Inherited from

`DeepPartial.debug`

###### Defined in

[types.ts:186](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L186)

##### declaration?

```ts
optional declaration: DeepPartial<boolean | "compatible" | "node16">;
```

`compatible` means "src/gather.ts" will generate "dist/index.d.mts", "dist/index.d.cts" and "dist/index.d.ts".
`node16` means "src/gather.ts" will generate "dist/index.d.mts" and "dist/index.d.cts".
`true` is equivalent to `compatible`.
`false` will disable declaration generation.
`undefined` will auto-detect based on "package.json". If "package.json" has "types" field, it will be `"compatible"`, otherwise `false`.

###### Inherited from

`DeepPartial.declaration`

###### Defined in

[types.ts:194](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L194)

##### dtsOnly?

```ts
optional dtsOnly: DeepPartial<boolean>;
```

If `true`, only generate declaration files.
If `false` or `undefined`, generate both declaration and source files.

###### Inherited from

`DeepPartial.dtsOnly`

###### Defined in

[types.ts:199](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L199)

##### emitCJS?

```ts
optional emitCJS: DeepPartial<boolean>;
```

###### Inherited from

`DeepPartial.emitCJS`

###### Defined in

[types.ts:200](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L200)

##### emitESM?

```ts
optional emitESM: DeepPartial<boolean>;
```

###### Inherited from

`DeepPartial.emitESM`

###### Defined in

[types.ts:201](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L201)

##### entries?

```ts
optional entries: (string | BuildEntry)[];
```

###### Defined in

[types.ts:309](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L309)

##### externals?

```ts
optional externals: DeepPartial<string | RegExp>[];
```

###### Inherited from

`DeepPartial.externals`

###### Defined in

[types.ts:203](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L203)

##### failOnWarn?

```ts
optional failOnWarn: DeepPartial<boolean>;
```

###### Inherited from

`DeepPartial.failOnWarn`

###### Defined in

[types.ts:204](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L204)

##### fileCache?

```ts
optional fileCache: DeepPartial<boolean>;
```

###### Inherited from

`DeepPartial.fileCache`

###### Defined in

[types.ts:205](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L205)

##### hooks?

```ts
optional hooks: Partial<BuildHooks>;
```

###### Defined in

[types.ts:310](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L310)

##### isolatedDeclarationTransformer?

```ts
optional isolatedDeclarationTransformer: DeepPartial<(code, id) => Promise<IsolatedDeclarationsResult>>;
```

**`Experimental`**

###### Inherited from

`DeepPartial.isolatedDeclarationTransformer`

###### Defined in

[types.ts:207](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L207)

##### jiti?

```ts
optional jiti: DeepPartial<Omit<JitiOptions, "transform" | "onError">>;
```

Jiti options, where [jiti](https://github.com/unjs/jiti) is used to load the entry files.

###### Inherited from

`DeepPartial.jiti`

###### Defined in

[types.ts:211](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L211)

##### minify?

```ts
optional minify: DeepPartial<boolean>;
```

###### Inherited from

`DeepPartial.minify`

###### Defined in

[types.ts:212](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L212)

##### name?

```ts
optional name: string;
```

###### Inherited from

`DeepPartial.name`

###### Defined in

[types.ts:213](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L213)

##### outDir?

```ts
optional outDir: string;
```

###### Inherited from

`DeepPartial.outDir`

###### Defined in

[types.ts:214](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L214)

##### preset?

```ts
optional preset: "none" | "auto" | BuildPreset | object & string;
```

###### Defined in

[types.ts:311](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L311)

##### rollup?

```ts
optional rollup: DeepPartial<RollupBuildOptions>;
```

###### Inherited from

`DeepPartial.rollup`

###### Defined in

[types.ts:215](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L215)

##### rootDir?

```ts
optional rootDir: string;
```

###### Inherited from

`DeepPartial.rootDir`

###### Defined in

[types.ts:216](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L216)

##### sourceDir?

```ts
optional sourceDir: string;
```

###### Inherited from

`DeepPartial.sourceDir`

###### Defined in

[types.ts:217](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L217)

##### sourcemap?

```ts
optional sourcemap: DeepPartial<boolean>;
```

###### Inherited from

`DeepPartial.sourcemap`

###### Defined in

[types.ts:218](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L218)

##### transformer?

```ts
optional transformer: DeepPartial<(config) => Plugin<any>>;
```

###### Inherited from

`DeepPartial.transformer`

###### Defined in

[types.ts:219](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L219)

##### typedoc?

```ts
optional typedoc: DeepPartial<false | TypeDocumentOptions>;
```

###### Inherited from

`DeepPartial.typedoc`

###### Defined in

[types.ts:220](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L220)

##### validation?

```ts
optional validation: DeepPartial<object>;
```

###### Type declaration

###### packageJson?

```ts
optional packageJson: object;
```

###### packageJson.bin?

```ts
optional bin: boolean;
```

###### packageJson.dependencies?

```ts
optional dependencies: boolean;
```

###### packageJson.exports?

```ts
optional exports: boolean;
```

###### packageJson.files?

```ts
optional files: boolean;
```

###### packageJson.main?

```ts
optional main: boolean;
```

###### packageJson.module?

```ts
optional module: boolean;
```

###### packageJson.name?

```ts
optional name: boolean;
```

###### packageJson.types?

```ts
optional types: boolean;
```

###### packageJson.typesVersions?

```ts
optional typesVersions: boolean;
```

###### Inherited from

`DeepPartial.validation`

###### Defined in

[types.ts:221](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L221)

***

### BuildContext

#### Properties

##### buildEntries

```ts
buildEntries: (BuildContextBuildEntry | BuildContextBuildAssetAndChunk)[];
```

###### Defined in

[types.ts:288](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L288)

##### dependencyGraphMap

```ts
dependencyGraphMap: Map<string, Set<[string, string]>>;
```

###### Defined in

[types.ts:289](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L289)

##### environment

```ts
environment: Environment;
```

###### Defined in

[types.ts:290](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L290)

##### hooks

```ts
hooks: Hookable<BuildHooks, HookKeys<BuildHooks>>;
```

###### Defined in

[types.ts:291](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L291)

##### jiti

```ts
jiti: Jiti;
```

###### Defined in

[types.ts:292](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L292)

##### logger

```ts
logger: PailServerType;
```

###### Defined in

[types.ts:293](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L293)

##### mode

```ts
mode: Mode;
```

###### Defined in

[types.ts:294](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L294)

##### options

```ts
options: InternalBuildOptions;
```

###### Defined in

[types.ts:295](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L295)

##### pkg

```ts
pkg: PackageJson<!-- TYPEDOC -->;
```

###### Defined in

[types.ts:296](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L296)

##### tsconfig?

```ts
optional tsconfig: TsConfigResult;
```

###### Defined in

[types.ts:297](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L297)

##### usedImports

```ts
usedImports: Set<string>;
```

###### Defined in

[types.ts:298](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L298)

##### warnings

```ts
warnings: Set<string>;
```

###### Defined in

[types.ts:299](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L299)

***

### BuildHooks

#### Properties

##### build:before()

```ts
build:before: (context) => void | Promise<void>;
```

###### Parameters

• **context**: [`BuildContext`](packem.md#buildcontext)

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:237](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L237)

##### build:done()

```ts
build:done: (context) => void | Promise<void>;
```

###### Parameters

• **context**: [`BuildContext`](packem.md#buildcontext)

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:238](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L238)

##### build:prepare()

```ts
build:prepare: (context) => void | Promise<void>;
```

###### Parameters

• **context**: [`BuildContext`](packem.md#buildcontext)

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:239](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L239)

##### builder:before()

```ts
builder:before: (name, context) => void | Promise<void>;
```

###### Parameters

• **name**: `string`

• **context**: [`BuildContext`](packem.md#buildcontext)

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:241](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L241)

##### builder:done()

```ts
builder:done: (name, context) => void | Promise<void>;
```

###### Parameters

• **name**: `string`

• **context**: [`BuildContext`](packem.md#buildcontext)

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:242](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L242)

##### rollup:build()

```ts
rollup:build: (context, build) => void | Promise<void>;
```

###### Parameters

• **context**: [`BuildContext`](packem.md#buildcontext)

• **build**: `RollupBuild`

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:244](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L244)

##### rollup:done()

```ts
rollup:done: (context) => void | Promise<void>;
```

###### Parameters

• **context**: [`BuildContext`](packem.md#buildcontext)

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:245](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L245)

##### rollup:dts:build()

```ts
rollup:dts:build: (context, build) => void | Promise<void>;
```

###### Parameters

• **context**: [`BuildContext`](packem.md#buildcontext)

• **build**: `RollupBuild`

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:246](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L246)

##### rollup:dts:done()

```ts
rollup:dts:done: (context) => void | Promise<void>;
```

###### Parameters

• **context**: [`BuildContext`](packem.md#buildcontext)

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:248](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L248)

##### rollup:dts:options()

```ts
rollup:dts:options: (context, options) => void | Promise<void>;
```

###### Parameters

• **context**: [`BuildContext`](packem.md#buildcontext)

• **options**: `RollupOptions`

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:249](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L249)

##### rollup:options()

```ts
rollup:options: (context, options) => void | Promise<void>;
```

###### Parameters

• **context**: [`BuildContext`](packem.md#buildcontext)

• **options**: `RollupOptions`

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:251](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L251)

##### rollup:watch()

```ts
rollup:watch: (context, watcher) => void | Promise<void>;
```

###### Parameters

• **context**: [`BuildContext`](packem.md#buildcontext)

• **watcher**: `RollupWatcher`

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:252](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L252)

##### typedoc:before()

```ts
typedoc:before: (context) => void | Promise<void>;
```

###### Parameters

• **context**: [`BuildContext`](packem.md#buildcontext)

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:255](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L255)

##### typedoc:done()

```ts
typedoc:done: (context) => void | Promise<void>;
```

###### Parameters

• **context**: [`BuildContext`](packem.md#buildcontext)

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:257](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L257)

##### validate:before()

```ts
validate:before: (context) => void | Promise<void>;
```

###### Parameters

• **context**: [`BuildContext`](packem.md#buildcontext)

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:259](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L259)

##### validate:done()

```ts
validate:done: (context) => void | Promise<void>;
```

###### Parameters

• **context**: [`BuildContext`](packem.md#buildcontext)

###### Returns

`void` \| `Promise`\<`void`\>

###### Defined in

[types.ts:260](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L260)

***

### BuildOptions

#### Properties

##### alias

```ts
alias: Record<string, string>;
```

###### Defined in

[types.ts:181](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L181)

##### analyze?

```ts
optional analyze: boolean;
```

###### Defined in

[types.ts:182](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L182)

##### builder?

```ts
optional builder: Record<string, (context, cachePath, fileCache, logged) => Promise<void>>;
```

###### Defined in

[types.ts:183](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L183)

##### cjsInterop?

```ts
optional cjsInterop: boolean;
```

###### Defined in

[types.ts:184](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L184)

##### clean

```ts
clean: boolean;
```

###### Defined in

[types.ts:185](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L185)

##### debug

```ts
debug: boolean;
```

###### Defined in

[types.ts:186](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L186)

##### declaration?

```ts
optional declaration: boolean | "compatible" | "node16";
```

`compatible` means "src/gather.ts" will generate "dist/index.d.mts", "dist/index.d.cts" and "dist/index.d.ts".
`node16` means "src/gather.ts" will generate "dist/index.d.mts" and "dist/index.d.cts".
`true` is equivalent to `compatible`.
`false` will disable declaration generation.
`undefined` will auto-detect based on "package.json". If "package.json" has "types" field, it will be `"compatible"`, otherwise `false`.

###### Defined in

[types.ts:194](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L194)

##### dtsOnly?

```ts
optional dtsOnly: boolean;
```

If `true`, only generate declaration files.
If `false` or `undefined`, generate both declaration and source files.

###### Defined in

[types.ts:199](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L199)

##### emitCJS?

```ts
optional emitCJS: boolean;
```

###### Defined in

[types.ts:200](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L200)

##### emitESM?

```ts
optional emitESM: boolean;
```

###### Defined in

[types.ts:201](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L201)

##### entries

```ts
entries: BuildEntry[];
```

###### Defined in

[types.ts:202](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L202)

##### externals

```ts
externals: (string | RegExp)[];
```

###### Defined in

[types.ts:203](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L203)

##### failOnWarn?

```ts
optional failOnWarn: boolean;
```

###### Defined in

[types.ts:204](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L204)

##### fileCache?

```ts
optional fileCache: boolean;
```

###### Defined in

[types.ts:205](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L205)

##### isolatedDeclarationTransformer()?

```ts
optional isolatedDeclarationTransformer: (code, id) => Promise<IsolatedDeclarationsResult>;
```

**`Experimental`**

###### Parameters

• **code**: `string`

• **id**: `string`

###### Returns

`Promise`\<`IsolatedDeclarationsResult`\>

###### Defined in

[types.ts:207](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L207)

##### jiti

```ts
jiti: Omit<JitiOptions, "transform" | "onError">;
```

Jiti options, where [jiti](https://github.com/unjs/jiti) is used to load the entry files.

###### Defined in

[types.ts:211](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L211)

##### minify?

```ts
optional minify: boolean;
```

###### Defined in

[types.ts:212](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L212)

##### name

```ts
name: string;
```

###### Defined in

[types.ts:213](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L213)

##### outDir

```ts
outDir: string;
```

###### Defined in

[types.ts:214](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L214)

##### rollup

```ts
rollup: RollupBuildOptions;
```

###### Defined in

[types.ts:215](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L215)

##### rootDir

```ts
rootDir: string;
```

###### Defined in

[types.ts:216](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L216)

##### sourceDir

```ts
sourceDir: string;
```

###### Defined in

[types.ts:217](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L217)

##### sourcemap

```ts
sourcemap: boolean;
```

###### Defined in

[types.ts:218](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L218)

##### transformer()

```ts
transformer: (config) => Plugin<any>;
```

###### Parameters

• **config**: `EsbuildPluginConfig` \| `SucrasePluginConfig` \| `SwcPluginConfig`

###### Returns

`Plugin`\<`any`\>

###### Defined in

[types.ts:219](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L219)

##### typedoc

```ts
typedoc: false | TypeDocumentOptions;
```

###### Defined in

[types.ts:220](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L220)

##### validation?

```ts
optional validation: object;
```

###### packageJson?

```ts
optional packageJson: object;
```

###### packageJson.bin?

```ts
optional bin: boolean;
```

###### packageJson.dependencies?

```ts
optional dependencies: boolean;
```

###### packageJson.exports?

```ts
optional exports: boolean;
```

###### packageJson.files?

```ts
optional files: boolean;
```

###### packageJson.main?

```ts
optional main: boolean;
```

###### packageJson.module?

```ts
optional module: boolean;
```

###### packageJson.name?

```ts
optional name: boolean;
```

###### packageJson.types?

```ts
optional types: boolean;
```

###### packageJson.typesVersions?

```ts
optional typesVersions: boolean;
```

###### Defined in

[types.ts:221](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L221)

***

### RollupBuildOptions

#### Properties

##### alias

```ts
alias: false | RollupAliasOptions;
```

###### Defined in

[types.ts:104](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L104)

##### cjsInterop?

```ts
optional cjsInterop: CJSInteropOptions;
```

###### Defined in

[types.ts:105](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L105)

##### commonjs

```ts
commonjs: false | RollupCommonJSOptions;
```

###### Defined in

[types.ts:106](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L106)

##### copy?

```ts
optional copy: false | CopyPluginOptions;
```

###### Defined in

[types.ts:107](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L107)

##### dts

```ts
dts: Options;
```

###### Defined in

[types.ts:108](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L108)

##### dynamicVars?

```ts
optional dynamicVars: false | RollupDynamicImportVariablesOptions;
```

###### Defined in

[types.ts:109](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L109)

##### esbuild

```ts
esbuild: false | Options;
```

###### Defined in

[types.ts:110](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L110)

##### isolatedDeclarations?

```ts
optional isolatedDeclarations: IsolatedDeclarationsOptions;
```

###### Defined in

[types.ts:111](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L111)

##### json

```ts
json: false | RollupJsonOptions;
```

###### Defined in

[types.ts:112](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L112)

##### jsxRemoveAttributes?

```ts
optional jsxRemoveAttributes: false | JSXRemoveAttributesPlugin;
```

###### Defined in

[types.ts:113](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L113)

##### license?

```ts
optional license: false | LicenseOptions;
```

###### Defined in

[types.ts:114](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L114)

##### metafile?

```ts
optional metafile: boolean;
```

###### Defined in

[types.ts:115](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L115)

##### node10Compatibility?

```ts
optional node10Compatibility: false | Node10CompatibilityOptions;
```

###### Defined in

[types.ts:116](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L116)

##### output?

```ts
optional output: OutputOptions;
```

###### Defined in

[types.ts:117](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L117)

##### patchTypes

```ts
patchTypes: false | PatchTypesOptions;
```

###### Defined in

[types.ts:118](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L118)

##### plugins?

```ts
optional plugins: RollupPlugins;
```

###### Defined in

[types.ts:119](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L119)

##### polyfillNode?

```ts
optional polyfillNode: false | NodePolyfillsOptions;
```

###### Defined in

[types.ts:120](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L120)

##### preserveDirectives?

```ts
optional preserveDirectives: object;
```

###### directiveRegex?

```ts
optional directiveRegex: RegExp;
```

###### exclude?

```ts
optional exclude: FilterPattern;
```

###### include?

```ts
optional include: FilterPattern;
```

###### Defined in

[types.ts:121](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L121)

##### preserveDynamicImports?

```ts
optional preserveDynamicImports: boolean;
```

###### Defined in

[types.ts:126](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L126)

##### raw?

```ts
optional raw: false | RawLoaderOptions;
```

###### Defined in

[types.ts:127](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L127)

##### replace

```ts
replace: false | RollupReplaceOptions;
```

###### Defined in

[types.ts:128](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L128)

##### resolve

```ts
resolve: false | RollupNodeResolveOptions;
```

###### Defined in

[types.ts:129](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L129)

##### shebang?

```ts
optional shebang: false | Partial<ShebangOptions>;
```

###### Defined in

[types.ts:130](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L130)

##### shim?

```ts
optional shim: false | EsmShimCjsSyntaxOptions;
```

###### Defined in

[types.ts:131](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L131)

##### sucrase?

```ts
optional sucrase: false | SucrasePluginConfig;
```

###### Defined in

[types.ts:132](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L132)

##### swc?

```ts
optional swc: false | SwcPluginConfig;
```

###### Defined in

[types.ts:133](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L133)

##### treeshake?

```ts
optional treeshake: boolean | TreeshakingPreset | TreeshakingOptions;
```

###### Defined in

[types.ts:134](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L134)

##### visualizer?

```ts
optional visualizer: false | PluginVisualizerOptions;
```

###### Defined in

[types.ts:135](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L135)

##### wasm?

```ts
optional wasm: false | RollupWasmOptions;
```

###### Defined in

[types.ts:136](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L136)

##### watch?

```ts
optional watch: false | WatcherOptions;
```

###### Defined in

[types.ts:137](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L137)

## Type Aliases

### BuildContextBuildAssetAndChunk

```ts
type BuildContextBuildAssetAndChunk: object;
```

#### Type declaration

##### bytes?

```ts
optional bytes: number;
```

##### chunk?

```ts
optional chunk: boolean;
```

##### chunks?

```ts
optional chunks: string[];
```

##### exports?

```ts
optional exports: string[];
```

##### modules?

```ts
optional modules: object[];
```

##### path

```ts
path: string;
```

##### type?

```ts
optional type: "asset" | "chunk";
```

#### Defined in

[types.ts:273](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L273)

***

### BuildContextBuildEntry

```ts
type BuildContextBuildEntry: object;
```

#### Type declaration

##### bytes?

```ts
optional bytes: number;
```

##### chunk?

```ts
optional chunk: boolean;
```

##### chunks?

```ts
optional chunks: string[];
```

##### exports?

```ts
optional exports: string[];
```

##### modules?

```ts
optional modules: object[];
```

##### path

```ts
path: string;
```

##### type?

```ts
optional type: "entry";
```

#### Defined in

[types.ts:263](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L263)

***

### BuildEntry

```ts
type BuildEntry: object;
```

#### Type declaration

##### cjs?

```ts
optional cjs: boolean;
```

##### declaration?

```ts
optional declaration: boolean | "compatible" | "node16";
```

##### environment?

```ts
optional environment: Environment;
```

##### esm?

```ts
optional esm: boolean;
```

##### executable?

```ts
optional executable: true;
```

##### exportKey?

```ts
optional exportKey: Set<string>;
```

##### fileAlias?

```ts
optional fileAlias: string;
```

##### input

```ts
input: string;
```

##### isGlob?

```ts
optional isGlob: boolean;
```

##### name?

```ts
optional name: string;
```

##### outDir?

```ts
optional outDir: string;
```

##### runtime?

```ts
optional runtime: Runtime;
```

#### Defined in

[types.ts:165](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L165)

***

### BuildPreset

```ts
type BuildPreset: BuildConfig | () => BuildConfig;
```

#### Defined in

[types.ts:302](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L302)

***

### Environment

```ts
type Environment: "production" | "development" | undefined;
```

#### Defined in

[types.ts:90](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L90)

***

### Mode

```ts
type Mode: "build" | "jit" | "watch" | "tsdoc";
```

#### Defined in

[types.ts:319](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L319)

***

### Runtime

```ts
type Runtime: "react-server" | "react-native" | "edge-light" | "node";
```

#### Defined in

[types.ts:163](https://github.com/visulima/packem/blob/885eca49ac5183271c23315b601f9bb373f0e4b1/packages/packem/src/types.ts#L163)

<!-- /TYPEDOC -->

## Related

-   [bunchee](https://github.com/huozhi/bunchee) - Zero config bundler for ECMAScript and TypeScript packages
-   [unbuild](https://github.com/unjs/unbuild) - 📦 An unified javascript build system
-   [pkgroll](https://github.com/privatenumber/pkgroll) - 📦 Zero-config package bundler for Node.js + TypeScript
-   [siroc](https://github.com/danielroe/siroc) - Zero-config build tooling for Node
-   [tsup](https://github.com/egoist/tsup) - The simplest and fastest way to bundle your TypeScript libraries
-   [microbundle](https://github.com/developit/microbundle) - Zero-configuration bundler for tiny JS libs, powered by Rollup.

## Supported Node.js Versions

Libraries in this ecosystem make the best effort to track [Node.js’ release schedule](https://github.com/nodejs/release#release-schedule).
Here’s [a post on why we think this is important](https://medium.com/the-node-js-collection/maintainers-should-consider-following-node-js-release-schedule-ab08ed4de71a).

## Contributing

If you would like to help take a look at the [list of issues](https://github.com/visulima/visulima/issues) and check our [Contributing](.github/CONTRIBUTING.md) guild.

> **Note:** please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## Credits

-   [Daniel Bannert](https://github.com/prisis)
-   [All Contributors](https://github.com/visulima/visulima/graphs/contributors)

## License

The visulima pack is open-sourced software licensed under the [MIT][license-url]

[typescript-image]: https://img.shields.io/badge/Typescript-294E80.svg?style=for-the-badge&logo=typescript
[typescript-url]: "typescript"
[license-image]: https://img.shields.io/npm/l/@visulima/packem?color=blueviolet&style=for-the-badge
[license-url]: LICENSE.md "license"
[npm-image]: https://img.shields.io/npm/v/@visulima/packem/latest.svg?style=for-the-badge&logo=npm
[npm-url]: https://www.npmjs.com/package/@visulima/packem/v/latest "npm"
