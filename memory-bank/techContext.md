# Technical Context: Visulima Packem

## Technology Stack

### Core Technologies
- **Node.js**: 18+ (LTS support)
- **TypeScript**: 5.8+ (latest features including isolated declarations)
- **Rollup**: Core bundling engine for reliable output
- **Nx**: Monorepo management and build orchestration
- **pnpm**: Package manager with workspace support
- **Vitest**: Testing framework for unit and integration tests

### Transformer Ecosystem
- **esbuild**: Fast TypeScript/JavaScript transformer
- **SWC**: Rust-based fast transformer with advanced features
- **OXC**: Experimental high-performance transformer
- **Sucrase**: Lightweight TypeScript transformer
- **TypeScript Compiler**: Official TypeScript transformer

### CSS Processing
- **PostCSS**: Core CSS processing
- **Sass**: SCSS/Sass preprocessing
- **Less**: Less preprocessing
- **Stylus**: Stylus preprocessing
- **CSS Modules**: Scoped CSS support
- **Lightning CSS**: Fast CSS minification

### Development Tools
- **ESLint**: Code linting with comprehensive rules
- **Prettier**: Code formatting (via ESLint integration)
- **Husky**: Git hooks for quality gates
- **Lint-staged**: Pre-commit linting
- **Commitlint**: Conventional commit enforcement

## Architecture Overview

### Monorepo Structure
```
packem/
├── packages/
│   ├── packem/           # Main bundler package
│   ├── bundle-lens/      # Bundle analysis tool
│   └── typedoc-plugins/  # TypeDoc integration
├── examples/             # Comprehensive examples
├── tools/                # Shared tooling
└── scripts/              # Build and release scripts
```

### Core Package Architecture
```
packages/packem/src/
├── cli/                  # Command-line interface
├── config/               # Configuration handling
├── rollup/               # Rollup integration
│   ├── plugins/          # Custom Rollup plugins
│   └── utils/            # Rollup utilities
├── validator/            # Package.json validation
├── utils/                # Shared utilities
└── types/                # TypeScript definitions
```

## Technical Decisions

### Build System Choices

#### Rollup as Core Engine
- **Why**: Mature, reliable, excellent tree-shaking
- **Benefits**: Plugin ecosystem, ESM-first design, predictable output
- **Trade-offs**: Slower than esbuild for large projects, but more reliable

#### Multiple Transformer Support
- **Why**: Different projects have different performance/feature needs
- **Implementation**: Plugin architecture allowing transformer swapping
- **Benefits**: Flexibility, performance optimization, feature compatibility

#### Package.json-Driven Configuration
- **Why**: Follows Node.js standards, reduces configuration burden
- **Implementation**: Exports field parsing, automatic entry detection
- **Benefits**: Convention over configuration, npm publishing compatibility

### Development Workflow

#### Nx Workspace Benefits
- **Caching**: Intelligent build caching across packages
- **Dependency Graph**: Clear project relationships
- **Parallel Execution**: Efficient task running
- **Affected Detection**: Only build/test changed packages

#### Testing Strategy
- **Unit Tests**: Core logic validation with Vitest
- **Integration Tests**: End-to-end bundling scenarios
- **Fixture-based Testing**: Real-world example validation
- **Snapshot Testing**: Output consistency verification

## Dependencies & Constraints

### Runtime Dependencies
- Minimal runtime dependencies for end users
- Optional peer dependencies for transformers
- Clear separation between core and optional features

### Development Dependencies
- Comprehensive tooling for development experience
- Version pinning for reproducible builds
- Regular dependency updates via automated tools

### Node.js Compatibility
- **Minimum**: Node.js 18 (LTS)
- **Maximum**: Node.js 24 (latest tested)
- **ESM-first**: Native ES modules with CJS compatibility
- **Package.json**: Modern exports field usage

### TypeScript Support
- **Minimum**: TypeScript 5.0 for basic features
- **Recommended**: TypeScript 5.8+ for isolated declarations
- **Configuration**: Flexible tsconfig.json support
- **Declaration Generation**: Multiple output formats (.d.ts, .d.mts, .d.cts)

## Performance Considerations

### Build Performance
- **Transformer Choice**: esbuild for speed, SWC for features, OXC for cutting-edge
- **Parallel Processing**: Multi-core utilization where possible
- **Incremental Builds**: Watch mode optimization
- **Caching**: Nx-level and Rollup-level caching

### Bundle Optimization
- **Tree Shaking**: Dead code elimination
- **Minification**: Multiple minifier options
- **Code Splitting**: Dynamic import support
- **Bundle Analysis**: Size analysis and optimization suggestions

## Security & Quality

### Code Quality
- **ESLint**: Comprehensive linting rules
- **TypeScript**: Strict type checking
- **Testing**: High test coverage requirements
- **Code Review**: PR-based development workflow

### Security Practices
- **Dependency Scanning**: Automated vulnerability detection
- **Supply Chain**: Verified dependencies and lock files
- **Secrets Management**: No hardcoded secrets
- **Access Control**: Proper npm publishing permissions
