# Packen Documentation

Complete MDX documentation for all Packen features, designed for Fumadocs.

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
   - Transformer comparison
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
4. Keep configuration examples up-to-date
5. Use correct Packen import paths and syntax

## Navigation

Navigation is configured in `navigation.json` for Fumadocs compatibility.

## Features Covered

- ✅ Fast bundling with multiple transformer support (esbuild, swc, OXC, sucrase)
- ✅ TypeScript support with isolated declarations
- ✅ CSS preprocessing (Sass, Less, Stylus, PostCSS, CSS Modules)
- ✅ Multiple runtime support (React server components, edge-light, browser, node)
- ✅ Bundle analysis and visualization
- ✅ Watch mode and development workflow
- ✅ TypeDoc integration
- ✅ ESM ⇄ CJS interoperability
- ✅ Dynamic imports and shared modules
- ✅ WebAssembly support

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