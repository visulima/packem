<div align="center">
  <h3>@visulima/packem-share</h3>
  <p>
  Shared utilities, constants, and types for the Packem ecosystem
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

## About

`@visulima/packem-share` is a shared utility library that provides common functionality used across the Packem ecosystem. It eliminates code duplication by centralizing frequently used utilities, constants, and TypeScript types.

This package was created as part of a code deduplication effort that eliminated ~20KB of duplicate code across multiple Packem packages while maintaining full backward compatibility.

## Install

```sh
npm install @visulima/packem-share
```

```sh
yarn add @visulima/packem-share
```

```sh
pnpm add @visulima/packem-share
```

## Usage

All constants, types, and utilities are re-exported from the package root, and are
also available from dedicated subpath entry points.

### Named Imports (root)

```typescript
import { arrayify, getHash, FileCache } from "@visulima/packem-share";
import type { Environment, Mode } from "@visulima/packem-share";

// Use utilities directly
const result = arrayify("single-value"); // ["single-value"]
const hash = getHash("content");
const cache = new FileCache(cwd, cachePath, hashKey, logger);
```

### Namespace Import (root)

```typescript
import * as PackemShare from "@visulima/packem-share";

const result = PackemShare.arrayify("value");
const hash = PackemShare.getHash("content");
```

### Subpath Imports

Each group has its own entry point. These are flat re-exports (named exports), not
namespace objects, so import the specific names you need:

```typescript
import { arrayify, FileCache } from "@visulima/packem-share/utils";
import { DEFAULT_EXTENSIONS } from "@visulima/packem-share/constants";
import type { Mode } from "@visulima/packem-share/types";
```

## API Reference

### Constants

Core constants used throughout the Packem ecosystem:

```typescript
import {
    DEFAULT_EXTENSIONS,
    DEFAULT_LOADERS,
    PRODUCTION_ENV,
    DEVELOPMENT_ENV,
    RUNTIME_EXPORT_CONVENTIONS,
    SPECIAL_EXPORT_CONVENTIONS,
    EXCLUDE_REGEXP,
    ENDING_REGEX,
    CHUNKS_PACKEM_FOLDER,
    SHARED_PACKEM_FOLDER,
    ALLOWED_TRANSFORM_EXTENSIONS_REGEX,
} from "@visulima/packem-share";
```

### Types

TypeScript type definitions for the Packem ecosystem:

```typescript
import type { Environment, Mode, Format, Runtime } from "@visulima/packem-share";

type Environment = "development" | "production" | undefined;
type Mode = "build" | "jit" | "watch";
type Format = "cjs" | "esm";
type Runtime = "browser" | "bun" | "deno" | "edge-light" | "electron" | "node" | "react-native" | "react-server" | "workerd" | undefined;
```

Build-pipeline types are also exported: `BuildContext<T>`, `BuildHooks<T>`,
`BuildContextBuildEntry`, and `BuildContextBuildAssetAndChunk`.

### Utilities

#### Array Utilities

```typescript
import { arrayify } from "@visulima/packem-share";

// arrayify<T>(x: T | T[] | null | undefined): T[]
// Ensures the input is an array; null/undefined become an empty array.
arrayify("single"); // ["single"]
arrayify(["already", "array"]); // ["already", "array"]
arrayify(null); // []
```

#### File System Utilities

```typescript
import { FileCache, getChunkFilename, getEntryFileNames, getHash, getCacheHash } from "@visulima/packem-share";

// new FileCache(cwd: string, cachePath: string | undefined, hashKey: string, logger: RollupLogger)
const cache = new FileCache(cwd, cachePath, hashKey, logger);
cache.set("key", data, subDirectory?); // store (async write, swallows write errors)
cache.has("key", subDirectory?); // boolean
const cached = cache.get<MyType>("key", subDirectory?); // MyType | undefined
await cache.flush(); // await all in-flight disk writes before exit

// getChunkFilename(chunk: PreRenderedChunk, extension: string): string
const chunkName = getChunkFilename(chunk, "mjs");

// getEntryFileNames(chunkInfo: PreRenderedAsset, extension: string): string
const entryName = getEntryFileNames(chunkInfo, "mjs");

// getHash(data: NodeJS.ArrayBufferView | string): string  — SHA-256 hex (user-visible)
const hash = getHash("file content");

// getCacheHash(data: NodeJS.ArrayBufferView | string): string  — internal SHA-1 base64url cache key
const cacheKey = getCacheHash("id");
```

#### File Extension Utilities

```typescript
import { getOutputExtension, getDtsExtension } from "@visulima/packem-share";

// getOutputExtension<T>(context: BuildContext<T>, format: Format): string  → "js" | "mjs" | "cjs" ...
// getDtsExtension<T>(context: BuildContext<T>, format: Format): string     → "d.ts" | "d.mts" | "d.cts" ...
```

#### Import Specifier Utilities

```typescript
import { parseSpecifier, isBareSpecifier, isFromNodeModules, isOutsideProject } from "@visulima/packem-share";

// parseSpecifier(specifier: string): [packageName: string, subpath: string | undefined]
parseSpecifier("@org/pkg/sub"); // ["@org/pkg", "sub"]

// isBareSpecifier(id: string): boolean
isBareSpecifier("react"); // true
isBareSpecifier("./local"); // false

// isFromNodeModules(filePath: string, cwd?: string): boolean
// isOutsideProject(filePath: string, cwd?: string): boolean
```

#### String and Content Utilities

```typescript
import { getPackageName, getRegexMatches, replaceContentWithinMarker, svgEncoder, svgToCssDataUri, svgToTinyDataUri, warn } from "@visulima/packem-share";

// getPackageName(id?: string): string
getPackageName("@scope/package/path"); // "@scope/package"
getPackageName("package/path"); // "package"

// getRegexMatches(regex: RegExp, source: string): string[]
// Returns every match (a non-global regex is internally cloned with the `g` flag).
const matches = getRegexMatches(/from\s'.*';/g, source);

// replaceContentWithinMarker(content: string, marker: string, replacement: string): string | undefined
// Replaces text between <!-- marker --> and <!-- /marker -->; returns undefined if the marker is absent.
const updated = replaceContentWithinMarker(content, "marker", newContent);

// svgEncoder(buffer: Buffer): string  — cleans the SVG and returns base64
const encoded = svgEncoder(svgBuffer);
// svgToCssDataUri(svgString: string): string
const cssUri = svgToCssDataUri(svgContent);
// svgToTinyDataUri(svgString: string): string
const tinyUri = svgToTinyDataUri(svgContent);

// warn(context: { warnings: Set<string> }, message: string): void  — adds a message once
warn(context, "Warning message");
```

#### Performance Utilities

```typescript
import { memoize, memoizeByKey } from "@visulima/packem-share";

// memoize<T>(fn: T, cacheKey?: string | ((...args) => string), cache?: Map<string, ReturnType<T>>): Memoized<T>
// The returned function also has a `destroy()` method to clear its cache.
const memoized = memoize(expensiveFunction);
memoized.destroy();

// memoizeByKey<T>(fn: T): (cacheKey?) => Memoized<T>  — memoized variants sharing one cache
const keyMemoized = memoizeByKey(expensiveFunction)("cache-key");
```

#### Build System Utilities

```typescript
import { createRollupLogger, enhanceRollupError, sortUserPlugins } from "@visulima/packem-share";
import type { RollupLogger } from "@visulima/packem-share";

// createRollupLogger(context, pluginName: string): RollupLogger
// Wraps Rollup's logging methods and tags every entry with `plugin: pluginName`.
const logger = createRollupLogger(this, "my-plugin");

// enhanceRollupError(error: RollupError): void  — mutates the error in place (no return value)
enhanceRollupError(error);

// sortUserPlugins(plugins, type: "build" | "dts"): [pre, normal, post]
const [pre, normal, post] = sortUserPlugins(plugins, "build");
```

## Migration from Individual Packages

If you were previously importing utilities from `@visulima/packem` or `@visulima/packem-rollup`, you can now import them directly from this shared package:

```typescript
// Before
import { arrayify } from "@visulima/packem/utils";
import { getHash } from "@visulima/packem-rollup/utils";

// After
import { arrayify, getHash } from "@visulima/packem-share";
```

Note: The original packages still re-export these utilities for backward compatibility.

## Related

- [@visulima/packem](https://www.npmjs.com/package/@visulima/packem) - Modern JavaScript bundler
- [@visulima/packem-rollup](https://www.npmjs.com/package/@visulima/packem-rollup) - Rollup-based bundling utilities

## Supported Node.js Versions

Libraries in this ecosystem make the best effort to track [Node.js' release schedule](https://github.com/nodejs/release#release-schedule).
Here's [a post on why we think this is important](https://medium.com/the-node-js-collection/maintainers-should-consider-following-node-js-release-schedule-ab08ed4de71a).

## Contributing

If you would like to help take a look at the [list of issues](https://github.com/visulima/packem/issues) and check our [Contributing](.github/CONTRIBUTING.md) guidelines.

> **Note:** please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## Credits

- [Daniel Bannert](https://github.com/prisis)
- [All Contributors](https://github.com/visulima/packem/graphs/contributors)

## License

The @visulima/packem-share is open-sourced software licensed under the [MIT][license-url]

[typescript-image]: https://img.shields.io/badge/Typescript-294E80.svg?style=for-the-badge&logo=typescript
[typescript-url]: "typescript"
[license-image]: https://img.shields.io/npm/l/@visulima/packem-share?color=blueviolet&style=for-the-badge
[license-url]: LICENSE.md "license"
[npm-image]: https://img.shields.io/npm/v/@visulima/packem-share/latest.svg?style=for-the-badge&logo=npm
[npm-url]: https://www.npmjs.com/package/@visulima/packem-share/v/latest "npm"
