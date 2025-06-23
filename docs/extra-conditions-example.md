# Extra Conditions Example

This example demonstrates how to use the `extraConditions` option in package.json validation to allow custom export conditions.

## Configuration

```js
// packem.config.ts
import { defineConfig } from "packem";

export default defineConfig({
    entries: [
        {
            input: "src/index.ts",
        },
    ],
    validation: {
        packageJson: {
            extraConditions: ["custom-bundler", "my-framework", "special-env"]
        }
    }
});
```

## Package.json Example

```json
{
    "name": "my-package",
    "exports": {
        ".": {
            "custom-bundler": "./dist/custom.js",
            "my-framework": "./dist/framework.js",
            "special-env": "./dist/special.js",
            "import": "./dist/index.mjs",
            "require": "./dist/index.cjs",
            "default": "./dist/index.js"
        }
    }
}
```

## What this does

- Without `extraConditions`: Packem would warn about unknown conditions `custom-bundler`, `my-framework`, and `special-env`
- With `extraConditions`: These custom conditions are recognized as valid and no warnings are generated
- Unknown conditions not listed in `extraConditions` will still generate warnings

## Use Cases

- Custom bundler-specific conditions
- Framework-specific export conditions
- Environment-specific conditions
- Tool-specific conditions
- Any custom export condition your package needs to support
