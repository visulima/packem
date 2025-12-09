# React Compiler + Babel Example

This example demonstrates how to use React Compiler with Packem's Babel plugin support.

## What is React Compiler?

React Compiler is a build-time tool that automatically optimizes React components by:
- Automatically memoizing values and callbacks
- Optimizing re-renders
- Reducing unnecessary computations
- Improving performance without manual optimization

## Setup

This example uses:
- **esbuild** as the main transformer (handles TypeScript → JavaScript)
- **Babel** with React Compiler plugin (runs after transformer to optimize React code)
- **React 19** with automatic JSX runtime

## Configuration

The `packem.config.ts` uses the React preset with React Compiler enabled:

```typescript
import { defineConfig } from "@visulima/packem/config";
import { createReactPreset } from "@visulima/packem/config/preset/react";

export default defineConfig({
    preset: createReactPreset({
        compiler: {
            compilationMode: "infer",
            panicThreshold: "critical_errors",
        },
    }),
});
```

**Note:** By importing from `@visulima/packem/config/preset/react`, you only need to install React/Babel dependencies when you actually use this preset. The preset is lazy-loaded and won't require dependencies unless imported.

The React preset automatically configures:
- `babel-plugin-react-compiler` - The React Compiler plugin (when enabled)
- `@babel/preset-react` - For JSX transformation
- `@babel/preset-typescript` - For TypeScript support

### Alternative: Simple String Preset

You can also use the preset as a string for basic React support:

```typescript
export default defineConfig({
    preset: "react", // Basic React preset without compiler
});
```

## How It Works

1. **Transformer (esbuild)** runs first and converts TypeScript → JavaScript
2. **Babel plugin** runs after and applies React Compiler optimizations to the JavaScript code
3. The optimized code is then bundled by Rollup

## Testing

Run the build to see React Compiler optimizations:

```bash
pnpm build
```

The React Compiler will automatically optimize:
- Memoization of computed values (like `doubled` and `multiplied` in Counter)
- Callback memoization (like `handleIncrement`, `handleToggleTodo`)
- Component re-render optimization

## Components

- **Counter**: Demonstrates automatic memoization of computed values
- **TodoList**: Shows optimization of complex state updates and filtered computations



