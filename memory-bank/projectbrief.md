# Project Brief: Visulima Packem

## Project Overview
Visulima Packem is a fast and modern bundler for Node.js and TypeScript applications. It's built on top of Rollup and supports multiple transformers including esbuild, SWC, OXC, and Sucrase.

## Core Mission
To provide a zero-configuration bundler that generates multiple bundles (CommonJS or ESModule) simultaneously while adhering to Node.js' native file type support and package.json exports configuration.

## Key Features
- **Multi-format Output**: Generates CJS and ESM bundles simultaneously
- **TypeScript Support**: Full TypeScript support with .d.ts bundling and isolated declarations
- **Multiple Transformers**: Support for esbuild, SWC, OXC, and Sucrase
- **Package.json Integration**: Uses exports, main, module, bin, and types fields
- **CSS Support**: Handles CSS, Sass, Less, Stylus, and CSS Modules
- **Runtime Support**: Multiple runtimes (default, react-server, edge-light, browser, node)
- **Validation**: Package.json validation and bundle size validation
- **Modern Features**: Dynamic imports, WebAssembly, React Server Components

## Repository Structure
- **Monorepo**: Nx workspace with pnpm package manager
- **Main Package**: `packages/packem` - The core bundler
- **Examples**: Extensive examples in `examples/` directory
- **Tools**: Bundle lens and TypeDoc plugins

## Target Users
- Library authors who need to publish packages with multiple formats
- TypeScript developers building Node.js libraries
- Developers needing zero-config bundling solutions
- Teams requiring modern JavaScript/TypeScript build tooling

## Technical Foundation
- Built on Rollup for reliable bundling
- Supports Node.js 18+ and TypeScript 5.8+
- Uses Nx for monorepo management
- Comprehensive test suite with Vitest
- ESLint and TypeScript for code quality

## Success Metrics
- Zero-configuration experience for common use cases
- High performance bundling with multiple transformer options
- Comprehensive package.json validation
- Strong TypeScript support including isolated declarations
- Active community adoption and contribution
