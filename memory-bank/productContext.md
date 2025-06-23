# Product Context: Visulima Packem

## Why Packem Exists

### Problem Statement
Modern JavaScript/TypeScript library development faces several challenges:

1. **Complex Build Configuration**: Setting up bundlers like Webpack or Rollup requires extensive configuration
2. **Multi-format Publishing**: Libraries need to support both CommonJS and ESM formats
3. **TypeScript Complexity**: Proper TypeScript declaration generation and isolated declarations
4. **Package.json Validation**: Ensuring correct exports, types, and field configurations
5. **Modern Feature Support**: CSS modules, dynamic imports, WebAssembly, React Server Components

### Market Gap
Existing solutions either:
- Require extensive configuration (Webpack, raw Rollup)
- Lack comprehensive TypeScript support (some zero-config tools)
- Don't properly handle package.json exports validation
- Missing modern features like isolated declarations or CSS modules

## What Packem Solves

### Zero Configuration Experience
- Automatically detects entry points from package.json exports
- Infers build targets from package.json configuration
- Provides sensible defaults for common use cases
- Minimal setup required for most projects

### Comprehensive TypeScript Support
- Full TypeScript compilation with multiple transformers
- Automatic .d.ts generation with proper extensions (.d.mts, .d.cts)
- Isolated declarations support (TypeScript 5.5+)
- Node 10 compatibility with typeVersions generation

### Package.json Integration & Validation
- Validates exports, main, module, types, and bin fields
- Ensures proper configuration for npm publishing
- Checks for common misconfigurations
- Bundle size validation

### Modern Development Features
- CSS/Sass/Less/Stylus support with modules
- WebAssembly module support
- Dynamic import handling
- React Server Components support
- Multiple runtime targets (node, browser, edge, react-server)

## How It Should Work

### Developer Experience
1. **Installation**: Single package installation
2. **Configuration**: Optional packem.config.ts for customization
3. **Build**: Simple `packem build` command
4. **Validation**: Built-in validation catches issues early
5. **Watch Mode**: Development-friendly watch mode

### Integration Points
- Works with existing package.json exports
- Integrates with TypeScript projects seamlessly
- Supports various transformer preferences (esbuild, SWC, OXC, Sucrase)
- Compatible with monorepo setups (Nx, Lerna, etc.)

### Output Quality
- Optimized bundles for different environments
- Proper source maps generation
- Tree-shaking and dead code elimination
- Minification options

## User Experience Goals

### Primary Users: Library Authors
- **Goal**: Publish high-quality npm packages with minimal configuration
- **Pain Points**: Complex build setups, TypeScript declaration issues, package.json misconfigurations
- **Success**: Zero-config bundling with comprehensive validation

### Secondary Users: Application Developers
- **Goal**: Bundle applications for different runtimes
- **Pain Points**: Runtime-specific optimizations, CSS handling, modern feature support
- **Success**: Flexible bundling for various deployment targets

### Developer Experience Principles
1. **Convention over Configuration**: Smart defaults based on package.json
2. **Gradual Complexity**: Start simple, add configuration as needed
3. **Fast Feedback**: Quick builds and helpful error messages
4. **Comprehensive Validation**: Catch issues before publishing
5. **Modern Standards**: Support latest JavaScript/TypeScript features
