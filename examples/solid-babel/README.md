# SolidJS + Babel Example

This example demonstrates how to use SolidJS with Packem's Babel plugin support.

## What is SolidJS?

SolidJS is a reactive JavaScript framework that uses fine-grained reactivity:
- **Signals** for reactive state management
- **Automatic dependency tracking** - only updates what changed
- **No Virtual DOM** - direct DOM manipulation for better performance
- **Small bundle size** - minimal runtime overhead

## Setup

This example uses:
- **esbuild** as the main transformer (handles TypeScript → JavaScript)
- **Babel** with Solid preset (runs before transformer to transform JSX)
- **SolidJS** with automatic JSX runtime

## Configuration

The `packem.config.ts` uses the Solid preset:

```typescript
import { defineConfig } from "@visulima/packem/config";
import { createSolidPreset } from "@visulima/packem/config/preset/solid";

export default defineConfig({
    preset: createSolidPreset({
        solidOptions: {
            generate: "dom",
            hydratable: false,
        },
    }),
    externals: ["solid-js", "solid-js/web", "solid-js/store"],
});
```

**Note:** By importing from `@visulima/packem/config/preset/solid`, you only need to install SolidJS/Babel dependencies when you actually use this preset. The preset is lazy-loaded and won't require dependencies unless imported.

The Solid preset automatically configures:
- `babel-preset-solid` - For SolidJS JSX transformation
- `@babel/preset-typescript` - For TypeScript support
- `@babel/preset-env` - For target compilation (defaults to "last 2 years")

### Alternative: Simple String Preset

You can also use the preset as a string for basic SolidJS support:

```typescript
export default defineConfig({
    preset: "solid", // Basic SolidJS preset
});
```

### SSR Support

For server-side rendering, configure the preset with SSR options:

```typescript
export default defineConfig({
    preset: createSolidPreset({
        solidOptions: {
            generate: "ssr",
            hydratable: true,
        },
    }),
});
```

## How It Works

1. **Babel** (runs first): Transforms TSX → JS (handles TypeScript + JSX transformation with Solid preset)
2. **Transformer (esbuild)** processes the already-transformed JavaScript
3. The transformed code is then bundled by Rollup

## Key Differences from React

- **Signals instead of useState**: `createSignal()` instead of `useState()`
- **Access values with function calls**: `count()` instead of `count`
- **Computed values are functions**: `doubled()` instead of `doubled`
- **For component for lists**: `<For>` instead of `.map()`
- **onInput instead of onChange**: For input events

## Testing

Run the build to see SolidJS transformation:

```bash
pnpm build
```

SolidJS will automatically:
- Track dependencies and update only what changed
- Optimize re-renders with fine-grained reactivity
- Generate efficient DOM updates

## Components

- **Counter**: Demonstrates reactive signals and computed values
- **TodoList**: Shows reactive arrays and list rendering with `<For>`


