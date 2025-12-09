# Vue 3 + Packem Example

This example demonstrates how to use Vue 3 with Packem's Vue preset.

## What is Vue 3?

Vue 3 is a progressive JavaScript framework for building user interfaces:
- **Composition API** - Flexible API for organizing component logic
- **Reactive System** - Automatic dependency tracking with `ref()` and `reactive()`
- **Single File Components (SFCs)** - `.vue` files with template, script, and style
- **TypeScript Support** - First-class TypeScript support
- **Small Bundle Size** - Optimized runtime performance

## Setup

This example uses:
- **esbuild** as the main transformer (handles TypeScript → JavaScript)
- **unplugin-vue** Rollup plugin (processes `.vue` files)
- **Vue 3** with Composition API

## Configuration

The `packem.config.ts` uses the Vue preset:

```typescript
import { defineConfig } from "@visulima/packem/config";
import { createVuePreset } from "@visulima/packem/config/preset/vue";

export default defineConfig({
    preset: createVuePreset({
        pluginOptions: {
            include: [/\.vue$/],
            customElement: false,
        },
    }),
});
```

**Note:** By importing from `@visulima/packem/config/preset/vue`, you only need to install Vue dependencies when you actually use this preset. The preset is lazy-loaded and won't require dependencies unless imported.

The Vue preset automatically configures:
- `unplugin-vue/rollup` - For processing Vue Single File Components (SFCs)
- Handles `.vue` file compilation, template compilation, and style processing

### Alternative: Simple String Preset

You can also use the preset as a string for basic Vue support:

```typescript
export default defineConfig({
    preset: "vue", // Basic Vue preset
});
```

### Custom Element Mode

For Vue custom elements, configure the preset:

```typescript
export default defineConfig({
    preset: createVuePreset({
        pluginOptions: {
            customElement: true,
        },
    }),
});
```

## How It Works

1. **Rollup Plugin** (unplugin-vue): Processes `.vue` files, extracts `<script>`, `<template>`, and `<style>` blocks
2. **Transformer** (esbuild): Processes the compiled JavaScript and handles TypeScript transformation
3. **CSS Processing**: Styles are handled by Packem's CSS processing pipeline

## Key Features

- **Composition API**: Use `<script setup>` for cleaner component code
- **Reactive Refs**: `ref()` for reactive primitive values
- **Computed Properties**: `computed()` for derived reactive values
- **Template Syntax**: `v-if`, `v-for`, `v-model`, `@click`, etc.
- **TypeScript**: Full TypeScript support in `<script setup lang="ts">`

## Testing

Run the build to see Vue SFC compilation:

```bash
pnpm build
```

Vue will automatically:
- Compile Single File Components
- Process templates and scripts
- Handle reactive state management
- Generate optimized output

## Components

- **Counter**: Demonstrates reactive refs and computed properties
- **TodoList**: Shows reactive arrays and list rendering with `v-for`
