# Extra Conditions Feature Usage Example

## Enhanced Warning Messages

The Packem validation system now provides helpful guidance when it encounters unknown export conditions in your `package.json`.

## Example 1: Unknown Condition Without Extra Conditions Configured

When you have a custom condition that Packem doesn't recognize:

**package.json:**
```json
{
  "name": "my-package",
  "exports": {
    "custom-bundler": "./dist/custom.js",
    "default": "./dist/index.js"
  }
}
```

**Warning Message:**
```
Unknown export conditions [custom-bundler] at exports. Consider using standard conditions (default, import, module-sync, node, node-addons, require) or add custom conditions using the 'extraConditions' option in your validation config.
```

## Example 2: Unknown Condition With Extra Conditions Already Configured

If you already have some extra conditions configured but encounter a new unknown one:

**packem.config.ts:**
```typescript
import { defineConfig } from "@visulima/packem/config";

export default defineConfig({
  validation: {
    packageJson: {
      extraConditions: ["known-custom"]
    }
  }
});
```

**package.json:**
```json
{
  "name": "my-package",
  "exports": {
    "known-custom": "./dist/known.js",
    "unknown-custom": "./dist/unknown.js",
    "default": "./dist/index.js"
  }
}
```

**Warning Message:**
```
Unknown export conditions [unknown-custom] at exports. Consider using standard conditions (default, import, module-sync, node, node-addons, require) or add custom conditions to 'validation.packageJson.extraConditions' in your packem config.
```

## How to Fix

To resolve these warnings, add your custom conditions to the `extraConditions` array:

**packem.config.ts:**
```typescript
import { defineConfig } from "@visulima/packem/config";

export default defineConfig({
  validation: {
    packageJson: {
      extraConditions: ["custom-bundler", "my-framework", "special-runtime"]
    }
  }
});
```

## Benefits

1. **Clear Guidance**: The warning messages now explicitly mention the `extraConditions` option
2. **Context-Aware**: Different messages depending on whether you already have extra conditions configured
3. **Actionable**: Provides specific instructions on how to resolve the warning
4. **Educational**: Lists standard conditions for reference

This enhancement makes it much easier for developers to understand how to properly configure custom export conditions in their projects.
