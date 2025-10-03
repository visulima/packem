# Native Modules Plugin Example

This example demonstrates how to use the `nativeModules` plugin to handle native Node.js addons (.node files) in your Rollup build.

## Basic Usage

```typescript
import { rollup } from 'rollup';
import { nativeModules } from '@visulima/packem-rollup';

const bundle = await rollup({
  input: 'src/index.js',
  plugins: [
    nativeModules({
      distDirectory: './dist',
      nativesDirectory: 'natives' // optional, defaults to 'natives'
    })
  ]
});

await bundle.write({
  dir: 'dist',
  format: 'es'
});
```

## How It Works

The `nativeModules` plugin works in two stages:

1. **Stage 1 (resolve/load)**: Identifies `.node` files and generates runtime code
2. **Stage 2 (generateBundle)**: Copies the identified `.node` files to the output directory

## Features

- **Automatic Detection**: Automatically detects and handles `.node` files in your imports
- **Name Collision Handling**: Handles name collisions by appending numbers to duplicate filenames
- **Custom Directory**: Allows you to specify a custom subdirectory for native modules
- **Error Handling**: Provides warnings when native modules are not found
- **Cross-Platform**: Handles path separators correctly on different operating systems

## Example Project Structure

```
src/
  index.js
  native-addon.node
dist/
  index.js
  natives/
    native-addon.node
```

## Import Usage

```javascript
// In your source code
import nativeAddon from './native-addon.node';

// The plugin will generate:
// export default require("./natives/native-addon.node");
```

## Options

- `distDirectory` (required): The output directory where native modules will be copied
- `nativesDirectory` (optional): Custom subdirectory name for native modules within the output directory (defaults to 'natives')