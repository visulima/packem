# Packen Documentation Corrections

This document summarizes the corrections made to align the documentation with the actual Packen interfaces.

## Major Interface Corrections

### 1. Configuration Structure

**❌ Incorrect (Previous):**
```typescript
import { defineConfig } from '@visulima/packem/config'

export default defineConfig({
  entry: 'src/index.ts', // Wrong: should be 'entries'
  // ...
})
```

**✅ Correct (Updated):**
```typescript
import { defineConfig } from '@visulima/packem/config'
import transformer from '@visulima/packem/transformer/esbuild'

export default defineConfig({
  transformer,
  entries: ['src/index.ts'], // Array, not single entry
  externals: ['react'], // Top-level, not under rollup
  sourcemap: true,
  declaration: true,
  rollup: {
    // Rollup-specific options here
  }
})
```

### 2. Transformer Availability

**❌ Incorrect (Previous):**
- Documented 5 transformers including `@visulima/packem/transformer/typescript`

**✅ Correct (Updated):**
- Only 4 transformers are actually available:
  - `@visulima/packem/transformer/esbuild`
  - `@visulima/packem/transformer/swc`
  - `@visulima/packem/transformer/oxc`
  - `@visulima/packem/transformer/sucrase`
- **Note:** `transformer/typescript` does not exist

### 3. CSS Configuration

**❌ Incorrect (Previous):**
```typescript
rollup: {
  css: {
    modules: true,
    extract: true,
    postcss: { /* config */ }
  }
}
```

**✅ Correct (Updated):**
```typescript
import postcssLoader from '@visulima/packem/css/loader/postcss'
import sassLoader from '@visulima/packem/css/loader/sass'
import cssnanoMinifier from '@visulima/packem/css/minifier/cssnano'

rollup: {
  css: {
    mode: 'extract', // or 'inject'
    loaders: [postcssLoader, sassLoader],
    minifier: cssnanoMinifier
  }
}
```

### 4. Declaration Options

**❌ Incorrect (Previous):**
```typescript
declaration: {
  isolated: true
}
```

**✅ Correct (Updated):**
```typescript
declaration: true          // boolean
declaration: 'compatible'  // or 'node16'
```

### 5. Entry Configuration

**❌ Incorrect (Previous):**
```typescript
entries: [
  {
    input: 'src/index.ts',
    format: ['esm', 'cjs']
  }
]
```

**✅ Correct (Updated):**
```typescript
entries: [
  'src/index.ts' // string
  // or
  {
    input: 'src/index.ts',
    outDir: 'dist'
    // Format determined by package.json exports
  }
]
```

### 6. External Dependencies

**❌ Incorrect (Previous):**
```typescript
rollup: {
  external: ['react']
}
```

**✅ Correct (Updated):**
```typescript
externals: ['react'] // Top-level property
```

## Key Properties in BuildConfig

Based on actual interface analysis:

```typescript
interface BuildConfig {
  // Core options (top-level)
  transformer: TransformerFn
  entries?: (BuildEntry | string)[]
  externals?: (RegExp | string)[]
  runtime?: 'browser' | 'node'
  sourcemap?: boolean
  declaration?: boolean | 'compatible' | 'node16'
  minify?: boolean
  cjsInterop?: boolean
  clean?: boolean
  debug?: boolean
  
  // Rollup-specific options
  rollup?: {
    css?: StyleOptions
    watch?: WatchOptions
    // ... other rollup options
  }
}
```

## Files Updated

### Guide Files
- ✅ `docs/guide/transformers.mdx` - Removed TypeScript transformer, fixed config examples
- ✅ `docs/guide/configuration.mdx` - Updated all configuration examples
- ✅ `docs/guide/getting-started.mdx` - Fixed basic config examples

### Options Files
- ✅ `docs/options/index.mdx` - Updated configuration structure
- ✅ All option pages - Removed incorrect TypeScript transformer references

### Example Files
- ✅ `docs/examples/basic-library.mdx` - Already correct
- ✅ `docs/examples/react-library.mdx` - Fixed CSS config and externals
- ✅ `docs/examples/monorepo.mdx` - Fixed shared config structure
- ✅ `docs/examples/dual-package.mdx` - Already correct

## Verification Sources

All corrections based on analysis of:
- `packages/packem/src/types.ts` - BuildConfig interface
- `packages/packem/package.json` - Available exports
- `examples/*/packem.config.ts` - Real working examples
- `packages/packem/packem.config.ts` - Main package config

## Remaining Tasks

- [ ] Update API documentation to reflect correct interfaces
- [ ] Verify all examples use correct configuration
- [ ] Update navigation.json to remove TypeScript transformer examples
- [ ] Add validation examples for BuildConfig interface