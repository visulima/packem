# @visulima/rollup-css-plugin

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

- **Inject** - Embed CSS in JavaScript and inject at runtime
- **Extract** - Extract CSS to separate `.css` files
- **Emit** - Pass processed CSS through the build pipeline

### 🔤 TypeScript Support

- **CSS Modules Types** - Automatic TypeScript declaration generation for CSS modules
- **Type Safety** - Full IntelliSense support for CSS class names
- **Auto-Generated .d.ts** - Companion declaration files for CSS modules

## Installation

```bash
npm install --save-dev @visulima/rollup-css-plugin
```

Or with other package managers:

```bash
yarn add -D @visulima/rollup-css-plugin
```

```bash
pnpm add -D @visulima/rollup-css-plugin
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

The `@visulima/rollup-css-plugin` provides comprehensive CSS processing capabilities for Rollup and Packem builds.

### Basic CSS Processing

```typescript
import { rollupCssPlugin } from "@visulima/rollup-css-plugin";

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
import { rollupCssPlugin } from "@visulima/rollup-css-plugin";

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
import { rollupCssPlugin } from "@visulima/rollup-css-plugin";

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

### Tailwind CSS v4 with PostCSS

```typescript
import { rollupCssPlugin } from "@visulima/rollup-css-plugin";

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
import { rollupCssPlugin } from "@visulima/rollup-css-plugin";

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

### Inject Mode

Injects CSS directly into JavaScript at runtime. **Requires `@visulima/css-style-inject`:**

```typescript
rollupCssPlugin({
    mode: "inject", // CSS embedded in JS
    autoModules: true,
    minifier: "cssnano",
})
```

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
