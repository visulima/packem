<div align="center">
  <h3>visulima css-style-inject</h3>
  <p>
  Inject style tag to document head.
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

```bash
npm install @visulima/css-style-inject
```

```bash
yarn add @visulima/css-style-inject
```

```bash
pnpm add @visulima/css-style-inject
```

## Example

```javascript
import { cssStyleInject } from "@visulima/css-style-inject";
const css = `
  body {
    margin: 0;
  }
`;
cssStyleInject(css, options);
```

### Usage with Next.js (SSR)

If using a library that uses `@visulima/css-style-inject` for CSS modules in Next.js,
you need to inject styles during SSR, here's an example:

```jsx
// file: pages/_document.js

import React from "react";
import { SSR_INJECT_ID } from "@visulima/css-style-inject";

const SSRInjectStyles = () => {
    if (!globalThis[SSR_INJECT_ID]) return null;

    return (
        <>
            {globalThis[SSR_INJECT_ID].map((module) => (
                // React escapes text children, so `<style>{module.css}</style>` would
                // turn `>` into `&gt;` and break the CSS. Use dangerouslySetInnerHTML
                // to emit the CSS verbatim.
                //
                // SECURITY: the CSS is injected as raw HTML. Only do this with CSS you
                // trust, and guard against a literal `</style>` sequence in the CSS
                // (e.g. reject/escape it) — otherwise it closes the tag early and
                // becomes an HTML-injection vector.
                <style id={module.id} key={module.id} dangerouslySetInnerHTML={{ __html: module.css }} />
            ))}
        </>
    );
};

const Document = (props) => {
    const { locale } = props;
    return (
        <Html lang={locale}>
            <Head>
                {/* Inject styles during ssr */}
                <SSRInjectStyles />
                {/* ... */}
            </Head>
            <body>{/* ... */}</body>
        </Html>
    );
};

export default Document;
```

## Options

### id

Type: `string`<br>
Default: `undefined`

Unique identifier for the style tag. Prevents duplicate injection: in the browser, if an element with the same `id` already exists in the document, injection is skipped; during SSR, a module with an already-seen `id` is not stored again.

### insertAt

Type: `number | 'first' | 'last' | { before: string }`<br>
Default: `'last'`

Where to insert the style tag:

- `number`: Insert at a specific index. `0` inserts as the first child. A negative number counts back from the end and resolves to `children.length + insertAt + 1`, so `-1` appends at the end (after the last child) and `-2` inserts before the last child. Out-of-range positive indices append at the end.
- `'first'`: Insert as first child
- `'last'`: Insert as last child (default)
- `{ before: 'selector' }`: Insert before the element matching the CSS selector (searched within the container). If no element matches, the style tag is appended at the end instead. An invalid selector throws.

### singleTag

Type: `boolean`<br>
Default: `false`

Whether to reuse a single style tag for multiple injections with the same configuration.

The cached tag is keyed by the resolved container element **and** the `insertAt` value. Because the tag is created only on the first matching call, the `attributes`, `id`, and `nonce` of later calls that reuse it are ignored — only the CSS of later calls is appended to the existing tag.

### container

Type: `string`<br>
Default: `undefined`

CSS selector for the container element. Defaults to `head` if not specified. If the selector matches no element, an error is thrown (the error message includes the selector).

### attributes

Type: `Record<string, string>`<br>
Default: `undefined`

Additional attributes to set on the style tag.

Reserved keys are dropped and cannot be set through this map: `id`, `type`, and `nonce` (these are controlled by the dedicated `id` / `nonce` options), as well as any event-handler attribute matching `on*` (e.g. `onload`, `onclick`) — rejected so the map can never create an executable handler.

### nonce

Type: `string`<br>
Default: `undefined`

Nonce value for CSP (Content Security Policy) compliance.

## Supported Node.js Versions

This library supports the following Node.js versions:

- 22.x (>= 22.22.2)
- 24.x (>= 24.10.0)

## Contributing

If you would like to help take a look at the [list of issues](https://github.com/visulima/packem/issues) and check our [Contributing](.github/CONTRIBUTING.md) guidelines.

> **Note:** please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## Credits

- [Daniel Bannert](https://github.com/prisis)
- [All Contributors](https://github.com/visulima/packem/graphs/contributors)

## License

The visulima css-style-inject is open-sourced software licensed under the [MIT](LICENSE.md)
