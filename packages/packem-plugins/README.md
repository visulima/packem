<div align="center">

<h1>@visulima/packem-plugins</h1>

Bundler-agnostic custom plugins for [packem](https://github.com/visulima/packem),
shared by the rollup and rolldown backends.

</div>

---

## About

This package holds packem's own custom plugins and transformer adapters — the
ones that no bundler ships built-in (copy, raw, url, shebang, license,
debarrel, externals, chunk-splitter, the babel/esbuild/swc/oxc/sucrase
transformer adapters, the TypeScript resolvers, etc.).

It is consumed by **both** packem bundler backends. The thin wrappers around
the `@rollup/*` ecosystem (commonjs, node-resolve, alias, replace,
dynamic-import-vars, inject, wasm, json) and the rollup-only `cjs-interop`
plugin remain in [`@visulima/packem-rollup`](../packem-rollup), since rolldown
ships built-in equivalents for those.

## License

The visulima packem-plugins is open-sourced software licensed under the [MIT][license-url]

[license-url]: https://github.com/visulima/packem/blob/main/LICENSE.md
