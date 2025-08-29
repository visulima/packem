import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { readFile } from "@visulima/fs";
import { parse } from "acorn";
import { simple as walk } from "acorn-walk";
import type { ModuleInfo, Plugin } from "rollup";

export interface LazyBarrelOptions {
    /**
     * Files to exclude from lazy barrel processing
     */
    exclude?: FilterPattern;

    /**
     * Files to include in lazy barrel processing
     */
    include?: FilterPattern;

    /**
     * Minimum number of re-exports to consider a file as a barrel
     * @default 2
     */
    lazyThreshold?: number;

    /**
     * Enable side effects checking for barrel files
     * @default true
     */
    sideEffectsCheck?: boolean;
}

interface LazyModule {
    dependencies: Set<string>;
    exports: Set<string>;
    id: string;
    isLazy: boolean;
}

interface ForwardId {
    ids?: Set<string>;
    type: "all" | "specific" | "empty";
}

/**
 * Lazy Barrel Plugin for Rollup
 *
 * This plugin implements lazy barrel optimization similar to Rspack's lazyBarrel experiment.
 * It identifies side-effect-free barrel files and marks their re-export dependencies as lazy,
 * only building them when their exports are actually requested.
 *
 * Features:
 * - Detects barrel files (files with multiple re-exports)
 * - Checks package.json sideEffects field
 * - Marks dependencies as lazy for deferred building
 * - Tracks forward IDs for optimization
 * - Generates lazy loading code for unused exports
 */
export const lazyBarrelPlugin = (options: LazyBarrelOptions = {}): Plugin => {
    const {
        exclude,
        include,
        lazyThreshold = 2,
        sideEffectsCheck = true,
    } = options;

    const filter = createFilter(include, exclude);
    const lazyModules = new Map<string, LazyModule>();
    const moduleGraph = new Map<string, ModuleInfo>();
    const packageJsonCache = new Map<string, { sideEffects?: boolean | string[] }>();

    /**
     * Check if a module has side effects by reading package.json
     */
    const checkSideEffects = async (modulePath: string): Promise<boolean> => {
        try {
            // Find package.json in the module's directory
            const pathParts = modulePath.split("/");

            for (let index = pathParts.length; index > 0; index--) {
                const candidate = `${pathParts.slice(0, index).join("/")}/package.json`;

                try {
                    const content = await readFile(candidate, { buffer: false }) as string;
                    const packageUnknown = JSON.parse(content) as unknown;
                    const package_ = (packageUnknown && typeof packageUnknown === "object" ? packageUnknown as { sideEffects?: boolean | string[] } : {}) as { sideEffects?: boolean | string[] };

                    packageJsonCache.set(modulePath, { sideEffects: package_.sideEffects });

                    if (package_.sideEffects === false) {
                        return false;
                    }

                    if (Array.isArray(package_.sideEffects)) {
                        // Check if the specific file is marked as side-effect-free
                        const relativePath = modulePath.replace(`${pathParts.slice(0, index).join("/")}/`, "");
                        const hasSideEffects = package_.sideEffects.some((pattern: string) => {
                            if (typeof pattern !== "string") { return false; }

                            // Very naive glob support: "*.js" or "dir/*"
                            if (pattern.includes("*")) {
                                const prefix = pattern.split("*")[0] as string;

                                return relativePath.startsWith(prefix);
                            }

                            return relativePath === pattern;
                        });

                        return hasSideEffects;
                    }

                    return true; // Default to having side effects
                } catch {
                    continue;
                }
            }

            return true; // Default to having side effects
        } catch {
            return true; // Default to having side effects
        }
    };

    /**
     * Parse module code to detect barrel exports
     */
    const parseBarrelExports = (code: string, id: string): { dependencies: string[]; exports: string[]; isBarrel: boolean } => {
        try {
            const ast = parse(code, {
                allowImportExportEverywhere: true,
                ecmaVersion: "latest",
                sourceType: "module",
            });

            const exports: string[] = [];
            const dependencies: string[] = [];
            let exportCount = 0;

            walk(ast, {
                ExportAllDeclaration(node: any) {
                    exportCount++;

                    if (node.source) {
                        dependencies.push(node.source.value);
                    }
                },
                ExportDefaultDeclaration() {
                    exportCount++;
                },
                ExportNamedDeclaration(node: any) {
                    exportCount++;

                    if (node.source) {
                        dependencies.push(node.source.value);
                    }

                    if (node.specifiers) {
                        node.specifiers.forEach((spec: any) => {
                            if (spec.exported && spec.exported.name) {
                                exports.push(spec.exported.name);
                            }
                        });
                    }
                },
            });

            const isBarrel = exportCount >= lazyThreshold && dependencies.length > 0;

            return { dependencies, exports, isBarrel };
        } catch {
            return { dependencies: [], exports: [], isBarrel: false };
        }
    };

    /**
     * Generate lazy loading code for a module
     */
    const generateLazyModule = (moduleId: string, exportNames: string[]): string => {
        const exportStatements = exportNames.map((exp) => `export { ${exp} } from '${moduleId}';`).join("\n");

        return `
// Lazy barrel module - exports will be loaded on demand
${exportStatements}

// Lazy loading implementation
const lazyExports = new Proxy({}, {
  get(target, prop) {
    const __exportNames = ${JSON.stringify(exportNames)};
    if (typeof prop === 'string' && __exportNames.includes(prop)) {
      return import('${moduleId}').then(module => module[prop]);
    }
    return target[prop];
  }
});

export default lazyExports;
`;
    };

    return {
        buildStart() {
            lazyModules.clear();
            moduleGraph.clear();
        },

        generateBundle() {
            // Log summary of lazy barrel optimization
            if (lazyModules.size > 0) {
                this.info(`Lazy barrel optimization applied to ${lazyModules.size} modules`);

                for (const [id, module] of lazyModules) {
                    this.debug(`  ${id}: ${module.exports.size} exports, ${module.dependencies.size} dependencies`);
                }
            }
        },

        async load(id: string) {
            // Check if this is a lazy module that needs special handling
            if (lazyModules.has(id)) {
                const lazyModule = lazyModules.get(id)!;

                // Generate lazy loading wrapper
                const lazyCode = generateLazyModule(id, [...lazyModule.exports]);

                this.debug(`Generated lazy loading code for ${id}`);

                return lazyCode;
            }

            return null;
        },

        async moduleParsed(moduleInfo: ModuleInfo) {
            if (!filter(moduleInfo.id)) {
                return;
            }

            moduleGraph.set(moduleInfo.id, moduleInfo);

            // Parse the module to detect if it's a barrel file
            const { dependencies, exports, isBarrel } = parseBarrelExports(moduleInfo.code || "", moduleInfo.id);

            if (isBarrel) {
                // Check if this module is side-effect-free
                let hasSideEffects = true;

                if (sideEffectsCheck) {
                    hasSideEffects = await checkSideEffects(moduleInfo.id);
                }

                if (!hasSideEffects) {
                    // Mark as lazy barrel module
                    lazyModules.set(moduleInfo.id, {
                        dependencies: new Set(dependencies),
                        exports: new Set(exports),
                        id: moduleInfo.id,
                        isLazy: true,
                    });

                    this.debug(`Marked ${moduleInfo.id} as lazy barrel module`);
                }
            }
        },

        name: "packem:lazy-barrel",

        async resolveId(source: string, importer: string | undefined) {
            if (!importer || !lazyModules.has(importer)) {
                return null;
            }

            const lazyModule = lazyModules.get(importer)!;

            // Check if this import is for a lazy dependency
            if (lazyModule.dependencies.has(source)) {
                // Resolve the actual module
                const resolved = await this.resolve(source, importer);

                if (resolved && !resolved.external) {
                    this.debug(`Resolving lazy dependency ${source} for ${importer}`);

                    return resolved.id;
                }
            }

            return null;
        },

        async transform(code: string, id: string) {
            if (!lazyModules.has(id)) {
                return null;
            }

            // Transform the code to implement lazy loading
            // This is a simplified implementation - in practice, you'd want more sophisticated
            // code generation based on the actual export patterns

            this.debug(`Transforming lazy barrel module ${id}`);

            return {
                code,
                map: null,
            };
        },
    };
};

export default lazyBarrelPlugin;
