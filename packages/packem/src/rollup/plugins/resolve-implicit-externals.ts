import { stat } from "node:fs/promises";

import { isAccessible } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import { parsePackageJsonSync } from "@visulima/package/package-json";
import type { BuildContext } from "@visulima/packem-share/types";
import { dirname, join, relative, resolve } from "@visulima/path";
import MagicString from "magic-string";
import type { Plugin, TransformResult } from "rollup";

import type { InternalBuildOptions } from "../../types";
import { isBareSpecifier, parseSpecifier } from "../../utils/import-specifier";

/**
 * Try to resolve a file with implicit extensions (.js, .json)
 * or as a directory (index.js, package.json main field).
 */
const tryResolveImplicit = async (basePath: string): Promise<string | undefined> => {
    // Try exact path first
    try {
        const stats = await stat(basePath);
        if (stats.isFile()) {
            return basePath;
        }
        if (stats.isDirectory()) {
            // Try directory resolution: index.js, then index.json
            const indexJs = join(basePath, "index.js");
            if (await isAccessible(indexJs)) {
                return indexJs;
            }
            const indexJson = join(basePath, "index.json");
            if (await isAccessible(indexJson)) {
                return indexJson;
            }
        }
    } catch {
        // File doesn't exist, continue to try extensions
    }

    // Try with .js extension
    const jsPath = `${basePath}.js`;
    if (await isAccessible(jsPath)) {
        return jsPath;
    }

    // Try with .json extension
    const jsonPath = `${basePath}.json`;
    if (await isAccessible(jsonPath)) {
        return jsonPath;
    }

    return undefined;
};

/**
 * Find package.json by walking up the directory tree.
 */
const findPackageJson = async (startDirectory: string, packageName: string): Promise<string | undefined> => {
    let currentDirectory = startDirectory;
    const root = resolve("/");

    while (currentDirectory !== root && currentDirectory !== dirname(currentDirectory)) {
        const packageJsonPath = join(currentDirectory, "node_modules", packageName, "package.json");
        // eslint-disable-next-line no-await-in-loop
        if (await isAccessible(packageJsonPath)) {
            return packageJsonPath;
        }
        currentDirectory = dirname(currentDirectory);
    }

    return undefined;
};


/**
 * Resolve implicit extensions for externalized package imports.
 *
 * This plugin runs BEFORE resolveExternalsPlugin to check if externalized
 * imports need explicit extensions added for Node.js compatibility.
 *
 * For packages without `exports`, Node.js doesn't support extensionless imports:
 * - `external-pkg/file` fails in Node.js
 * - `external-pkg/file.js` works
 *
 * This plugin:
 * 1. Checks if package is in dependencies/peerDependencies (will be externalized)
 * 2. For externalized bare specifiers with subpaths, checks if package has `exports`
 * 3. If no exports, resolves the file with implicit extensions
 * 4. Rewrites the import to include the explicit path.
 */
const resolveImplicitExternalsPlugin = (context: BuildContext<InternalBuildOptions>): Plugin => {
    // Cache for package.json reads and resolution results
    const packageJsonCache = new Map<string, PackageJson | undefined>();
    const resolutionCache = new Map<string, string | undefined>();

    // Build set of external packages once
    const externalPackages = new Set<string>();
    if (context.pkg.dependencies) {
        Object.keys(context.pkg.dependencies).forEach((pkg) => externalPackages.add(pkg));
    }
    if (context.pkg.peerDependencies) {
        Object.keys(context.pkg.peerDependencies).forEach((pkg) => externalPackages.add(pkg));
    }
    if (context.pkg.optionalDependencies) {
        Object.keys(context.pkg.optionalDependencies).forEach((pkg) => externalPackages.add(pkg));
    }

    const isExternalPackage = (packageName: string): boolean => externalPackages.has(packageName);

    return {
        name: "packem:resolve-implicit-externals",
        async transform(code: string, id: string): Promise<TransformResult> {
            // Only process source files (not node_modules or virtual modules)
            if (id.includes("/node_modules/") || id.startsWith("\0")) {
                return undefined;
            }

            // Find all import/export statements with bare specifiers
            // Match import/export statements by finding 'from' keyword and extracting the module specifier
            const fromRegex = /\bfrom\s+['"`]([^'"`]+)['"`]/g;
            const matches: { importId: string; quoteEnd: number; quoteStart: number }[] = [];

            let regexMatch;
            // eslint-disable-next-line no-cond-assign
            while ((regexMatch = fromRegex.exec(code)) !== null) {
                const importId = regexMatch[1];
                if (!importId || !isBareSpecifier(importId)) {
                    continue;
                }

                const [packageName, subpath] = parseSpecifier(importId);
                if (subpath && packageName && isExternalPackage(packageName)) {
                    const quoteStart = regexMatch.index + regexMatch[0].indexOf(importId);
                    matches.push({
                        importId,
                        quoteEnd: quoteStart + importId.length,
                        quoteStart,
                    });
                }
            }

            if (matches.length === 0) {
                return undefined;
            }

            // Resolve all matches
            const startDirectory = dirname(id);
            const resolutions = await Promise.all(
                matches.map(async (matchItem) => {
                    const [packageName, subpath] = parseSpecifier(matchItem.importId);
                    if (!subpath) {
                        return undefined;
                    }

                    const cacheKey = `${packageName}:${subpath}:${startDirectory}`;

                    // Check cache first
                    const cached = resolutionCache.get(cacheKey);
                    if (cached !== undefined) {
                        return cached ? { ...matchItem, resolvedId: cached } : undefined;
                    }

                    // Find package.json
                    const packageJsonPath = await findPackageJson(startDirectory, packageName);
                    if (!packageJsonPath) {
                        resolutionCache.set(cacheKey, undefined);
                        return undefined;
                    }

                    // Read and cache package.json
                    let pkgJson = packageJsonCache.get(packageJsonPath);
                    if (pkgJson === undefined) {
                        try {
                            pkgJson = parsePackageJsonSync(packageJsonPath, {
                                resolveCatalogs: true,
                            });
                            packageJsonCache.set(packageJsonPath, pkgJson);
                        } catch {
                            packageJsonCache.set(packageJsonPath, undefined);
                            resolutionCache.set(cacheKey, undefined);
                            return undefined;
                        }
                    }

                    if (!pkgJson) {
                        resolutionCache.set(cacheKey, undefined);
                        return undefined;
                    }

                    // If package has exports field, let Node.js handle resolution (even if subpath not defined)
                    if (pkgJson.exports) {
                        resolutionCache.set(cacheKey, undefined);
                        return undefined;
                    }

                    // Resolve with implicit extensions
                    const packageDirectory = dirname(packageJsonPath);
                    const subpathFullPath = join(packageDirectory, subpath);
                    const resolvedPath = await tryResolveImplicit(subpathFullPath);

                    if (!resolvedPath) {
                        resolutionCache.set(cacheKey, undefined);
                        return undefined;
                    }

                    const relativePath = relative(packageDirectory, resolvedPath);
                    const resolvedId = `${packageName}/${relativePath}`;
                    resolutionCache.set(cacheKey, resolvedId);

                    return { ...matchItem, resolvedId };
                }),
            );

            // Apply changes
            const validResolutions = resolutions.filter((r): r is NonNullable<typeof r> => r !== undefined);
            if (validResolutions.length === 0) {
                return undefined;
            }

            const magicString = new MagicString(code);
            for (const { quoteEnd, quoteStart, resolvedId } of validResolutions) {
                magicString.overwrite(quoteStart, quoteEnd, resolvedId);
                this.debug(`[resolve-implicit-externals] Rewriting ${code.slice(quoteStart, quoteEnd)} -> ${resolvedId} in ${id}`);
            }

            return {
                code: magicString.toString(),
                map: magicString.generateMap({ hires: true }),
            };
        },
    };
};

export default resolveImplicitExternalsPlugin;
