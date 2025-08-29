# @visulima/rollup-plugin-css

A comprehensive CSS processing plugin for [Packem](https://github.com/visulima/packem) that provides support for multiple CSS preprocessors, CSS modules, and advanced optimization features.

## Features

### 🎨 CSS Preprocessors

- **PostCSS** - Modern CSS transformations with plugin ecosystem
- **Sass/SCSS** - Popular CSS extension language
- **Less** - Dynamic stylesheet language
- **Stylus** - Expressive, dynamic, robust CSS
- **Tailwind CSS v4** - Latest Tailwind CSS with PostCSS integration
- **Tailwind Oxide** - Next-generation Tailwind CSS with Rust-based engine

### 🔧 CSS Processing

- **CSS Modules** - Localized CSS with automatic class name generation
- **CSS Minification** - Using cssnano or LightningCSS
- **Source Maps** - Full source map support for debugging
- **Auto-prefixing** - Automatic vendor prefix handling

### 📦 Integration Modes

- **Inject** - Embed CSS in JavaScript and inject at runtime (with customizable package and method)
- **Extract** - Extract CSS to separate `.css` files
- **Emit** - Pass processed CSS through the build pipeline
- **Inline** - Embed CSS as strings in JavaScript modules

### 🔤 TypeScript Support

- **CSS Modules Types** - Automatic TypeScript declaration generation for CSS modules
- **Type Safety** - Full IntelliSense support for CSS class names
- **Auto-Generated .d.ts** - Companion declaration files for CSS modules

## Installation

```bash
npm install --save-dev @visulima/rollup-plugin-css
```

Or with other package managers:

```bash
yarn add -D @visulima/rollup-plugin-css
```

```bash
pnpm add -D @visulima/rollup-plugin-css
```

### Peer Dependencies

Install the CSS processors you need:

```bash
# PostCSS (recommended)
npm install postcss

# Sass/SCSS
npm install sass-embedded

# Less
npm install less

# Stylus
npm install stylus

# LightningCSS (for fast processing and minification)
npm install lightningcss

# cssnano (for CSS minification)
npm install cssnano

# Tailwind CSS v4 (PostCSS-based)
npm install tailwindcss @tailwindcss/postcss

# Tailwind Oxide (Rust-based engine)
npm install @tailwindcss/node @tailwindcss/oxide

# CSS Style Injection (required for inject mode)
npm install @visulima/css-style-inject
```

## Usage

The `@visulima/rollup-plugin-css` provides comprehensive CSS processing capabilities for Rollup and Packem builds.

### Basic CSS Processing

```typescript
import { rollupCssPlugin } from "@visulima/rollup-plugin-css";

export default {
  plugins: [
    rollupCssPlugin({
      // Extract CSS to separate files
      mode: "extract",

      // Enable CSS modules for .module.css files
      autoModules: /\.module\./,

      // Enable source maps
      sourceMap: true,

      // CSS minification
      minifier: "cssnano",
    })
  ]
};
```

### Multiple Preprocessors

```typescript
import { rollupCssPlugin } from "@visulima/rollup-plugin-css";

export default {
  plugins: [
    rollupCssPlugin({
      // File extensions to process
      extensions: [".css", ".scss", ".sass", ".less", ".styl"],

      // CSS Modules configuration
      autoModules: true,
      namedExports: true,

      // PostCSS configuration
      postcss: {
        plugins: [
          require("autoprefixer"),
          require("tailwindcss"),
        ],
        modules: {
          generateScopedName: "[name]__[local]___[hash:base64:5]",
        },
      },

      // Sass configuration
      sass: {
        includePaths: ["node_modules"],
        outputStyle: "compressed",
      },

      // Minification
      minifier: "lightningcss",
    })
  ]
};
```

### CSS Injection Mode

**Note:** Inject mode requires `@visulima/css-style-inject` to be installed.

```typescript
import { rollupCssPlugin } from "@visulima/rollup-plugin-css";

export default {
  plugins: [
    rollupCssPlugin({
      // Inject CSS into JavaScript
      mode: "inject",

      // Enable CSS modules
      autoModules: true,

      // PostCSS with autoprefixer
      postcss: {
        plugins: [require("autoprefixer")],
      },

      // Minification
      minifier: "cssnano",
    })
  ]
};
```

#### Custom Injection Package and Method

You can customize the CSS injection by specifying a custom package and method:

```typescript
rollupCssPlugin({
    mode: ["inject", {
        // Use your own CSS injection library
        package: "my-custom-injector",
        method: "injectCSS",

        // Other inject options...
        container: "body",
        prepend: true,
    }],
    autoModules: true,
})
```

This allows you to:
- Use alternative CSS injection libraries
- Implement custom injection logic
- Override the default `@visulima/css-style-inject` behavior

### Tailwind CSS v4 with PostCSS

```typescript
import { rollupCssPlugin } from "@visulima/rollup-plugin-css";

export default {
  plugins: [
    rollupCssPlugin({
      mode: "extract",
      autoModules: true,
      postcss: {
        plugins: [
          require("@tailwindcss/postcss"),
          require("autoprefixer"),
        ],
      },
      minifier: "cssnano",
    })
  ]
};
```

```javascript
// postcss.config.js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}
```

### Tailwind Oxide (Rust-based)

```typescript
import { rollupCssPlugin } from "@visulima/rollup-plugin-css";

export default {
  plugins: [
    rollupCssPlugin({
      mode: "extract",
      autoModules: true,
      // Tailwind Oxide configuration
      tailwind: {
        oxide: true,
        config: "./tailwind.config.js",
      },
      minifier: "cssnano",
    })
  ]
};
```

### Inline Mode

Embed CSS directly as strings in JavaScript modules. This reduces HTTP requests but increases bundle size. Ideal for small CSS files or critical CSS that needs to be available immediately.

```typescript
import { rollupCssPlugin } from "@visulima/rollup-plugin-css";

export default {
  plugins: [
    rollupCssPlugin({
      mode: "inline",
      autoModules: true,
      namedExports: true,
      minifier: "cssnano",
    })
  ]
};
```

**Benefits:**
- **Zero HTTP requests** - CSS is embedded directly in JavaScript
- **No race conditions** - CSS is available immediately when JavaScript executes
- **Smaller initial bundle** - No separate CSS file to load
- **Better caching** - CSS is cached with JavaScript bundle

**Trade-offs:**
- **Increased bundle size** - CSS content is included in JavaScript
- **No separate caching** - CSS can't be cached independently
- **Larger JavaScript** - Affects JavaScript parsing and execution time

**Use cases:**
- Critical CSS that must be available immediately
- Small CSS files where the overhead of a separate request isn't worth it
- Applications where CSS is dynamically generated or modified at runtime
- Components that need their CSS to be self-contained

```css
/* Input: styles.css */
.button {
    background: blue;
    color: white;
    padding: 10px 20px;
}
```

```javascript
// Output: JavaScript module with embedded CSS
var css = ".button{background:blue;color:white;padding:10px 20px;}";

export { css };
export default css;
```

## Examples

### CSS Modules with React

```css
/* src/index.module.css */
.test {
    color: red;
}

.container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    width: 100vw;
}
```

```typescript
/* src/index.tsx */
import styles from "./index.module.css";

const Container = () => {
    return (
        <div className={styles.container}>
            <div className={styles.test}>
                <h1>Hello World</h1>
            </div>
        </div>
    );
};

export default Container;
```

The plugin automatically generates TypeScript declarations:

```typescript
/* src/index.module.css.d.ts */
declare const css: string;
declare const test: "index_test_bcd2d774";
declare const container: "index_container_bcd2d774";

interface ModulesExports {
  'test': string;
  'container': string;
}

declare const modules_c21c94f2: ModulesExports;

export default modules_c21c94f2;

export {
  css,
  test,
  container
};
```

### Multiple CSS Preprocessors

```javascript
/* src/index.js */
import foo from "./foo.css" with { type: "css" };
import bar from "./bar.css";
import "./style.styl";
import "./style.pcss";
import "./style.sass";
import "./style.scss";
import "./style.less";

console.log(foo, bar);
```

Supports all major CSS preprocessors:

- **Stylus** (`.styl`)
- **PostCSS** (`.pcss`)
- **Sass** (`.sass`, `.scss`)
- **Less** (`.less`)

### Tailwind CSS v4 Integration

```css
/* src/styles.css */
@import "tailwindcss";
```

```typescript
/* src/index.tsx */
import "./styles.css";

const Container = () => {
    return (
        <div className="bg-red-500 h-32">
            <h1>Hello World</h1>
        </div>
    );
};

export default Container;
```

### Tailwind Oxide Integration

Using the Rust-based engine for ultra-fast processing:

```css
/* src/styles.css */
@import "tailwindcss";
```

The Oxide loader provides:

- **Ultra-fast compilation** with Rust-based engine
- **Just-in-time processing** for optimal bundle sizes
- **Smart content detection** and automatic purging

## API Reference

### rollupCssPlugin(options)

Main CSS processing plugin for Rollup.

#### Core Options

- `mode` - Processing mode: `"inject"` | `"extract"` | `"emit"`
- `extensions` - File extensions to process
- `include/exclude` - File inclusion/exclusion patterns
- `autoModules` - Enable CSS modules automatically
- `namedExports` - Enable named exports for CSS classes

#### Preprocessor Options

- `postcss` - PostCSS configuration and plugins
- `sass` - Sass/SCSS compiler options
- `less` - Less compiler options
- `stylus` - Stylus compiler options
- `tailwind` - Tailwind CSS configuration

#### Output Options

- `sourceMap` - Source map generation
- `minifier` - CSS minification strategy: `"cssnano"` | `"lightningcss"`
- `dts` - Generate TypeScript declaration files

## Configuration Modes

### Extract Mode

Extracts CSS into separate `.css` files:

```typescript
rollupCssPlugin({
    mode: "extract", // Creates separate CSS files
    autoModules: true,
    minifier: "cssnano",
})
```

**Benefits:**
- **Separate caching** - CSS can be cached independently from JavaScript
- **Parallel loading** - CSS and JavaScript can load simultaneously
- **Better performance** - Smaller JavaScript bundles, faster parsing
- **CDN optimization** - CSS can be served from CDN with different cache strategies
- **Selective loading** - Only load CSS for specific routes or components

**Trade-offs:**
- **Additional HTTP requests** - Separate CSS file must be fetched
- **Potential FOUC** - Flash of unstyled content if CSS loads after HTML
- **Build complexity** - Requires additional build step for CSS extraction
- **Dependency management** - Need to ensure CSS is loaded before JavaScript execution

**Use cases:**
- Large CSS files where separate caching is beneficial
- Applications with multiple CSS themes or variants
- Production builds where performance optimization is critical
- CDN-based deployments requiring separate asset optimization
- Applications where CSS needs to be loaded conditionally

### Inject Mode

Injects CSS directly into JavaScript at runtime. **Requires `@visulima/css-style-inject`:**

```typescript
rollupCssPlugin({
    mode: "inject", // CSS embedded in JS
    autoModules: true,
    minifier: "cssnano",
})
```

**Benefits:**
- **No separate HTTP requests** - CSS is bundled with JavaScript
- **Guaranteed availability** - CSS is always available when JavaScript executes
- **Simplified deployment** - Single JavaScript bundle to manage
- **Dynamic injection** - CSS can be injected conditionally or on-demand
- **Runtime control** - Full control over when and how CSS is applied

**Trade-offs:**
- **Larger JavaScript bundles** - CSS content increases JavaScript file size
- **Slower initial parsing** - JavaScript engine must process CSS content
- **No separate caching** - CSS can't be cached independently from JavaScript
- **Memory usage** - CSS content remains in JavaScript memory

**Use cases:**
- Single-page applications (SPAs) where CSS is always needed
- Applications requiring dynamic CSS injection
- Development builds where simplicity is preferred
- Applications with complex CSS loading logic
- Components that need guaranteed CSS availability

#### Advanced Inject Configuration

You can customize the injection behavior by passing an object to the `mode` option:

```typescript
rollupCssPlugin({
    mode: ["inject", {
        // Custom package to import the injector from
        package: "my-custom-css-injector",

        // Custom method name to import
        method: "injectStyles",

        // Container for style injection (default: "head")
        container: "body",

        // Insert styles at the beginning of container
        prepend: true,

        // Use single style tag
        singleTag: true,

        // Custom attributes for style tag
        attributes: { "data-theme": "dark" },

        // Make injector treeshakeable
        treeshakeable: true,
    }],
    autoModules: true,
    minifier: "cssnano",
})
```

**Custom Package and Method:**
- **`package`**: Override the default `@visulima/css-style-inject` package
- **`method`**: Override the default `cssStyleInject` method name
- **Use case**: When you want to use your own CSS injection library or have custom injection logic

### Inline Mode

Embeds CSS directly as strings in JavaScript modules:

```typescript
rollupCssPlugin({
    mode: "inline", // CSS embedded as strings in JS
    autoModules: true,
    namedExports: true,
    minifier: "cssnano",
})
```

**When to use inline mode:**
- Small CSS files where HTTP request overhead isn't worth it
- Critical CSS that must be available immediately
- Applications with dynamic CSS generation
- Components that need self-contained styles

### Emit Mode

Passes processed CSS through the build pipeline without injection or extraction:

```typescript
rollupCssPlugin({
    mode: "emit", // CSS passed through build pipeline
    autoModules: true,
    minifier: "cssnano",
})
```

**Benefits:**
- **Build pipeline integration** - CSS can be processed by other Rollup plugins
- **Flexible output** - CSS can be transformed, bundled, or processed further
- **Custom handling** - Full control over how CSS is processed and output
- **Plugin ecosystem** - Leverage other Rollup plugins for CSS processing
- **No assumptions** - Plugin doesn't make assumptions about CSS output

**Trade-offs:**
- **Manual handling required** - Need to configure other plugins to handle CSS
- **Build complexity** - Requires understanding of Rollup plugin pipeline
- **No automatic optimization** - CSS optimization must be handled separately
- **Configuration overhead** - More setup required for complete CSS handling

**Use cases:**
- Custom CSS processing pipelines
- Integration with other Rollup plugins
- Applications requiring specific CSS output formats
- Build systems with custom CSS handling logic
- Development of CSS processing tools and plugins

## Mode Comparison

| Mode | Best For | Bundle Size | HTTP Requests | Caching | Complexity |
|------|----------|-------------|---------------|---------|------------|
| **Inject** | SPAs, dynamic injection | Larger JS | Single | Shared | Low |
| **Extract** | Production, CDN | Smaller JS | Multiple | Separate | Medium |
| **Inline** | Small files, critical CSS | Larger JS | Single | Shared | Low |
| **Emit** | Custom pipelines | Variable | Variable | Custom | High |

**Quick Decision Guide:**
- **Choose Inject** when you need guaranteed CSS availability and don't mind larger JS bundles
- **Choose Extract** when performance and caching are critical, especially for production
- **Choose Inline** when you have small CSS files and want to eliminate HTTP requests
- **Choose Emit** when you need full control over CSS processing and output

## CSS Modules Features

CSS Modules provide automatic class name scoping and TypeScript integration:

### Automatic TypeScript Declarations
- **Generated .d.ts files** for full IntelliSense support
- **Named exports** for individual class names
- **Default export** with complete module interface
- **Build-time type checking** prevents runtime errors

### Scoped Class Names
- **Automatic hashing** prevents style conflicts
- **Deterministic naming** for consistent builds
- **Development-friendly** class names for debugging

### Integration Benefits
- **Zero configuration** - works out of the box with `.module.css` files
- **Watch mode support** - declarations update automatically
- **Build pipeline integration** - seamless Rollup integration

## Key Features

### Tailwind Integration
- **Tailwind CSS v4** - Latest version with PostCSS integration
- **Tailwind Oxide** - Rust-based engine for ultra-fast processing
- **JIT compilation** - Generate only the CSS you use
- **Smart purging** - Automatic unused style removal

### Preprocessor Support
- **PostCSS** - Modern CSS transformations with extensive plugin ecosystem
- **Sass/SCSS** - Popular CSS extension language with variables and mixins
- **Less** - Dynamic stylesheet language with variables and functions
- **Stylus** - Expressive, dynamic CSS preprocessor

### Performance Optimization
- **Multiple minifiers** - Choose between cssnano and LightningCSS
- **Source maps** - Full debugging support in development
- **Code splitting** - Efficient CSS bundling strategies
- **Asset optimization** - Automatic CSS optimization and compression

## PostCSS Integration

Leverage the extensive PostCSS ecosystem through configuration files:

```javascript
// postcss.config.js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
    "autoprefixer": {},
    "postcss-nested": {},
  },
}
```

The PostCSS loader automatically detects and uses your PostCSS configuration.

## License

MIT © [Daniel Bannert](https://github.com/prisis)
