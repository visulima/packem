# JAR File Exports Validation

## Overview

This document describes the JAR file exports validation feature that validates that exports in `package.json` match the built files, while allowing extra exports with valid paths.

## Implementation

### Features

1. **Export-to-Built-File Matching**: Validates that exports in `package.json` match actual built files
2. **Extra Exports Support**: Allows extra exports in `package.json` but validates that the file paths exist and are valid
3. **Path Validation**: Checks if export paths point to valid files (not directories)
4. **Glob Pattern Support**: Handles dynamic patterns (globs) in exports
5. **Builder Integration**: Automatically runs after build completes to ensure `buildEntries` are populated

### Configuration

The validation can be configured via `validation.packageJson.jarFileExports`:

```typescript
{
  validation: {
    packageJson: {
      jarFileExports: true | "allow-extra" | "strict" | false
    }
  }
}
```

- `false`: Disable validation
- `true` or `"allow-extra"`: Validate exports match built files, but allow extra exports with valid paths (default)
- `"strict"`: Validate exports match built files and warn about unexported built files

### Validation Modes

#### Default Mode (`true` or `"allow-extra"`)
- Validates that exports match built files
- Allows extra exports if the file path exists and is valid
- Warns about exports that don't match built files (unless in `allow-extra` mode)

#### Strict Mode (`"strict"`)
- All default mode validations
- Additionally warns about built files that aren't exported in `package.json`

### Valid Cases

The validator handles the following cases:

1. **Exact Match**: Export path matches a built file
   ```json
   {
     "exports": {
       ".": "./dist/index.js"
     }
   }
   ```
   ✅ Valid if `dist/index.js` exists and was built

2. **Extra Export with Valid Path**: Export path exists but wasn't built
   ```json
   {
     "exports": {
       "./utils": "./src/utils.js"
     }
   }
   ```
   ✅ Valid if `src/utils.js` exists (even if not built)

3. **Glob Patterns**: Dynamic patterns in exports
   ```json
   {
     "exports": {
       "./components/*": "./dist/components/*.js"
     }
   }
   ```
   ✅ Valid if glob pattern matches at least one built file

4. **Conditional Exports**: Different paths for different conditions
   ```json
   {
     "exports": {
       ".": {
         "import": "./dist/index.mjs",
         "require": "./dist/index.cjs"
       }
     }
   }
   ```
   ✅ Valid if both paths exist and match built files

5. **Ignored Export Keys**: Exports marked as ignored
   ```typescript
   {
     ignoreExportKeys: ["internal"]
   }
   ```
   ✅ Ignored exports are skipped during validation

### Invalid Cases

The validator reports errors for:

1. **Non-existent Files**: Export path points to a file that doesn't exist
   ```json
   {
     "exports": {
       ".": "./dist/missing.js"
     }
   }
   ```
   ❌ Error: "File does not exist"

2. **Directory Paths**: Export path points to a directory instead of a file
   ```json
   {
     "exports": {
       ".": "./dist"
     }
   }
   ```
   ❌ Error: "Path points to a directory, not a file"

3. **Invalid Glob Patterns**: Glob pattern that doesn't match any files and path doesn't exist
   ```json
   {
     "exports": {
       "./components/*": "./nonexistent/*.js"
     }
   }
   ```
   ❌ Error: "Glob pattern path does not exist"

4. **Unmatched Exports** (in non-allow-extra mode): Export doesn't match any built files
   ```json
   {
     "exports": {
       ".": "./dist/index.js"
     }
   }
   ```
   ⚠️ Warning: "Export does not match any built files" (if file doesn't exist or wasn't built)

5. **Unexported Built Files** (in strict mode): Built files that aren't in exports
   ```
   Built: dist/index.js, dist/utils.js
   Exports: { ".": "./dist/index.js" }
   ```
   ⚠️ Warning: "Found built file(s) that are not exported"

## Proposed Additional Validation Cases

### 1. Export Path Consistency Validation
**Purpose**: Ensure export paths use consistent naming conventions

**Validation**:
- Check if export paths follow project naming conventions
- Warn if mixed naming styles are used (e.g., kebab-case vs camelCase)

**Example**:
```json
{
  "exports": {
    "./my-component": "./dist/my-component.js",  // ✅ kebab-case
    "./MyComponent": "./dist/MyComponent.js"      // ⚠️ Mixed naming
  }
}
```

### 2. Export Path Extension Validation
**Purpose**: Ensure export paths use correct file extensions based on package type

**Validation**:
- For ESM packages, warn if `.cjs` extensions are used
- For CJS packages, warn if `.mjs` extensions are used
- Suggest correct extensions based on package type

**Example**:
```json
{
  "type": "module",
  "exports": {
    ".": "./dist/index.cjs"  // ⚠️ Should use .mjs for ESM package
  }
}
```

### 3. Export Path Depth Validation
**Purpose**: Prevent overly deep export paths that may cause issues

**Validation**:
- Warn if export paths exceed a certain depth (e.g., more than 3 levels)
- Suggest flattening the structure

**Example**:
```json
{
  "exports": {
    "./a/b/c/d/e/f": "./dist/a/b/c/d/e/f.js"  // ⚠️ Too deep
  }
}
```

### 4. Duplicate Export Path Validation
**Purpose**: Detect duplicate export paths that may cause conflicts

**Validation**:
- Check for duplicate export keys pointing to different files
- Check for different export keys pointing to the same file (may be intentional but worth warning)

**Example**:
```json
{
  "exports": {
    ".": "./dist/index.js",
    "./index": "./dist/index.js"  // ⚠️ Same file, different keys
  }
}
```

### 5. Export Path Accessibility Validation
**Purpose**: Ensure exported files are accessible and not blocked by package.json `files` field

**Validation**:
- Check if exported files are included in `files` field
- Warn if exported files may not be published

**Example**:
```json
{
  "files": ["dist/index.js"],
  "exports": {
    ".": "./dist/index.js",      // ✅ Included
    "./utils": "./dist/utils.js" // ⚠️ May not be published
  }
}
```

### 6. Conditional Export Completeness Validation
**Purpose**: Ensure all necessary conditions are provided

**Validation**:
- For packages emitting both ESM and CJS, check that both `import` and `require` conditions exist
- Warn if `types` condition is missing when declaration files are generated

**Example**:
```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
      // ⚠️ Missing "types" condition
    }
  }
}
```

### 7. Export Path Case Sensitivity Validation
**Purpose**: Detect potential case-sensitivity issues on case-insensitive file systems

**Validation**:
- Warn if export paths differ only by case
- Suggest using consistent casing

**Example**:
```json
{
  "exports": {
    "./Component": "./dist/component.js",  // ⚠️ Case mismatch
    "./component": "./dist/component.js"
  }
}
```

### 8. Export Path Relative Path Validation
**Purpose**: Ensure export paths are properly relative

**Validation**:
- Check that all export paths start with `./`
- Warn about absolute paths or paths without `./` prefix

**Example**:
```json
{
  "exports": {
    ".": "dist/index.js",        // ⚠️ Should be "./dist/index.js"
    "./utils": "/absolute/path"   // ❌ Absolute paths not allowed
  }
}
```

## Integration Points

### Builder Integration
The validation runs automatically after the build completes in `packages/packem/src/packem/build.ts`:

```typescript
// After build completes
await validateJarFileExportsAfterBuild(context);
```

### Release Command Integration
If the release command doesn't perform this validation, the builder will handle it automatically. This ensures validation happens even if release steps are skipped.

## Files Modified

1. `packages/packem/src/validator/package-json/validate-jar-file-exports.ts` - New validator
2. `packages/packem/src/validator/package-json/index.ts` - Export validator function
3. `packages/packem/src/types.ts` - Added `jarFileExports` configuration option
4. `packages/packem/src/packem/build.ts` - Integrated validation after build
5. `packages/packem/src/packem/index.ts` - Updated default configuration

## Testing Recommendations

1. Test with exact matches between exports and built files
2. Test with extra exports that have valid paths
3. Test with invalid paths (non-existent files, directories)
4. Test with glob patterns
5. Test with conditional exports
6. Test with ignored export keys
7. Test strict mode with unexported built files
8. Test with different package types (ESM vs CJS)
