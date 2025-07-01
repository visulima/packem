# Packen Documentation

Complete MDX documentation for all Packen features, designed for Fumadocs.

## ⚠️ Important: Correct Configuration Structure

Based on analysis of the actual Packen interfaces, the correct configuration structure is:

### Basic Configuration

```typescript
import { defineConfig } from '@visulima/packem/config'
import transformer from '@visulima/packem/transformer/esbuild'

export default defineConfig({
  transformer,
  // Core options at top level
  entries: ['src/index.ts'], // NOT 'entry'
  externals: ['react', 'react-dom'],
  runtime: 'node', // or 'browser'
  cjsInterop: true,
  sourcemap: true,
  declaration: true,
  minify: false,
  // Rollup-specific options under 'rollup' key
  rollup: {
    css: {
      mode: 'extract',
      loaders: [/* specific loader imports */],
      minifier: /* specific minifier import */
    }
  }
})
```

### Available Transformers

✅ **Confirmed transformers:**
- `@visulima/packem/transformer/esbuild`
- `@visulima/packem/transformer/swc` 
- `@visulima/packem/transformer/oxc`
- `@visulima/packem/transformer/sucrase`

❌ **Not available:**
- `@visulima/packem/transformer/typescript` (doesn't exist)

### CSS Loader Structure

✅ **Correct CSS configuration:**
```typescript
import postcssLoader from '@visulima/packem/css/loader/postcss'
import sassLoader from '@visulima/packem/css/loader/sass'
import lessLoader from '@visulima/packem/css/loader/less'
import stylusLoader from '@visulima/packem/css/loader/stylus'
import sourceMapLoader from '@visulima/packem/css/loader/sourcemap'
import cssnanoMinifier from '@visulima/packem/css/minifier/cssnano'
import lightningcssMinifier from '@visulima/packem/css/minifier/lightningcss'

export default defineConfig({
  rollup: {
    css: {
      mode: 'extract', // or 'inject'
      loaders: [postcssLoader, sassLoader, lessLoader, stylusLoader, sourceMapLoader],
      minifier: cssnanoMinifier
    }
  }
})
```

### BuildConfig Interface

The actual `BuildConfig` interface extends `DeepPartial<Omit<BuildOptions, "entries">>` and includes:

- `entries?: (BuildEntry | string)[]` (array of entries, not single entry)
- `hooks?: Partial<BuildHooks<InternalBuildOptions>>`
- `preset?: BuildPreset | "auto" | "none" | string`
- All `BuildOptions` properties except `entries`

### Key Properties

- `alias: Record<string, string>`
- `analyze?: boolean`
- `browserTargets?: string[]`
- `cjsInterop?: boolean`
- `clean: boolean`
- `debug: boolean`
- `declaration?: boolean | "compatible" | "node16"`
- `dtsOnly?: boolean`
- `externals: (RegExp | string)[]`
- `minify?: boolean`
- `runtime?: "browser" | "node"`
- `sourcemap: boolean`
- `transformer: TransformerFn`

## Structure

The documentation follows Fumadocs conventions and uses built-in components:

### Available Components

- **Cards & Card**: For navigation and feature highlights
- **Callout**: For info, warning, error, and success messages  
- **Code blocks**: Automatic syntax highlighting with tabs
- **Tabs**: Built-in tab components for multi-option content
- **Include**: Reference other files (Fumadocs MDX only)

### Sections

1. **Guide** (`/docs/guide/`)
   - Introduction to Packen
   - Getting started tutorial
   - Transformer comparison (4 transformers, not 5)
   - CSS processing guide

2. **Options** (`/docs/options/`)
   - Complete configuration reference
   - Entry points and detection
   - Output formats and targets
   - Build lifecycle options

3. **API Reference** (`/docs/api/`)
   - Programmatic API documentation
   - All packages and exports
   - TypeScript interfaces

4. **Examples** (`/docs/examples/`)
   - Real-world use cases
   - Framework integrations
   - Migration guides
   - Performance optimization

## Fumadocs Components

### Cards

```mdx
<Cards>
  <Card href="/path" title="Title">
    Description content
  </Card>
</Cards>
```

### Callouts

```mdx
<Callout type="info">
  Information message
</Callout>

<Callout type="warning">
  Warning message
</Callout>
```

### Code Tabs

```mdx
```npm
npm install package
```
```

### Tab Groups

```mdx
```js tab="Tab 1"
console.log('Hello');
```

```js tab="Tab 2"  
console.log('World');
```
```

## Writing Guidelines

1. Use built-in Fumadocs components instead of custom ones
2. Include practical examples in all guides
3. Provide migration paths from similar tools
4. **Keep configuration examples up-to-date with actual interfaces**
5. Use correct Packen import paths and syntax
6. **Only document transformers that actually exist**
7. **Use correct property names (entries, not entry)**

## Navigation

Navigation is configured in `navigation.json` for Fumadocs compatibility.

## Features Covered

- ✅ Fast bundling with multiple transformer support (esbuild, swc, OXC, sucrase)
- ✅ Package.json-driven builds with automatic entry detection  
- ✅ TypeScript support with declaration generation
- ✅ Comprehensive CSS processing with specific loaders
- ✅ React Server Components and Client Components
- ✅ Multi-runtime targeting (Node.js, browser)
- ✅ Development workflow with watch mode
- ✅ Bundle optimization and analysis
- ✅ Monorepo support and shared configurations

## Building the Documentation

The documentation is written in MDX format and can be used with any MDX-compatible documentation framework such as:

- Next.js with MDX
- Docusaurus
- Fumadocs
- Nextra
- VitePress with MDX plugin

## Contributing

When adding new documentation:

1. Follow the existing structure and naming conventions
2. Use MDX for interactive examples and components
3. Include practical code examples for all features
4. Add cross-references between related topics
5. Update the navigation structure as needed