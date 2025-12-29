import fs from "node:fs";

import type { PackageJson } from "@visulima/package";
import type { Plugin } from "rollup";

import { isBareSpecifier, isFromNodeModules, parseSpecifier } from "../../utils/import-specifier.js";

const typesPrefix = "@types/";

/**
 * Get the @types package name for a runtime package
 * e.g. 'react' → '@types/react'
 */
const getAtTypesPackageName = (packageName: string): string => {
    if (packageName.startsWith("@")) {
        const [scope, name] = packageName.split("/");

        return `${scope}/types/${name}`;
    }

    return `${typesPrefix}${packageName}`;
};

/**
 * Get the original package name from a @types package name
 * e.g. '@types/react' → 'react'
 * e.g. '@scope/types/package' → '@scope/package'
 */
const getOriginalPackageName = (typePackageName: string): string => {
    if (typePackageName.startsWith("@")) {
        const parts = typePackageName.split("/");

        if (parts[1] === "types") {
            return `@${parts[0]}/${parts.slice(2).join("/")}`;
        }
    }

    return typePackageName.replace(typesPrefix, "");
};

const dependencyTypes = ["peerDependencies", "dependencies", "optionalDependencies"] as const;

export type ExternalizeDependenciesOptions = {
    /**
     * Whether this is for types builds.
     * When true, enables @types package warnings.
     */
    forTypes?: boolean;

    /**
     * Skip warnings for unlisted dependencies.
     * Useful for type declaration builds where imports may not match runtime dependencies.
     */
    skipUnlistedWarnings?: boolean;
};

/**
 * Externalize dependencies based on package.json classification.
 *
 * - dependencies/peerDependencies/optionalDependencies: externalized
 * - devDependencies ONLY: error if not resolvable, bundle if resolvable
 * - unlisted: warn and bundle (only when imported from source, not node_modules)
 */
export const externalizeDependencies = (
    packageJson: PackageJson,
    pluginOptions?: ExternalizeDependenciesOptions,
): Plugin => {
    // Resolve to canonical path to handle Windows 8.3 short paths
    const { devDependencies } = packageJson;
    const cwd = fs.realpathSync.native(process.cwd());

    // Build sets for quick lookup
    const runtimeDependencies = new Set<string>();
    const devDeps = new Set<string>(Object.keys(packageJson.devDependencies || {}));

    // External dependencies (always externalized)
    for (const property of dependencyTypes) {
        const deps = packageJson[property];

        if (deps) {
            for (const packageName of Object.keys(deps)) {
                /**
                 * "@types/name" packages are imported as "name" in source
                 * e.g. '@types/react' is imported as 'react'
                 *
                 * This was motivated by @types/estree, which doesn't
                 * actually have a runtime package. It's a type-only package.
                 */
                if (packageName.startsWith(typesPrefix)) {
                    runtimeDependencies.add(getOriginalPackageName(packageName));
                } else {
                    runtimeDependencies.add(packageName);
                }
            }
        }
    }

    return {
        name: "externalize-dependencies",
        async resolveId(id, importer, options) {
            // Only process bare specifiers
            if (!isBareSpecifier(id)) {
                return null;
            }

            // Extract package name (handle @scoped/package)
            const [packageName] = parseSpecifier(id);

            // 1. External dependencies → externalize (always, even from node_modules)
            if (runtimeDependencies.has(packageName)) {
                // Check if @types package is in devDependencies while runtime package is externalized
                // Only warn when building types (not for JS-only builds)
                if (pluginOptions?.forTypes) {
                    const typePackageName = getAtTypesPackageName(packageName);

                    if (devDeps.has(typePackageName)) {
                        console.warn(
                            `Recommendation: "${typePackageName}" is bundled (devDependencies) but "${packageName}" is externalized. Place "${typePackageName}" in dependencies/peerDependencies as well so users don't have missing types.`,
                        );
                    }
                }

                return {
                    external: true,
                    id,
                };
            }

            // 2. devDependencies → error if unresolvable, bundle if resolvable
            if (devDeps.has(packageName)) {
                // Check that it's resolvable first
                const resolved = await this.resolve(id, importer, {
                    ...options,
                    skipSelf: true,
                });

                // If unresolvable, error
                if (!resolved) {
                    const errorMessage = `Could not resolve "${id}" even though it's declared in package.json. Try re-installing node_modules.`;

                    console.error(errorMessage);
                    throw new Error(errorMessage);
                }

                // Check if @types package is externalized while runtime package will be bundled
                // Only warn when building types (not for JS-only builds)
                if (pluginOptions?.forTypes) {
                    const typePackageName = getAtTypesPackageName(packageName);

                    if (runtimeDependencies.has(typePackageName)) {
                        console.warn(
                            `Recommendation: "${typePackageName}" is externalized but "${packageName}" is bundled (devDependencies). This may cause type mismatches for consumers. Consider moving "${packageName}" to dependencies or "${typePackageName}" to devDependencies.`,
                        );
                    }
                }

                return resolved;
            }

            // 3. Not listed → warn and bundle (only when imported from source)
            if (importer && !isFromNodeModules(importer, cwd) && !pluginOptions?.skipUnlistedWarnings) {
                console.warn(
                    `"${packageName}" imported by "${importer}" but not declared in package.json. Will be bundled to prevent failure at runtime.`,
                );
            }

            return undefined;
        },
    };
};
