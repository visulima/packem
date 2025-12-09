# Svelte 5 + Packem Example

This example demonstrates how to use Svelte 5 with Packem's Svelte preset.

## What is Svelte 5?

Svelte 5 is a modern JavaScript framework that compiles components at build time:
- **Runes** - New reactive primitives (`$state`, `$derived`, `$effect`)
- **No Virtual DOM** - Direct DOM manipulation for better performance
- **Compile-time Optimizations** - Framework code is compiled away
- **Small Bundle Size** - Minimal runtime overhead
- **TypeScript Support** - First-class TypeScript support

## Setup

This example uses:
- **esbuild** as the main transformer (handles TypeScript → JavaScript)
- **rollup-plugin-svelte** (processes `.svelte` files)
- **Svelte 5** with runes API

## Configuration

The `packem.config.ts` uses the Svelte preset:

```typescript
import { defineConfig } from "@visulima/packem/config";
import { createSveltePreset } from "@visulima/packem/config/preset/svelte";

export default defineConfig({
    preset: createSveltePreset({
        pluginOptions: {
            include: [/\.svelte$/],
            compilerOptions: {
                generate: "dom",
                hydratable: false,
            },
        },
    }),
});
```

**Note:** By importing from `@visulima/packem/config/preset/svelte`, you only need to install Svelte dependencies when you actually use this preset. The preset is lazy-loaded and won't require dependencies unless imported.

The Svelte preset automatically configures:
- `rollup-plugin-svelte` - For processing Svelte components
- Handles `.svelte` file compilation and optimization

### Alternative: Simple String Preset

You can also use the preset as a string for basic Svelte support:

```typescript
export default defineConfig({
    preset: "svelte", // Basic Svelte preset
});
```

### SSR Support

For server-side rendering, configure the preset with SSR options:

```typescript
export default defineConfig({
    preset: createSveltePreset({
        pluginOptions: {
            compilerOptions: {
                generate: "ssr",
                hydratable: true,
            },
        },
    }),
});
```

## How It Works

1. **Rollup Plugin** (rollup-plugin-svelte): Processes `.svelte` files, compiles components to JavaScript
2. **Transformer** (esbuild): Processes the compiled JavaScript and handles TypeScript transformation
3. **CSS Processing**: Styles are extracted and handled by Packem's CSS processing pipeline

## Key Features

- **Runes API**: Use `$state()` for reactive state, `$derived()` for computed values
- **Reactive Statements**: Automatic dependency tracking
- **Template Syntax**: `{#if}`, `{#each}`, `bind:value`, `onclick`, etc.
- **TypeScript**: Full TypeScript support in `<script lang="ts">`
- **Scoped Styles**: Styles are automatically scoped to components

## Testing

Run the build to see Svelte compilation:

```bash
pnpm build
```

Svelte will automatically:
- Compile components at build time
- Optimize reactive updates
- Generate efficient DOM code
- Handle style scoping

## Components

- **Counter**: Demonstrates reactive state with `$state` and `$derived`
- **TodoList**: Shows reactive arrays and list rendering with `{#each}`
