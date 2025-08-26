import { isAbsolute } from "@visulima/path";
import { createResolver } from "dts-resolver";
import type { Plugin, ResolvedId } from "rolldown";
import { ResolverFactory } from "rolldown/experimental";

import {
    filename_to_dts,
    RE_CSS,
    RE_DTS,
    RE_NODE_MODULES,
    RE_TS,
    RE_VUE,
} from "./filename.ts";
import type { OptionsResolved } from "./options.ts";

export function createDtsResolvePlugin({
    resolve,
    tsconfig,
}: Pick<OptionsResolved, "tsconfig" | "resolve">): Plugin {
    const isSourceFile = (p: string) => RE_TS.test(p) || RE_VUE.test(p);

    const shouldBundleNodeModule = (id: string) => {
        if (typeof resolve === "boolean") { return resolve; }

        return resolve.some((pattern) =>
            (typeof pattern === "string" ? id === pattern : pattern.test(id)),
        );
    };

    const baseDtsResolver = createResolver({
        resolveNodeModules: !!resolve,
        ResolverFactory,
        tsconfig,
    });

    const resolveDtsPath = (
        id: string,
        importer: string,
        rolldownResolution: ResolvedId | null,
    ): string | null => {
        let dtsPath = baseDtsResolver(id, importer);

        if (dtsPath) {
            dtsPath = normalize(dtsPath);
        }

        if (!dtsPath || !isSourceFile(dtsPath)) {
            if (rolldownResolution && isSourceFile(rolldownResolution.id)) {
                return rolldownResolution.id;
            }

            return null;
        }

        return dtsPath;
    };

    return {
        name: "rolldown-plugin-dts:resolver",

        resolveId: {
            async handler(id, importer, options) {
                const external = { external: true, id, moduleSideEffects: false };

                // Guard: Only operate on imports inside .d.ts files
                if (!importer || !RE_DTS.test(importer)) {
                    return;
                }

                // Guard: Externalize non-code imports
                if (RE_CSS.test(id)) {
                    return external;
                }

                // Get Rolldown's resolution first for fallback and policy checks
                const rolldownResolution = await this.resolve(id, importer, options);
                const dtsResolution = resolveDtsPath(id, importer, rolldownResolution);

                // If resolution failed, error or externalize
                if (!dtsResolution) {
                    const isFileImport = id.startsWith(".") || isAbsolute(id);

                    // Auto-export unresolvable packages
                    return isFileImport ? null : external;
                }

                // Externalize non-bundled node_modules dependencies
                if (
                // request resolved to inside node_modules
                    RE_NODE_MODULES.test(dtsResolution)
                    // User doesn't want to bundle this module
                    && !shouldBundleNodeModule(id)
                    // The importer is not in node_modules, or if it is, the module is marked as external by Rolldown
                    && (!RE_NODE_MODULES.test(importer) || rolldownResolution?.external)
                ) {
                    return external;
                }

                // The path is either a declaration file or a source file that needs redirection.
                if (RE_DTS.test(dtsResolution)) {
                    // It's already a .d.ts file, we're done
                    return dtsResolution;
                }

                if (isSourceFile(dtsResolution)) {
                    // It's a .ts/.vue source file, so we load it to ensure its .d.ts is generated,
                    // then redirect the import to the future .d.ts path
                    await this.load({ id: dtsResolution });

                    return filename_to_dts(dtsResolution);
                }
            },
            order: "pre",
        },
    };
}
