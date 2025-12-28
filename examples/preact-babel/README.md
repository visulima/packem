# Preact + Babel Example

This example demonstrates how to use Preact with Packem's Babel plugin support.

## What is Preact?

Preact is a fast, lightweight alternative to React:
- **Small bundle size** - Only 3KB gzipped (vs React's ~45KB)
- **Same API as React** - Familiar hooks and component patterns
- **Fast performance** - Optimized for speed and efficiency
- **Compatible with React ecosystem** - Can use React libraries via preact/compat

## Setup

This example uses:
- **esbuild** as the main transformer (handles TypeScript → JavaScript)
- **Babel** with React preset configured for Preact (runs before transformer to transform JSX)
- **Preact** with automatic JSX runtime

## Configuration

The `packem.config.ts` uses the Preact preset:

```typescript
import { defineConfig } from "@visulima/packem/config";
import { createPreactPreset } from "@visulima/packem/config/preset/preact";

export default defineConfig({
    preset: createPreactPreset(),
});
```

**Note:** By importing from `@visulima/packem/config/preset/preact`, you only need to install Preact/Babel dependencies when you actually use this preset. The preset is lazy-loaded and won't require dependencies unless imported.

The Preact preset automatically configures:
- `@babel/preset-react` with `importSource: "preact"` - For Preact JSX transformation
- TypeScript is handled by the transformer via parser plugins, not by Babel
- **Preact Devtools** - Automatically injects `preact/debug` in development mode for better debugging experience
- **React Compatibility Aliases** - Automatically aliases `react` and `react-dom` to `preact/compat` so React libraries work with Preact

### Alternative: Simple String Preset

You can also use the preset as a string for basic Preact support:

```typescript
export default defineConfig({
    preset: "preact", // Basic Preact preset
});
```

### With Devtools in Production

Enable Preact devtools in production builds:

```typescript
export default defineConfig({
    preset: createPreactPreset({
        devtoolsInProd: true // Enables preact/devtools in production
    }),
});
```

### Custom Options

You can customize the preset with additional Babel plugins or presets:

```typescript
export default defineConfig({
    preset: createPreactPreset({
        devtoolsInProd: false,
        plugins: [],
        presets: []
    }),
});
```

## How It Works

1. **Babel** (runs first): Transforms JSX → JS (handles JSX transformation with Preact's automatic runtime)
2. **Transformer (esbuild)** processes the code and handles TypeScript transformation via parser plugins
3. The transformed code is then bundled by Rollup

## Key Differences from React

- **Smaller bundle**: Preact is much smaller than React
- **Same API**: Uses the same hooks (`useState`, `useEffect`, etc.) and patterns
- **Import from preact**: `import { useState } from "preact/hooks"` instead of `react`
- **JSX imports from preact**: Automatically configured via `importSource: "preact"`

## Testing

Run the build to see Preact transformation:

```bash
pnpm build
```

Preact will automatically:
- Transform JSX to use Preact's runtime
- Handle hooks and component patterns
- Generate efficient, small bundles

## Components

- **Counter**: Demonstrates Preact hooks (`useState`) and state management
- **TodoList**: Shows array state management, conditional rendering, and event handling

## Using React Libraries

The preset automatically configures aliases so React libraries work out of the box:

- `react` → `preact/compat`
- `react-dom` → `preact/compat`
- `react-dom/test-utils` → `preact/test-utils`

This means you can use React libraries directly without any additional configuration:

```typescript
// These imports will automatically resolve to preact/compat
import { useState } from "react"; // Works via alias
import { render } from "react-dom"; // Works via alias
import SomeReactLibrary from "some-react-library"; // Works via preact/compat
```

**Note:** Make sure `preact/compat` is available. It's part of the `preact` package, so if you have `preact` installed, you're all set!
