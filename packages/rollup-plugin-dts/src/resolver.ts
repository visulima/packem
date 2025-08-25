import path from "node:path";

import { createResolver } from "dts-resolver";
import type { Plugin } from "rollup";
import { ResolverFactory } from "rollup/experimental";

import {
    filename_ts_to_dts,
    RE_CSS,
    RE_DTS,
    RE_NODE_MODULES,
    RE_TS,
    RE_VUE,
} from "./filename.js";
import type { OptionsResolved } from "./options.js";

export function createDtsResolvePlugin({
    resolve,
    tsconfig,
}: Pick<OptionsResolved, "tsconfig" | "resolve">): Plugin {
    const resolver = createResolver({
        resolveNodeModules: !!resolve,
        ResolverFactory,
        tsconfig,
    });

    return {
        name: "rollup-plugin-dts:resolver",

        resolveId: {
            async handler(id, importer, options) {
                const external = { external: true, id, moduleSideEffects: false };

                // only resolve in dts file
                if (!importer || !RE_DTS.test(importer)) {
                    return;
                }

                if (RE_CSS.test(id)) {
                    return {
                        external: true,
                        id,
                        moduleSideEffects: false,
                    };
                }

                let resolution = resolver(id, importer);

                resolution &&= path.normalize(resolution);

                if (
                    !resolution
                    || (!RE_TS.test(resolution) && !RE_VUE.test(resolution))
                ) {
                    const result = await this.resolve(id, importer, options);

                    if (!result || !RE_TS.test(result.id)) {
                        return external;
                    }

                    resolution = result.id;
                }

                if (
                    !RE_NODE_MODULES.test(importer)
                    && RE_NODE_MODULES.test(resolution)
                ) {
                    let shouldResolve: boolean;

                    if (typeof resolve === "boolean") {
                        shouldResolve = resolve;
                    } else {
                        shouldResolve = resolve.some((pattern) =>
                            (typeof pattern === "string" ? id === pattern : pattern.test(id)),
                        );
                    }

                    if (!shouldResolve) { return external; }
                }

                if (
                    (RE_TS.test(resolution) && !RE_DTS.test(resolution))
                    || RE_VUE.test(resolution)
                ) {
                    await this.load({ id: resolution });

                    // redirect ts to dts
                    resolution = filename_ts_to_dts(resolution);
                }

                if (RE_DTS.test(resolution)) {
                    return resolution;
                }
            },
            order: "pre",
        },
    };
}
