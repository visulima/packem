# Packen Documentation

This directory contains comprehensive documentation for all Packen features and packages written in MDX format.

## Structure

The documentation is organized following modern documentation practices inspired by projects like tsdown.dev:

### Core Documentation
- **Guide/** - Getting started guides and tutorials
- **API/** - Complete API reference for all packages
- **Examples/** - Practical usage examples
- **Advanced/** - Advanced configuration and usage patterns

### Package-Specific Documentation
- **Core/** - `@visulima/packem` main bundler documentation
- **Rollup/** - `@visulima/packem-rollup` rollup plugins documentation
- **CSS/** - `@visulima/rollup-css-plugin` CSS processing documentation
- **Utils/** - Shared utilities and types documentation

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