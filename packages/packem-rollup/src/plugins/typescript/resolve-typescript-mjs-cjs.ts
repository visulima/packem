/**
 * Plugin to resolve JS extensions to TypeScript equivalents.
 *
 * Resolution order depends on context:
 * - Source code relative imports: Try TS extensions (prefer TypeScript source)
 * - Bare specifiers (package imports): Try .js first, fallback to TS extensions
 * - node_modules relative imports: Try .js first, fallback to TS extensions
 *
 * Bare specifiers must try .js first because the .js extension refers to
 * the actual compiled file in the package, not a TypeScript convention.
 * Transforming the specifier before exports map resolution can cause
 * wildcard patterns to capture the wrong value (e.g. .ts.js).
 *
 * Extension map based on:
 * - esbuild rewrittenFileExtensions: https://github.com/evanw/esbuild/blob/main/internal/resolver/resolver.go#L1723-L1730
 * - TypeScript tryAddingExtensions: https://github.com/microsoft/TypeScript/blob/main/src/compiler/moduleNameResolver.ts#L2159-L2176
 *
 * For .jsx, esbuild tries [.ts, .tsx] while TypeScript tries [.tsx, .ts].
 * We follow TypeScript's order: .jsx implies JSX, so .tsx is the closer match.
 *
 * See:
 * - esbuild resolver.go loadAsFile (lines 1816-1840): literal path first, .ts last
 * - esbuild resolver.go exports map (lines 2651-2670): .ts only if file missing
 * - esbuild CHANGELOG v0.18.0: prefer .js over .ts in node_modules
 */
import { isAbsolute } from "node:path";

import type { Plugin } from "rollup";

// Based on esbuild's rewrittenFileExtensions and TypeScript's tryAddingExtensions.
// .jsx order follows TypeScript (prefers .tsx) over esbuild (prefers .ts).
const tsExtensions: Record<string, string[]> = {
    ".cjs": [".cts"],
    ".js": [".ts", ".tsx"],
    ".jsx": [".tsx", ".ts"],
    ".mjs": [".mts"],
};

const jsExtensionRegex = /\.(?:[mc]?js|jsx)$/;

const isBareSpecifier = (id: string): boolean => {
    const firstCharacter = id[0];

    return !(firstCharacter === "." || firstCharacter === "/" || firstCharacter === "#" || isAbsolute(id));
};

const resolveTypescriptMjsCts = (): Plugin => ({
    name: "packem:resolve-typescript-mjs-cjs",
    async resolveId(id, importer, options) {
        if (!importer) {
            return undefined;
        }

        const match = jsExtensionRegex.exec(id);

        if (!match) {
            return undefined;
        }

        const extension = match[0];
        const rewrites = tsExtensions[extension];

        if (!rewrites) {
            return undefined;
        }

        const base = id.slice(0, -extension.length);
        const resolveOptions = {
            ...options,
            skipSelf: true,
        };

        // For source code relative imports: try TS extensions in order
        // In TypeScript convention, ./file.js means ./file.ts
        if (!isBareSpecifier(id) && !importer.includes("/node_modules/")) {
            for (const tsExtension of rewrites) {
                // eslint-disable-next-line no-await-in-loop
                const resolved = await this.resolve(base + tsExtension, importer, resolveOptions);

                if (resolved) {
                    return resolved;
                }
            }

            return undefined;
        }

        // For bare specifiers and node_modules imports:
        // try .js first, only use TS extensions if .js doesn't resolve
        const jsResolved = await this.resolve(id, importer, resolveOptions);

        if (jsResolved) {
            return jsResolved;
        }

        for (const tsExtension of rewrites) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const resolved = await this.resolve(base + tsExtension, importer, resolveOptions);

                if (resolved) {
                    return resolved;
                }
            } catch {
                // externalizeDependencies throws for unresolvable devDep
                // bare specifiers — continue to try the next extension
            }
        }

        return undefined;
    },
});

export default resolveTypescriptMjsCts;
