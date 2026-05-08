#!/usr/bin/env bash
# Bootstrap the workspace by tsc-compiling packages in dependency order.
# Used when packem itself isn't built yet (chicken-and-egg problem).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bootstrap_pkg() {
    local pkg="$1"
    echo "==> Bootstrapping packages/$pkg"
    cd "$ROOT/packages/$pkg"
    rm -rf dist
    cat > tsconfig.bootstrap.json <<EOF
{
    "extends": "./tsconfig.json",
    "compilerOptions": {
        "noEmit": false,
        "outDir": "dist",
        "rootDir": "src",
        "declaration": true,
        "skipLibCheck": true,
        "types": ["node"]
    },
    "include": ["src/**/*", "*.d.ts"],
    "exclude": ["__tests__", "**/*.test.ts", "**/__fixtures__/**"]
}
EOF
    pnpm exec tsc -p tsconfig.bootstrap.json || true
    rm -f tsconfig.bootstrap.json
    cd "$ROOT"
}

# Order: leaves first, then dependents
bootstrap_pkg "packem-share"
bootstrap_pkg "rollup-plugin-dts"
bootstrap_pkg "css-style-inject"
bootstrap_pkg "packem-rollup"
bootstrap_pkg "rollup-plugin-css"

echo "==> Bootstrap complete"
