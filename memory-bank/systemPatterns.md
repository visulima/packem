# System Patterns: Visulima Packem

## Core Architectural Patterns

### Plugin-Based Architecture
Packem follows a plugin-based architecture built on Rollup's plugin system:

```typescript
// Core pattern: Configurable plugin chain
const plugins = [
  transformerPlugin(transformer),
  cssPlugin(cssOptions),
  validationPlugin(validationOptions),
  // ... other plugins
];
```

**Benefits**:
- Modular functionality
- Easy to extend and customize
- Clear separation of concerns
- Testable components

### Configuration-Driven Development
The system prioritizes package.json-driven configuration over custom config files:

```json
{
  "exports": {
    "import": "./dist/index.mjs",
    "require": "./dist/index.cjs"
  }
}
```

**Pattern**: Convention over Configuration
- Automatic entry point detection
- Inferred build targets
- Optional packem.config.ts for advanced cases

### Transformer Abstraction
Unified interface for different transformers (esbuild, SWC, OXC, Sucrase):

```typescript
interface Transformer {
  transform(code: string, options: TransformOptions): Promise<TransformResult>;
  supportedExtensions: string[];
  name: string;
}
```

**Benefits**:
- Swappable implementations
- Consistent API across transformers
- Performance optimization flexibility

## Design Patterns

### Factory Pattern
Used for creating configured instances of complex objects:

```typescript
// Rollup configuration factory
export function createRollupConfig(options: PackemOptions): RollupOptions {
  return {
    input: detectEntryPoints(options),
    plugins: createPluginChain(options),
    external: resolveExternals(options),
  };
}
```

### Strategy Pattern
Transformer selection and CSS processing strategies:

```typescript
class TransformerStrategy {
  constructor(private transformer: Transformer) {}

  async transform(code: string): Promise<string> {
    return this.transformer.transform(code);
  }
}
```

### Observer Pattern
Build events and progress reporting:

```typescript
interface BuildObserver {
  onStart(): void;
  onProgress(progress: BuildProgress): void;
  onComplete(result: BuildResult): void;
  onError(error: Error): void;
}
```

### Validation Chain Pattern
Sequential validation with early termination:

```typescript
const validators = [
  validatePackageJson,
  validateExports,
  validateTypes,
  validateBundleSize,
];

for (const validator of validators) {
  const result = await validator(config);
  if (!result.valid) {
    throw new ValidationError(result.errors);
  }
}
```

## Component Relationships

### Core Components Hierarchy

```
PackemBuilder
├── ConfigResolver
│   ├── PackageJsonParser
│   └── UserConfigMerger
├── RollupConfigFactory
│   ├── PluginChain
│   │   ├── TransformerPlugin
│   │   ├── CSSPlugin
│   │   ├── ValidationPlugin
│   │   └── TypesPlugin
│   └── ExternalResolver
└── BuildExecutor
    ├── RollupBuilder
    └── PostProcessor
```

### Data Flow Pattern

```
package.json → ConfigResolver → RollupConfigFactory → BuildExecutor → Output
     ↓              ↓                    ↓                 ↓
UserConfig → ValidationChain → PluginChain → BuildObserver → Results
```

## Key Design Decisions

### Rollup as Foundation
**Decision**: Use Rollup as the core bundling engine
**Rationale**:
- Mature plugin ecosystem
- Excellent tree-shaking
- Predictable output
- ESM-first design

**Trade-offs**:
- Slower than esbuild for large projects
- More complex than simple transformers
- Additional abstraction layer

### Multiple Format Support
**Decision**: Generate multiple output formats simultaneously
**Implementation**:
```typescript
const formats = detectFormats(packageJson.exports);
const configs = formats.map(format => createConfigForFormat(format));
```

**Benefits**:
- Single build command for all targets
- Consistent output across formats
- Reduced build complexity for users

### Validation-First Approach
**Decision**: Validate configuration before building
**Pattern**:
```typescript
// Validation happens before any build steps
await validateConfiguration(config);
await validatePackageJson(packageJson);
await validateExports(exports);
// Only then proceed with building
```

**Benefits**:
- Early error detection
- Better developer experience
- Prevents invalid package publishing

## Error Handling Patterns

### Graceful Degradation
When optional features fail, continue with core functionality:

```typescript
try {
  const cssResult = await processCss(cssFiles);
  return { ...result, css: cssResult };
} catch (error) {
  logger.warn('CSS processing failed, continuing without CSS');
  return result;
}
```

### Error Context Enrichment
Add context to errors for better debugging:

```typescript
class PackemError extends Error {
  constructor(
    message: string,
    public context: {
      file?: string;
      line?: number;
      transformer?: string;
    }
  ) {
    super(message);
  }
}
```

### Validation Error Aggregation
Collect all validation errors before reporting:

```typescript
const errors: ValidationError[] = [];
const warnings: ValidationWarning[] = [];

// Collect all issues
validators.forEach(validator => {
  const result = validator.validate(config);
  errors.push(...result.errors);
  warnings.push(...result.warnings);
});

// Report all at once
if (errors.length > 0) {
  throw new AggregatedValidationError(errors, warnings);
}
```

## Performance Patterns

### Lazy Loading
Load transformers and plugins only when needed:

```typescript
const getTransformer = memoize(async (name: string) => {
  switch (name) {
    case 'esbuild':
      return (await import('./transformers/esbuild')).default;
    case 'swc':
      return (await import('./transformers/swc')).default;
    // ...
  }
});
```

### Caching Strategy
Multi-level caching for build artifacts:

```typescript
// Nx workspace-level caching
// Rollup plugin-level caching
// Transformer-level caching
const cache = new LayeredCache([
  new NxCache(),
  new RollupCache(),
  new TransformerCache(),
]);
```

### Parallel Processing
Process multiple entry points simultaneously:

```typescript
const buildPromises = entryPoints.map(entry =>
  buildEntry(entry, config)
);

const results = await Promise.all(buildPromises);
```

## Testing Patterns

### Fixture-Based Testing
Use real-world examples as test fixtures:

```typescript
describe('CSS Processing', () => {
  it('should handle sass imports', async () => {
    const fixture = await loadFixture('css/sass-import');
    const result = await buildFixture(fixture);
    expect(result).toMatchSnapshot();
  });
});
```

### Integration Testing Strategy
Test the complete build pipeline:

```typescript
const testProject = createTestProject({
  packageJson: { /* ... */ },
  sources: { /* ... */ },
  config: { /* ... */ }
});

const result = await packem.build(testProject);
expect(result.outputs).toHaveLength(2); // CJS + ESM
```
