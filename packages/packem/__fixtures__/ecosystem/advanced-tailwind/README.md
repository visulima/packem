# Advanced Tailwind CSS Ecosystem Test

This fixture tests Packem's ability to handle advanced Tailwind CSS v4 features including:

## Features Tested

- **@import "tailwindcss"** - Basic Tailwind CSS import
- **@import "preline/variants.css"** - Third-party CSS import
- **@source "../../node_modules/preline/dist/\*.js"** - JavaScript source inclusion
- **@plugin '@tailwindcss/typography'** - Tailwind plugin directives
- **@plugin '@tailwindcss/forms'** - Additional plugin directives
- **@custom-variant dark (&:where(.dark, .dark \*))** - Custom variant definitions
- **@apply directives** - Tailwind utility class composition

## Dependencies

- `tailwindcss` ^4.0.0 - Core Tailwind CSS
- `@tailwindcss/typography` - Typography plugin
- `@tailwindcss/forms` - Forms plugin
- `preline` - UI component library

## Test Purpose

This fixture validates that Packem can:

1. Process advanced Tailwind CSS v4 syntax
2. Handle plugin directives correctly
3. Process custom variant definitions
4. Manage complex import chains
5. Generate proper CSS output with source maps

## Expected Behavior

The build should successfully process the CSS file and generate:

- Compiled CSS with Tailwind utilities
- Proper source maps
- TypeScript declarations
- Working JavaScript bundle
