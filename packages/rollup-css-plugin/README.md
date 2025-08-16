# @visulima/rollup-css-plugin

A comprehensive CSS processing plugin for [Packem](https://github.com/visulima/packem) that provides support for multiple CSS preprocessors, CSS modules, and advanced optimization features.

## Features

### 🎨 CSS Preprocessors
- **PostCSS** - Modern CSS transformations with plugin ecosystem
- **Sass/SCSS** - Popular CSS extension language
- **Less** - Dynamic stylesheet language
- **Stylus** - Expressive, dynamic, robust CSS
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
npm install @visulima/rollup-css-plugin
```

### Peer Dependencies

Install the CSS processors you need:

```bash
# PostCSS (recommended)
npm install postcss

# Sass/SCSS
npm install sass

# Less
npm install less

# Stylus
npm install stylus

# LightningCSS (for fast processing and minification)
npm install lightningcss

# cssnano (for CSS minification)
npm install cssnano

# Tailwind Oxide (for Tailwind CSS processing)
npm install @tailwindcss/node @tailwindcss/oxide
```

## Usage

### Basic Usage

```typescript
import { rollupCssPlugin, cssModulesTypesPlugin } from "@visulima/rollup-css-plugin";

export default {
  plugins: [
    rollupCssPlugin({
      // Extract CSS to separate files
      mode: "extract",

      // Enable CSS modules for .module.css files
      autoModules: /\.module\./,

      // Enable source maps
      sourceMap: true,
    }),
    
    // Generate TypeScript declarations for CSS modules
    cssModulesTypesPlugin({
      // CSS processing options (same as rollupCssPlugin)
      autoModules: /\.module\./,
      postcss: {
        modules: true,
      },
    }, process.cwd(), logger)
  ]
};
```

### Advanced Configuration

```typescript
import { rollupCssPlugin, cssModulesTypesPlugin } from "@visulima/rollup-css-plugin";

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

      // Custom loaders
      loaders: [
        {
          name: "postcss",
          test: /\.css$/,
        },
        {
          name: "sass",
          test: /\.s[ac]ss$/,
        },
      ],
    }),

    // Generate TypeScript declarations for CSS modules
    cssModulesTypesPlugin({
      autoModules: true,
      postcss: {
        modules: {
          generateScopedName: "[name]__[local]___[hash:base64:5]",
        },
      },
    }, process.cwd())
  ]
};
```

## API Reference

### rollupCssPlugin(options)

Main CSS processing plugin for Rollup/Packem.

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
- `tailwindcss` - Tailwind Oxide configuration options

#### Output Options

- `sourceMap` - Source map generation
- `minifier` - CSS minification strategy
- `dts` - Generate TypeScript declaration files

### cssModulesTypesPlugin(options, rootDirectory, logger)

TypeScript declaration generator for CSS modules.

#### Parameters

- `options` - CSS processing options (same as `rollupCssPlugin`)
- `rootDirectory` - Root directory for relative path resolution
- `logger` - Logger instance for build messages

#### Supported Options

- `autoModules` - CSS modules detection pattern
- `postcss.modules` - PostCSS modules configuration
- `lightningcss.modules` - LightningCSS modules configuration

The plugin automatically generates `.d.ts` files alongside your CSS modules with proper TypeScript declarations.

## CSS Modules

Enable CSS modules for better component isolation:

```css
/* styles.module.css */
.button {
  background: blue;
  color: white;
}

.primary {
  background: green;
}
```

```typescript
import styles from "./styles.module.css";

// Use the generated class names
console.log(styles.button); // "styles__button___2J3K9"
console.log(styles.primary); // "styles__primary___1A2B3"
```

## CSS Modules TypeScript Declarations

The `cssModulesTypesPlugin` plugin automatically generates TypeScript declaration files for your CSS modules, providing full type safety and IntelliSense support.

### Automatic .d.ts Generation

When you have a CSS module file:

```css
/* Button.module.css */
.container {
  display: flex;
  align-items: center;
}

.primary {
  background-color: blue;
}

.secondary {
  background-color: gray;
}
```

The plugin automatically generates:

```typescript
/* Button.module.css.d.ts */
declare const styles: {
  readonly container: string;
  readonly primary: string;
  readonly secondary: string;
};

export default styles;
```

### Usage with TypeScript

```typescript
import styles from "./Button.module.css";

// Full IntelliSense and type checking
const button = (
  <button className={styles.primary}>
    {/* TypeScript knows 'primary' exists */}
    Click me
  </button>
);

// TypeScript error if class doesn't exist
// const invalid = styles.nonExistent; // ❌ Property 'nonExistent' does not exist
```

### Configuration

```typescript
import { cssModulesTypesPlugin } from "@visulima/rollup-css-plugin";

export default {
  plugins: [
    // Your main CSS plugin
    rollupCssPlugin({
      autoModules: /\.module\./,
      postcss: {
        modules: true,
      },
    }),

    // TypeScript declarations generator
    cssModulesTypesPlugin(
      {
        // Same options as rollupCssPlugin for CSS processing
        autoModules: /\.module\./,
        postcss: {
          modules: {
            generateScopedName: "[name]__[local]___[hash:base64:5]",
          },
        },
        lightningcss: {
          modules: true,
        },
      },
      process.cwd(), // Root directory for relative paths
    )
  ]
};
```

### Features

- **Automatic Detection**: Works with any CSS modules configuration
- **Watch Mode Support**: Regenerates declarations when CSS files change
- **Multiple Processors**: Supports PostCSS and LightningCSS modules
- **Custom Naming**: Respects your CSS modules naming configuration
- **Build Integration**: Seamlessly integrates with your build process

## Tailwind Oxide Integration

Leverage the power of Tailwind Oxide for ultra-fast Tailwind CSS processing:

```typescript
import { rollupCssPlugin, tailwindcssLoader } from "@visulima/rollup-css-plugin";

export default {
  plugins: [
    rollupCssPlugin({
      // Enable Tailwind Oxide processing
      tailwindcss: {
        // Enable source maps
        sourceMap: true,
        
        // Custom Tailwind config path
        config: './tailwind.config.js',
        
        // Enable JIT mode for faster builds
        jit: true,
        
        // Custom content paths for scanning
        content: ['**/*.{html,js,ts,jsx,tsx}'],
        
        // Enable CSS purging in production
        purge: true,
        
        // Enable autoprefixer
        autoprefixer: true,
        
        // Enable CSS minification in production
        minify: true
      },
      
      // Add the Tailwind Oxide loader to your loaders array
      loaders: [
        tailwindcssLoader,
        // ... other loaders
      ]
    })
  ]
};
```

### Tailwind Oxide Features

- **Ultra-Fast Processing**: Rust-based engine for lightning-fast CSS generation
- **Just-In-Time (JIT) Mode**: Generate only the CSS you actually use
- **Smart Content Scanning**: Automatically detect and watch file changes
- **Source Map Support**: Full debugging support with accurate source maps
- **Production Optimization**: Automatic CSS purging and minification
- **Plugin Compatibility**: Works with existing Tailwind plugins and configurations

### Configuration Options

- `config` - Path to Tailwind CSS configuration file
- `jit` - Enable Just-In-Time mode for faster builds
- `sourceMap` - Enable source map generation
- `content` - Custom content paths for scanning
- `purge` - Enable CSS purging in production
- `autoprefixer` - Enable automatic vendor prefixing
- `minify` - Enable CSS minification in production

## PostCSS Integration

Leverage the PostCSS ecosystem:

```typescript
rollupCssPlugin({
  postcss: {
    plugins: [
      require("autoprefixer"),
      require("postcss-nested"),
      require("postcss-custom-properties"),
    ],
  },
})
```

## License

MIT © [Daniel Bannert](https://github.com/prisis)
