<div align="center">
  <h3>visulima packem-rollup</h3>
  <p>
  Rollup plugins for packem
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

## Install

```sh
npm install @visulima/packem-rollup
```

```sh
yarn add @visulima/packem-rollup
```

```sh
pnpm add @visulima/packem-rollup
```

## Usage

This package bundles the Rollup plugins that power packem. They are also reused as
the rolldown `renderChunk` ports, so the directive/JSX/pure passes behave the same
under both bundlers. The plugins are exported from the package root and from
per-plugin subpath entries.

### Preserve Directives

`preserveDirectivesPlugin` hoists module-level directives (`"use client"`,
`"use server"`, …) and shebangs to the top of the emitted chunk.

```typescript
import { preserveDirectivesPlugin } from "@visulima/packem-rollup";

export default {
    plugins: [
        preserveDirectivesPlugin({
            directiveRegex: /^use (client|server)$/,
            logger: console,
        }),
    ],
};
```

### CJS Interop

`cjsInteropPlugin` rewrites the entry chunk's `exports.default` /
`exports.<name>` assignments to `module.exports` for `format: "cjs"` +
`exports: "auto"` output, so `require()` returns the default export directly.

```typescript
import { cjsInteropPlugin } from "@visulima/packem-rollup/plugin/cjs-interop";

export default {
    plugins: [cjsInteropPlugin({ addDefaultProperty: false, logger: console })],
};
```

### JSX Remove Attributes

`jsxRemoveAttributes` strips configured attributes (e.g. `data-testid`) from
automatic-runtime JSX calls (`jsx`/`jsxs`/`jsxDEV`).

```typescript
import { jsxRemoveAttributes } from "@visulima/packem-rollup";

export default {
    plugins: [jsxRemoveAttributes({ attributes: ["data-testid"], logger: console })],
};
```

### Pure New Expression

`pureNewExpressionPlugin` adds `/* @__PURE__ */` annotations to configured
constructor instantiations (and, in `renderChunk` mode, function calls) so
consumers can tree-shake them.

```typescript
import { pureNewExpressionPlugin } from "@visulima/packem-rollup";

export default {
    plugins: [pureNewExpressionPlugin({ constructors: ["WeakMap", "Map"] })],
};
```

### Chunk Splitter

`chunkSplitter` controls how shared code is split into chunks.

```typescript
import { chunkSplitter } from "@visulima/packem-rollup";

export default {
    plugins: [chunkSplitter()],
};
```

### JSON

`JsonPlugin` wraps `@rollup/plugin-json` and rewrites the emitted
`export default <json>` to `module.exports = <json>` for CJS interop.

```typescript
import { JsonPlugin } from "@visulima/packem-rollup/plugin/json";

export default {
    plugins: [JsonPlugin({})],
};
```

### Transformer adapters (esbuild / swc / sucrase)

The TypeScript/JSX transformer adapters are exported from dedicated subpaths.

```typescript
import esbuildTransformer from "@visulima/packem-rollup/esbuild";
import swcPlugin from "@visulima/packem-rollup/swc";
import { sucrasePlugin } from "@visulima/packem-rollup/sucrase";
```

`browserslistToEsbuild` (root export) converts a Browserslist query into esbuild
`target` strings:

```typescript
import { browserslistToEsbuild } from "@visulima/packem-rollup";

const target = browserslistToEsbuild(["chrome 100", "ios_saf 15"]);
// → ["chrome100", "ios15"]
```

### Re-exported Rollup plugins

For convenience the package also re-exports a curated set of upstream Rollup
plugins under their conventional names: `alias`, `commonjs`, `dynamicImportVars`
(with `RollupDynamicImportVariablesOptions`), `inject`, `replace`, `wasm`,
`polyfillNode`, `purePlugin`, `visualizer`, and `importTrace`. See
[`src/index.ts`](./src/index.ts) for the full export surface.

## Related

## Supported Node.js Versions

Libraries in this ecosystem make the best effort to track [Node.js’ release schedule](https://github.com/nodejs/release#release-schedule).
Here’s [a post on why we think this is important](https://medium.com/the-node-js-collection/maintainers-should-consider-following-node-js-release-schedule-ab08ed4de71a).

## Contributing

If you would like to help take a look at the [list of issues](https://github.com/visulima/packem/issues) and check our [Contributing](.github/CONTRIBUTING.md) guidelines.

> **Note:** please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## Credits

- [Daniel Bannert](https://github.com/prisis)
- [All Contributors](https://github.com/visulima/packem/graphs/contributors)

## License

The visulima packem-rollup is open-sourced software licensed under the [MIT][license-url]

[typescript-image]: https://img.shields.io/badge/Typescript-294E80.svg?style=for-the-badge&logo=typescript
[typescript-url]: "typescript"
[license-image]: https://img.shields.io/npm/l/@visulima/packem-rollup?color=blueviolet&style=for-the-badge
[license-url]: LICENSE.md "license"
[npm-image]: https://img.shields.io/npm/v/@visulima/packem-rollup/latest.svg?style=for-the-badge&logo=npm
[npm-url]: https://www.npmjs.com/package/@visulima/packem-rollup/v/latest "npm"
