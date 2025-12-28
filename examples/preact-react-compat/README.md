# Preact + React Compatibility Example

This example demonstrates using **React-style imports** with Preact. All React imports are automatically aliased to `preact/compat` by the preset, allowing you to write React code that works seamlessly with Preact.

## What This Example Shows

- ✅ Using `import { useState, useEffect } from "react"` instead of `preact/hooks`
- ✅ Using `import { createRoot } from "react-dom/client"` 
- ✅ Using React hooks (`useState`, `useEffect`, `useMemo`, `useCallback`)
- ✅ React patterns work seamlessly with Preact via automatic aliases

## Key Feature: Automatic Aliases

The Preact preset automatically configures these aliases:

- `react` → `preact/compat`
- `react-dom` → `preact/compat`
- `react-dom/test-utils` → `preact/test-utils`

This means you can write React code and it will work with Preact without any changes!

## Configuration

The `packem.config.ts` uses the Preact preset:

```typescript
import { defineConfig } from "@visulima/packem/config";
import { createPreactPreset } from "@visulima/packem/config/preset/preact";

export default defineConfig({
    preset: createPreactPreset(),
});
```

The preset automatically configures:
- Babel with React preset (using Preact as JSX import source)
- React compatibility aliases
- Preact devtools injection
- Hook names plugin for better debugging

## Code Examples

### Using React Hooks

```typescript
// This works! React imports are aliased to preact/compat
import { useState, useEffect, useMemo, useCallback } from "react";

function MyComponent() {
    const [count, setCount] = useState(0);
    
    useEffect(() => {
        console.log("Mounted!");
    }, []);
    
    const doubled = useMemo(() => count * 2, [count]);
    
    const handleClick = useCallback(() => {
        setCount(c => c + 1);
    }, []);
    
    return <div>{doubled}</div>;
}
```

### Using React DOM APIs

```typescript
// This also works! react-dom is aliased to preact/compat
import { createRoot } from "react-dom/client";

const root = createRoot(document.getElementById("app"));
root.render(<App />);
```

## Why Use React-Style Imports?

1. **Familiar API**: If you're coming from React, you can use the same imports
2. **Library Compatibility**: React libraries work out of the box
3. **Code Reusability**: React code can be used as-is with Preact
4. **TypeScript Support**: Type definitions for React work with Preact/compat

## Components in This Example

- **App**: Demonstrates `useState` and `useEffect` from React
- **Counter**: Shows `useState` and `useMemo` from React
- **TodoList**: Uses `useState`, `useCallback`, and `useMemo` from React

All components use React-style imports but run on Preact!

## Testing

Run the build to see React-style code work with Preact:

```bash
pnpm build
```

The build will:
- Transform React imports to preact/compat via aliases
- Bundle everything with Preact (smaller bundle size)
- Maintain React API compatibility

## Benefits

- **Smaller Bundle**: Preact is ~3KB vs React's ~45KB
- **Same API**: Use React hooks and patterns you know
- **Better Performance**: Preact's optimized rendering
- **Library Support**: Most React libraries work via preact/compat
