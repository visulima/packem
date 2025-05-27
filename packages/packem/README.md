<div align="center">
  <img src="./assets/packem.png" width="200">
  <h3>Visulima Packem</h3>
  <p>
  A fast and modern bundler for Node.js and TypeScript.
<br /> Supports multiple runtimes, shared modules, server components, dynamic import, wasm, css, and more.
<br /> Built on top of Rollup, combined with your preferred transformer like esbuild, swc, OXC, or sucrase.
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

`Visulima Packem` is built on top of Rollup, combined with your preferred transformer like `esbuild`, `swc`, `OXC`, or `sucrase`.
It enables you to generate multiple bundles (CommonJS or ESModule) simultaneously while adhering to Node.js’ native file type support.

It uses the `exports` configuration in `package.json` and recognizes entry file conventions to match your exports and build them into bundles.

## Features

- ✅ package.json#exports, package.json#main, package.json#module to define entry-points
- ✅ package.json#bin to define executables
- ✅ package.json#types to define types
- ✅ Generates package.json#typeVersions to support node 10
- ✅ Dependency externalization
- ✅ Minification
- ✅ TypeScript support + .d.ts bundling
- ✅ Watch mode
- ✅ CLI outputs (auto hashbang insertion)
- ✅ Validator
    - Validates package.json and checks if all fields that are needed to publish your package are configured correctly
    - Bundle size validation
- ✅ Supports multiple runtimes (default, react-server, edge-light, browser and node)
- ✅ Supports react server and client components
- ✅ Supports shared modules
- ✅ Supports dynamic import
- ✅ Supports `tsconfig.json` paths and `package.json` imports resolution
- ✅ ESM ⇄ CJS interoperability
- ✅ Supports isolated declaration types (experimental) (Typescript version 5.5 or higher)
- ✅ Supports wasm [WebAssembly modules](http://webassembly.org)
- ✅ Supports css, [sass](https://github.com/sass/sass), [less](https://github.com/less/less.js), [stylus](https://github.com/stylus/stylus) and Up-to-date [CSS Modules](https://github.com/css-modules/css-modules) (experimental)
- ✅ [TypeDoc](https://github.com/TypeStrong/TypeDoc) documentation generation

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

- https://github.com/frehner/modern-guide-to-packaging-js-library#set-the-main-field

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

- It's CommonJS for `require` and ESM for `import` based on the exports condition.
- It's CommonJS for `.cjs` and ESM for `.mjs` based on the extension regardless the exports condition. Then for export condition like "node" you could choose the format with your extension.

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

- When the `production` exports condition is defined and the file ends with `*.production.*` in the package.json, the bundle will be minified.
- When the `development` exports condition is defined and the file ends with `*.development.*` in the package.json, the bundle will not be minified.

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
/**
 *
 */
export function sharedUtil() {
    /* ... */
}
```

Then you can use them in different entry files:

```js
// src/index.js
import { sharedUtil as sharedUtility } from "./util.shared-runtime";
```

```js
// src/lite.js
import { sharedUtil as sharedUtility } from "./util.shared-runtime";
```

`packem` will bundle the shared module into a separate **layer** which matches the file name convention, in the above case it's "shared", and that bundle will be referenced by the different entry bundles.

</details>

With multiple runtime bundles, such as having `default` and `react-server` together. They could have the modules that need to be shared and kept as only one instance among different runtime bundles. You can use the shared module convention to create shared modules bundles for different runtime bundles.

<details>
  <summary>Shared Runtime Module Example</summary>

```js
"use client";

// src/app-context.shared-runtime.js
export const AppContext = React.createContext(undefined);
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
worker = new Worker(new URL("worker.js", import.meta.url), { type: "module" });
// or simply:
worker = new Worker("./worker.js", { type: "module" });
```

### Plugins

A plugin can additionally specify an enforce property (similar to webpack loaders) to adjust its application order.
The value of `enforce` can be either `"pre"` or `"post"`.
The value of `type` can be either `"build"` or `"dts"`, where `"build"` is the default value.

> If `dts` is specified, the plugin will only run when declaration files are generated.

The resolved plugins will be in the following order:

- Alias
- User plugins with enforce: 'pre'
- Rollup core plugins
- User plugins without enforce value
- Rollup build plugins
- User plugins with enforce: 'post'
- Rollup post build plugins (minify, manifest, copy, reporting)

```typescript
import { optimizeLodashImports } from "@optimize-lodash/rollup-plugin";
import { defineConfig } from "@visulima/packem/config";

export default defineConfig({
    // ...
    plugins: [
        {
            enforce: "pre",
            plugin: optimizeLodashImports(),
            // type: "build" -> default value
        },
    ],
    // ...
});
```

### Aliases

Aliases are automatically inferred from `paths` in your tsconfig.json file, and can also be configured in the [import map](https://nodejs.org/api/packages.html#imports) defined in `package.json#imports`.

For native Node.js import mapping, all entries must be prefixed with `#` to indicate an internal [subpath import](https://nodejs.org/api/packages.html#subpath-imports). `Packem` takes advantage of this behavior to define entries that are _not prefixed_ with `#` as an alias.

Native Node.js import mapping supports conditional imports (eg. resolving different paths for Node.js and browser), but `packem` does not.

> ⚠️ Aliases are not supported in type declaration generation. If you need type support, do not use aliases.

```json5
{
    // ...

    "imports": {
        // Mapping '~utils' to './src/utils.js'
        "~utils": "./src/utils.js",

        // Native Node.js import mapping (can't reference ./src)
        "#internal-package": "./vendors/package/index.js"
    }
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

## Programmatic Usage

You can use Packem programmatically in your Node.js applications without the CLI:

```typescript
import { packem } from "@visulima/packem";

// Basic usage
await packem("./src", {
    environment: "production",
    mode: "build",
});

// With custom options
await packem("./src", {
    declaration: true,
    environment: "development",
    logger: {
        // Custom logger options
        level: "debug",
    },
    minify: true,
    mode: "build",
    sourcemap: true,
});
```

The `packem` function accepts the following parameters:

- `rootDirectory` (string): The root directory of your project to bundle
- `options` (PackemOptions): Configuration options that extend the BuildConfig interface
    - `mode`: The build mode ('build' | 'watch')
    - `environment`: The target environment ('development' | 'production')
    - `declaration`: Enable/disable TypeScript declaration file generation
    - `minify`: Enable/disable code minification
    - `sourcemap`: Enable/disable source map generation
    - `logger`: Logger configuration options

For more detailed configuration options, refer to the [Configuration](#configuration) section.

## Validators

### Package.json Validation

`Packem` validates your `package.json` file and checks if all fields are configured correctly, that are needed to publish your package.

> [!NOTE]
> To have a full validation checkup, visit [publint](https://github.com/bluwy/publint) and [are the types wrong](https://github.com/arethetypeswrong/arethetypeswrong.github.io).

### Bundle Size Validation

`Packem` validates the bundle size and checks if the bundle size is within the limit you set in the configuration file.

```ts
import { defineConfig } from "@visulima/packem/config";

export default defineConfig({
    // ...
    validator: {
        bundleSize: {
            limit: 1024 * 1024, // 1MB
            // or / and limits per file
            limits: {
                // Glob pattern
                "**/*.mjs": "1MB",
                "index.cjs": 1024 * 1024, // 1MB
                "test.mjs": "1MB",
            },
        },
    },
    // ...
});
```

## Experimental Features

### OXC Resolver

`packem` supports the [oxc-resolver](https://github.com/oxc-project/oxc-resolver) resolver to resolve modules in your project.

To use the oxc resolver, you need to enable it in the packem configuration file.

```ts
import { defineConfig } from "@visulima/packem/config";

export default defineConfig({
    // ...
    experimental: {
        oxcResolve: true,
    },
    // ...
});
```

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

### Isolated declaration types (in TypeScript 5.5)

> Generating .d.ts files with the default `rollup-plugin-dts` is slow because the TypeScript compiler must perform costly type inference, but these files streamline type checking by removing unnecessary details, and while shipping raw TypeScript files could simplify workflows, it is impractical due to ecosystem assumptions and performance trade-offs, which isolated declarations aim to address.

You need to choose of the supported transformer to use isolated declaration types.

- [oxc](https://github.com/oxc-project/oxc)
- [@swc/core](https://github.com/swc-project/swc)
- [typescript](https://github.com/microsoft/TypeScript)

Default is `typescript`.

```ts
import { defineConfig } from "@visulima/packem/config";
import isolatedDeclarationTransformer from "@visulima/packem/dts/isolated/transformer/typescript";
import transformer from "@visulima/packem/transformer/esbuild";

export default defineConfig({
    isolatedDeclarationTransformer,
    transformer,
});
```

<!-- Modified copy of https://github.com/Anidetrix/rollup-plugin-styles/blob/main/README.md -->

## Css and Css Modules

`packem` supports:

- [PostCSS](https://github.com/postcss/postcss)
- [Sass](https://github.com/sass/sass)
- [Less](https://github.com/less/less.js)
- [Stylus](https://github.com/stylus/stylus)
- Up-to-date [CSS Modules](https://github.com/css-modules/css-modules) implementation
- URL resolving/rewriting with asset handling
- Ability to use `@import` statements inside regular CSS
- Built-in assets handler
- Ability to emit pure CSS for other plugins
- Complete code splitting support, with respect for multiple entries, `preserveModules` and `manualChunks`
- Multiple instances support, with check for already processed files
- Proper sourcemaps, with included sources content by default
- Respects `assetFileNames` for CSS file names
- Respects sourcemaps from loaded files
- Support for implementation forcing for Sass
- Support for partials and `~` in Less import statements

### PostCSS

PostCSS is a tool for transforming styles with JS plugins.
These plugins can lint your CSS, add support for variables and mixins, transpile future CSS syntax, inline images, and more.

Install all the necessary dependencies:

```sh
npm install --save-dev postcss postcss-load-config postcss-modules postcss-modules-extract-imports postcss-modules-local-by-default postcss-modules-scope postcss-modules-values postcss-value-parser icss-utils
```

```sh
yarn add -D postcss postcss-load-config postcss-modules postcss-modules-extract-imports postcss-modules-local-by-default postcss-modules-scope postcss-modules-values postcss-value-parser icss-utils
```

```sh
pnpm add -D postcss postcss-load-config postcss-modules postcss-modules-extract-imports postcss-modules-local-by-default postcss-modules-scope postcss-modules-values postcss-value-parser icss-utils
```

Add the loader to your `packem.config.ts`:

```typescript
import { defineConfig } from "@visulima/packem/config";
import postcssLoader from "@visulima/packem/css/loader/postcss";
import sourceMapLoader from "@visulima/packem/css/loader/sourcemap";
import transformer from "@visulima/packem/transformer/esbuild";

export default defineConfig({
    rollup: {
        css: {
            loaders: [postcssLoader, sourceMapLoader],
        },
    },
    transformer,
});
```

#### Sass

To use Sass, you need to install the `sass` package:

```sh
npm install --save-dev sass-embedded // recommended
// or
npm install --save-dev sass
// or
npm install --save-dev node-sass
```

```sh
yarn add -D sass-embedded // recommended
// or
yarn add -D sass
// or
yarn add -D node-sass
```

```sh
pnpm add -D sass-embedded // recommended
// or
pnpm add -D sass
// or
pnpm add -D node-sass
```

Add the loader to your `packem.config.ts`:

```typescript
import { defineConfig } from "@visulima/packem/config";
import postcssLoader from "@visulima/packem/css/loader/postcss";
import sassLoader from "@visulima/packem/css/loader/sass";
import sourceMapLoader from "@visulima/packem/css/loader/sourcemap";
import transformer from "@visulima/packem/transformer/esbuild";

export default defineConfig({
    rollup: {
        css: {
            loaders: [postcssLoader, sassLoader, sourceMapLoader],
        },
    },
    transformer,
});
```

#### Less

To use Less, you need to install the `less` package:

```sh
npm install --save-dev less
```

```sh
yarn add -D less
```

```sh
pnpm add -D less
```

Add the loader to your `packem.config.ts`:

```typescript
import { defineConfig } from "@visulima/packem/config";
import lessLoader from "@visulima/packem/css/loader/less";
import postcssLoader from "@visulima/packem/css/loader/postcss";
import sourceMapLoader from "@visulima/packem/css/loader/sourcemap";
import transformer from "@visulima/packem/transformer/esbuild";

export default defineConfig({
    rollup: {
        css: {
            loaders: [postcssLoader, lessLoader, sourceMapLoader],
        },
    },
    transformer,
});
```

#### Stylus

To use Stylus, you need to install the `stylus` package:

```sh
npm install --save-dev stylus
```

```sh
yarn add -D stylus
```

```sh
pnpm add -D stylus
```

Add the loader to your `packem.config.ts`:

```typescript
import { defineConfig } from "@visulima/packem/config";
import postcssLoader from "@visulima/packem/css/loader/postcss";
import sourceMapLoader from "@visulima/packem/css/loader/sourcemap";
import stylusLoader from "@visulima/packem/css/loader/stylus";
import transformer from "@visulima/packem/transformer/esbuild";

export default defineConfig({
    rollup: {
        css: {
            loaders: [postcssLoader, stylusLoader, sourceMapLoader],
        },
    },
    transformer,
});
```

After that you can import CSS/Sass/Less/Stylus files in your code:

```js
import "./styles.css";
```

Default mode is `inject`, which means CSS is embedded inside JS and injected into `<head>` at runtime, with ability to pass options to CSS injector or even pass your own injector.

CSS is available as default export in `inject` and `extract` modes, but if [CSS Modules](https://github.com/css-modules/css-modules) are enabled you need to use named `css` export.

```js
// Injects CSS, also available as `style` in this example
import style from "./style.css";
// Using named export of CSS string
import { css } from "./style.css";
```

In `emit` mode none of the exports are available as CSS is purely processed and passed along the build pipeline, which is useful if you want to preprocess CSS before using it with CSS consuming plugins, e.g. [rollup-plugin-lit-css](https://github.com/bennypowers/rollup-plugin-lit-css).

PostCSS configuration files will be found and loaded automatically, but this behavior is configurable using `config` option.

### Importing a file

#### CSS/Stylus

```css
/* Import from `node_modules` */
@import "bulma/css/bulma";
/* Local import */
@import "./custom";
/* ...or (if no package named `custom` in `node_modules`) */
@import "custom";
```

#### Sass/Less

You can prepend the path with `~` to resolve in `node_modules`:

```scss
// Import from `node_modules`
@import "~bulma/css/bulma";
// Local import
@import "./custom";
// ...or
@import "custom";
```

Also note that partials are considered first, e.g.

```scss
@import "custom";
```

Will look for `_custom` first (_with the appropriate extension(s)_), and then for `custom` if `_custom` doesn't exist.

### CSS Injection

```js
styles({
    mode: "inject", // Unnecessary, set by default
    // ...or with custom options for injector
    mode: ["inject", { attributes: { id: "global" }, container: "body", prepend: true, singleTag: true }],
    // ...or with custom injector
    mode: ["inject", (varname, id) => `console.log(${varname},${JSON.stringify(id)})`],
});
```

### CSS Extraction

```js
styles({
    mode: "extract",
    // ... or with relative to output dir/output file's basedir (but not outside of it)
    mode: ["extract", "awesome-bundle.css"],
});
```

### Metafile

Passing `--metafile` flag to tell `packem` to produce some metadata about the build in JSON format.
You can feed the output file to analysis tools like [bundle buddy](https://www.bundle-buddy.com/rollup) to visualize the modules in your bundle and how much space each one takes up.

The file outputs as metafile-{bundleName}-{format}.json, e.g. `packem` will generate metafile-test-cjs.json and metafile-test-es.json.

### onSuccess

You can specify command to be executed after a successful build, specially useful for **Watch mode**

```bash
packem build --watch --onSuccess "node dist/index.js"
```

`onSuccess` can also be a `function` that returns `Promise`. For this to work, you need to use `packem.config.ts` instead of the cli flag:

```ts
import { defineConfig } from "@visulima/packem/config";

export default defineConfig({
    // ...
    async onSuccess() {
        // Start some long running task
        // Like a server
    },
});
```

You can return a cleanup function in `onSuccess`:

```ts
import { defineConfig } from "@visulima/packem/config";

export default defineConfig({
    // ...
    onSuccess() {
        const server = http.createServer((request, res) => {
            res.end("Hello World!");
        });

        server.listen(3000);

        return () => {
            server.close();
        };
    },
});
```

## Configuration

### packem.config.js

The packem configuration file is a JavaScript file that exports an object with the following properties:

#### transformer

You choose which one of the three supported transformer to use.

- [esbuild](https://github.com/evanw/esbuild)
- [@swc/core](https://github.com/swc-project/swc)
- [sucrase](https://github.com/alangpierce/sucrase)
- [OXC](https://www.npmjs.com/package/oxc-transform)

### File types

Packem exports a `files.d.ts` file that contains all supported the types.

To shim the types, you can use the following:

```ts
/// <reference types="@visulima/packem/files" />
```

Alternatively, you can add `@visulima/packem/files` to `compilerOptions.types` inside `tsconfig.json`:

```json
{
    "compilerOptions": {
        "types": ["@visulima/packem/files"]
    }
}
```

This will provide the following type shims:

- Asset imports (e.g importing an `.svg`, `.module.css` file)

> Tip:
>
> To override the default typing, add a type definition file that contains your typings. Then, add the type reference before `@visulima/packem/files`.
>
> packem-env-override.d.ts (the file that contains your typings):
>
> ```ts
> declare module "*.svg" {
>     const content: React.FC<React.SVGProps<SVGElement>>;
>
>     export default content;
> }
> ```
>
> The file containing the reference to `@visulima/packem/files`:
>
> ```ts
> /// <reference types="./packem-env-override.d.ts" />
> /// <reference types="@visulima/packem/files" />
> ```

## Related

- [bunchee](https://github.com/huozhi/bunchee) - Zero config bundler for ECMAScript and TypeScript packages
- [unbuild](https://github.com/unjs/unbuild) - 📦 An unified javascript build system
- [pkgroll](https://github.com/privatenumber/pkgroll) - 📦 Zero-config package bundler for Node.js + TypeScript
- [siroc](https://github.com/danielroe/siroc) - Zero-config build tooling for Node
- [tsup](https://github.com/egoist/tsup) - The simplest and fastest way to bundle your TypeScript libraries
- [microbundle](https://github.com/developit/microbundle) - Zero-configuration bundler for tiny JS libs, powered by Rollup.

## Supported Node.js Versions

Libraries in this ecosystem make the best effort to track [Node.js’ release schedule](https://github.com/nodejs/release#release-schedule).
Here’s [a post on why we think this is important](https://medium.com/the-node-js-collection/maintainers-should-consider-following-node-js-release-schedule-ab08ed4de71a).

## Contributing

If you would like to help take a look at the [list of issues](https://github.com/visulima/visulima/issues) and check our [Contributing](.github/CONTRIBUTING.md) guild.

> **Note:** please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## Credits

- [Daniel Bannert](https://github.com/prisis)
- [All Contributors](https://github.com/visulima/visulima/graphs/contributors)

## License

The visulima pack is open-sourced software licensed under the [MIT][license-url]

[typescript-image]: https://img.shields.io/badge/Typescript-294E80.svg?style=for-the-badge&logo=typescript
[typescript-url]: "typescript"
[license-image]: https://img.shields.io/npm/l/@visulima/packem?color=blueviolet&style=for-the-badge
[license-url]: LICENSE.md "license"
[npm-image]: https://img.shields.io/npm/v/@visulima/packem/latest.svg?style=for-the-badge&logo=npm
[npm-url]: https://www.npmjs.com/package/@visulima/packem/v/latest "npm"
