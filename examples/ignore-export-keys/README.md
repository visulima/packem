# Ignore Export Keys Example

This example demonstrates how to use the `ignoreExportKeys` option to exclude specific export keys from being processed as build entries.

## Problem

When you have exports in your `package.json` that only contain non-JavaScript assets (like images, CSS files, etc.), packem will try to find source files for these exports and generate warnings when it can't find them.

For example, with this `package.json`:

```json
{
  "exports": {
    ".": "./dist/index.mjs",
    "./images": "./dist/images/icon.png",
    "./assets": "./dist/assets/logo.svg",
    "./styles": "./dist/styles.css"
  }
}
```

Packem would normally try to find source files for `./images`, `./assets`, and `./styles` and warn when it can't find them.

## Solution

Use the `ignoreExportKeys` option to tell packem to skip these exports:

```typescript
// packem.config.ts
import type { BuildConfig } from "@visulima/packem";

const config: BuildConfig = {
  ignoreExportKeys: ["images", "assets", "styles"],
};

export default config;
```

Or via CLI:

```bash
packem build --ignore-export-keys=images,assets,styles
```

## Result

With `ignoreExportKeys` configured:
- Only the main export (`"."`) will be processed as a build entry
- No warnings will be generated for the ignored exports
- The ignored exports will still be available in the final `package.json` for consumers

## Usage

1. Run `pnpm build` to see normal behavior (with warnings)
2. Run `pnpm build:ignore-assets` to see the ignored behavior (no warnings)

## How it works

The example demonstrates:

1. **Source files**: 
   - `src/index.ts` - The main JavaScript module
   - `src/images/icon.svg` - An SVG icon
   - `src/assets/logo.svg` - An SVG logo
   - `src/styles.css` - CSS styles

2. **Package.json exports**:
   ```json
   {
     "exports": {
       ".": "./dist/index.js",
       "./images": "./dist/images/icon.svg",
       "./assets": "./dist/assets/logo.svg", 
       "./styles": "./dist/styles.css"
     }
   }
   ```

3. **Build configuration**:
   - `ignoreExportKeys: ["images", "assets", "styles"]` - Tells packem to skip these exports
   - `allowedExportExtensions: [".svg", ".css", ".png", ".jpg", ".jpeg", ".gif", ".webp"]` - Allows these file extensions in exports
   - `copy` plugin - Copies the asset files to the output directory
   - Only `src/index.ts` is processed as a build entry

4. **Result**:
   - `dist/index.js` - Built JavaScript module
   - `dist/images/icon.svg` - Copied SVG icon
   - `dist/assets/logo.svg` - Copied SVG logo  
   - `dist/styles.css` - Copied CSS file
   - No warnings about missing source files for the ignored exports 