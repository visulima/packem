import path from "node:path";

import { ResolverFactory } from "oxc-resolver";
import type { Plugin, ResolvedId } from "rollup";

import { filename_to_dts, RE_CSS, RE_DTS, RE_JSON, RE_NODE_MODULES, RE_TS, RE_VUE } from "./filename";
import type { OptionsResolved } from "./options";

const isSourceFile = (id: string) => RE_TS.test(id) || RE_VUE.test(id) || RE_JSON.test(id);

const createDtsResolvePlugin = ({
    cwd,
    resolve,
    resolver,
    sideEffects,
    tsconfig,
    tsconfigRaw,
}: Pick<OptionsResolved, "cwd" | "tsconfig" | "tsconfigRaw" | "resolve" | "resolver" | "sideEffects">): Plugin => {
    const dtsResolver = new ResolverFactory({
        conditionNames: ["types", "typings", "import", "require"],
        mainFields: ["types", "typings", "module", "main"],
        tsconfig: tsconfig ? { configFile: tsconfig, references: "auto" } : undefined,
    });
    const moduleSideEffects = sideEffects ? true : null;

    return {
        name: "rollup-plugin-dts:resolver",

        resolveId: {
            async handler(id, importer, options) {
                // Guard: Only operate on imports inside .d.ts files
                if (!importer || !RE_DTS.test(importer)) {
                    return;
                }

                const external = {
                    external: true,
                    id,
                    moduleSideEffects: sideEffects,
                };

                // Guard: Externalize non-code imports
                if (RE_CSS.test(id)) {
                    return external;
                }

                // Get Rollup's resolution first for fallback and policy checks
                const rollupResolution = await this.resolve(id, importer, options);

                // If rollup already marked the resolution as external, respect it
                if (rollupResolution?.external) {
                    return external;
                }

                const dtsResolution = await resolveDtsPath(id, importer, rollupResolution);

                // If resolution failed, error or externalize
                if (!dtsResolution) {
                    const isFileImport = isFilePath(id);

                    // Auto-export unresolvable packages
                    return isFileImport ? null : external;
                }

                // Externalize non-bundled node_modules dependencies
                if (
                    // request resolved to inside node_modules
                    RE_NODE_MODULES.test(dtsResolution)
                    // User doesn't want to bundle this module
                    && !shouldBundleNodeModule(id)
                ) {
                    return external;
                }

                // The path is either a declaration file or a source file that needs redirection.
                if (RE_DTS.test(dtsResolution)) {
                    // It's already a .d.ts file, we're done
                    return {
                        id: dtsResolution,
                        moduleSideEffects,
                    };
                }

                if (isSourceFile(dtsResolution)) {
                    // It's a .ts/.vue source file, so we load it to ensure its .d.ts is generated,
                    // then redirect the import to the future .d.ts path
                    await this.load({ id: dtsResolution });

                    return {
                        id: filename_to_dts(dtsResolution),
                        moduleSideEffects,
                    };
                }

                return null;
            },
            order: "pre",
        },
    };

    function shouldBundleNodeModule(id: string) {
        if (typeof resolve === "boolean")
            return resolve;

        return resolve.some((pattern) => (typeof pattern === "string" ? id === pattern : pattern.test(id)));
    }

    async function resolveDtsPath(id: string, importer: string, rollupResolution: ResolvedId | null): Promise<string | null> {
        let dtsPath: string | undefined | null;

        if (resolver === "tsc") {
            const { default: tscResolve } = await import("./tsc/resolver.js");

            dtsPath = tscResolve(
                id,
                importer,
                cwd,
                tsconfig,
                tsconfigRaw,
                // TODO reference
            );
        } else {
            const result = dtsResolver.resolveDtsSync(importer, id);

            dtsPath = result.path;
        }

        if (dtsPath) {
            dtsPath = path.normalize(dtsPath);
        }

        if (!dtsPath || !isSourceFile(dtsPath)) {
            if (rollupResolution && isFilePath(rollupResolution.id) && isSourceFile(rollupResolution.id) && !rollupResolution.external) {
                return rollupResolution.id;
            }

            return null;
        }

        return dtsPath;
    }
};

const isFilePath = (id: string) => id.startsWith(".") || path.isAbsolute(id);

export default createDtsResolvePlugin;
