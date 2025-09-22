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

### Data URI Plugin

The `dataUriPlugin` converts files to data URIs for inline embedding. It supports configurable SVG encoding strategies via query parameters.

```typescript
import { dataUriPlugin } from "@visulima/packem-rollup";

export default {
    plugins: [dataUriPlugin()],
};
```

#### Query Parameters

- `?data-uri` - Basic data URI conversion
- `?data-uri&encoding=css` - Use CSS-optimized SVG encoding
- `?data-uri&encoding=tiny` - Use tiny SVG encoding (default)
- `?data-uri&srcset` - Encode spaces as %20 for srcset compatibility

#### Examples

```typescript
// Tiny SVG encoding (default)
import icon from "./icon.svg?data-uri";

// CSS-optimized SVG encoding
import icon from "./icon.svg?data-uri&encoding=css";

// Tiny SVG with srcset compatibility
import icon from "./icon.svg?data-uri&srcset";

// CSS encoding with srcset compatibility
import icon from "./icon.svg?data-uri&encoding=css&srcset";
```

### Lazy Barrel Plugin

The `lazyBarrelPlugin` implements lazy barrel optimization similar to Rspack's `lazyBarrel` experiment. It identifies side-effect-free barrel files and marks their re-export dependencies as lazy, only building them when their exports are actually requested.

```typescript
import { lazyBarrelPlugin } from "@visulima/packem-rollup";

export default {
    plugins: [
        lazyBarrelPlugin({
            sideEffectsCheck: true,
            lazyThreshold: 2,
            include: [/\.ts$/, /\.js$/],
            exclude: [/\.test\.ts$/],
        }),
    ],
};
```

#### Features

- **Barrel Detection**: Automatically identifies files with multiple re-exports
- **Side Effects Checking**: Reads package.json to check `sideEffects` field
- **Lazy Loading**: Generates lazy loading code for unused exports
- **Configurable Threshold**: Set minimum exports to consider a file as a barrel
- **Filtering**: Include/exclude specific file patterns

#### How It Works

1. **Analysis**: Parses module code to detect barrel export patterns
2. **Side Effects Check**: Verifies if the module is marked as side-effect-free
3. **Lazy Marking**: Marks re-export dependencies as lazy for deferred building
4. **Code Generation**: Creates lazy loading wrappers for unused exports
5. **Optimization**: Only builds modules when their exports are actually requested

### URL Plugin

The `urlPlugin` handles asset URLs, either inlining them as data URIs or copying them to a destination directory. SVG files are optimized using the shared `svgEncoder` utility before being base64 encoded.

```typescript
import { urlPlugin } from "@visulima/packem-rollup";

export default {
    plugins: [
        urlPlugin({
            limit: 14336, // 14kb
            fileName: "[hash][extname]",
        }),
    ],
};
```

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
