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
                <style id={module.id} key={module.id}>
                    {module.css}
                </style>
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

Unique identifier for the style tag. Prevents duplicate injection during SSR hydration.

### insertAt

Type: `number | 'first' | 'last' | { before: string }`<br>
Default: `'last'`

Where to insert the style tag:

- `number`: Insert at specific index (0 = first, -1 = last)
- `'first'`: Insert as first child
- `'last'`: Insert as last child (default)
- `{ before: 'selector' }`: Insert before element matching CSS selector

### singleTag

Type: `boolean`<br>
Default: `false`

Whether to reuse a single style tag for multiple injections with the same configuration.

### container

Type: `string`<br>
Default: `undefined`

CSS selector for the container element. Defaults to `head` if not specified.

### attributes

Type: `Record<string, string>`<br>
Default: `undefined`

Additional attributes to set on the style tag.

### nonce

Type: `string`<br>
Default: `undefined`

Nonce value for CSP (Content Security Policy) compliance.

## Supported Node.js Versions

This library supports the following Node.js versions:

- 20.x
- 22.x
- 24.x

## Contributing

If you would like to help take a look at the [list of issues](https://github.com/visulima/packem/issues) and check our [Contributing](.github/CONTRIBUTING.md) guidelines.

> **Note:** please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## Credits

- [Daniel Bannert](https://github.com/prisis)
- [All Contributors](https://github.com/visulima/packem/graphs/contributors)

## License

The visulima css-style-inject is open-sourced software licensed under the [MIT](LICENSE.md)
