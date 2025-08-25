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

The package provides multiple import patterns for maximum flexibility:

### Direct Named Imports
```typescript
import { arrayify, getHash, FileCache, Environment, Mode } from "@visulima/packem-share";

// Use utilities directly
const result = arrayify("single-value"); // ["single-value"]
const hash = getHash("content");
const cache = new FileCache("/path", "/cache", "key", logger);
```

### Module-based Imports
```typescript
import { constants, types, utils } from "@visulima/packem-share";

// Access grouped exports
const extensions = constants.DEFAULT_EXTENSIONS;
const mode: types.Mode = "build";
const normalized = utils.arrayify([1, 2, 3]);
```

### Namespace Imports
```typescript
import * as PackemShare from "@visulima/packem-share";

// Access everything through namespace
const result = PackemShare.arrayify("value");
const hash = PackemShare.getHash("content");
```

### Individual Module Imports
```typescript
import * as constants from "@visulima/packem-share/constants";
import * as types from "@visulima/packem-share/types";
import * as utils from "@visulima/packem-share/utils";

// Import specific modules
const extensions = constants.DEFAULT_EXTENSIONS;
const normalized = utils.arrayify("value");
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
  ALLOWED_TRANSFORM_EXTENSIONS_REGEX
} from "@visulima/packem-share";
```

### Types

TypeScript type definitions for the Packem ecosystem:

```typescript
import type { Environment, Mode, Format, Runtime } from "@visulima/packem-share";

type Environment = "production" | "development" | undefined;
type Mode = "build" | "jit" | "watch";
type Format = "cjs" | "esm";
type Runtime = "browser" | "bun" | "deno" | "edge-light" | "electron" | "node" | "react-native" | "react-server" | "workerd" | undefined;
```

### Utilities

#### Array Utilities
```typescript
import { arrayify, arrayIncludes } from "@visulima/packem-share";

// Convert single values to arrays
arrayify("single") // ["single"]
arrayify(["already", "array"]) // ["already", "array"]
arrayify(null) // []

// Array search with RegExp support
arrayIncludes(["test.js", "test.ts"], /\.ts$/) // true
```

#### File System Utilities
```typescript
import { 
  FileCache, 
  getChunkFilename, 
  getEntryFileNames,
  getHash 
} from "@visulima/packem-share";

// File caching
const cache = new FileCache(cwd, cachePath, hashKey, logger);
cache.set("key", data);
const cached = cache.get("key");

// Filename generation
const chunkName = getChunkFilename("chunk", hash, format);
const entryNames = getEntryFileNames(entries, format);

// Content hashing
const hash = getHash("file content");
```

#### String and Content Utilities
```typescript
import { 
  getPackageName,
  getRegexMatches,
  replaceContentWithinMarker,
  svgEncoder,
  svgToCssDataUri,
  svgToTinyDataUri,
  warn
} from "@visulima/packem-share";

// Package name extraction
getPackageName("@scope/package/path") // "@scope/package"
getPackageName("package/path") // "package"

// Regex utilities
const matches = getRegexMatches(/pattern/g, "text");

// Content replacement
const updated = replaceContentWithinMarker(content, "marker", newContent);

// SVG encoding and data URI generation
const encoded = svgEncoder(svgBuffer); // Base64 encoding
const cssUri = svgToCssDataUri(svgContent); // CSS-optimized data URI
const tinyUri = svgToTinyDataUri(svgContent); // Size-optimized data URI

// Warning utilities
warn(logger, "Warning message", "prefix");
```

#### Performance Utilities
```typescript
import { memoize, memoizeByKey } from "@visulima/packem-share";

// Function memoization
const memoized = memoize(expensiveFunction);
const keyMemoized = memoizeByKey(expensiveFunction)("cache-key");
```

#### Build System Utilities
```typescript
import { 
  enhanceRollupError,
  sortUserPlugins 
} from "@visulima/packem-share";

// Error enhancement
const enhanced = enhanceRollupError(error, context);

// Plugin sorting
const [pre, normal, post] = sortUserPlugins(plugins, hookName);
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

-   [Daniel Bannert](https://github.com/prisis)
-   [All Contributors](https://github.com/visulima/packem/graphs/contributors)

## License

The @visulima/packem-share is open-sourced software licensed under the [MIT][license-url]

[typescript-image]: https://img.shields.io/badge/Typescript-294E80.svg?style=for-the-badge&logo=typescript
[typescript-url]: "typescript"
[license-image]: https://img.shields.io/npm/l/@visulima/packem-share?color=blueviolet&style=for-the-badge
[license-url]: LICENSE.md "license"
[npm-image]: https://img.shields.io/npm/v/@visulima/packem-share/latest.svg?style=for-the-badge&logo=npm
[npm-url]: https://www.npmjs.com/package/@visulima/packem-share/v/latest "npm"
