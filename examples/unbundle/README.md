# Unbundle Mode Example

This example demonstrates the `unbundle` mode feature in Packem, which preserves the source file structure instead of bundling everything into a single file.

## Structure

```
src/
  index.ts          # Main entry point
  a/
    indexA.ts       # Module A
  b/
    indexB.ts       # Module B
  c/
    indexC.ts       # Module C
```

## Configuration

The `unbundle: true` option is set in `packem.config.ts`:

```typescript
export default defineConfig({
    runtime: "node",
    transformer,
    unbundle: true,
});
```

## Output

When built with unbundle mode enabled, the output preserves the directory structure:

```
dist/
  index.mjs         # Main entry (ESM)
  index.cjs         # Main entry (CJS)
  a/
    indexA.mjs      # Module A (ESM)
    indexA.cjs      # Module A (CJS)
  b/
    indexB.mjs      # Module B (ESM)
    indexB.cjs      # Module B (CJS)
  c/
    indexC.mjs      # Module C (ESM)
    indexC.cjs      # Module C (CJS)
```

## Usage

Build the example:

```bash
pnpm build
```

Or use the CLI flag:

```bash
packem build --unbundle
```

## Benefits

- **Preserved Structure**: Maintains the original source directory structure
- **Better Debugging**: Easier to trace issues to specific source files
- **Selective Importing**: Consumers can import from specific modules if needed
- **Tree-shaking Friendly**: Better optimization opportunities for bundlers that consume the output

