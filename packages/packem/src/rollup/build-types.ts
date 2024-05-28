import { resolve } from "@visulima/path";
import { rollup } from "rollup";

import type { BuildContext } from "../types";
import { getRollupDtsOptions } from "./get-rollup-options";
import getChunkFilename from "./utils/get-chunk-filename";

const buildTypes = async (context: BuildContext): Promise<void> => {
    const rollupTypeOptions = await getRollupDtsOptions(context);

    await context.hooks.callHook("rollup:dts:options", context, rollupTypeOptions);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Object.keys(rollupTypeOptions.input as any).length === 0) {
        return;
    }

    const typesBuild = await rollup(rollupTypeOptions);

    await context.hooks.callHook("rollup:dts:build", context, typesBuild);

    context.logger.info({
        message: "Building declaration files...",
        prefix: "dts",
    });

    if (context.options.emitCJS) {
        await typesBuild.write({
            chunkFileNames: (chunk) => getChunkFilename(context, chunk, "d.cts"),
            dir: resolve(context.options.rootDir, context.options.outDir),
            entryFileNames: "[name].d.cts",
        });
    }

    if (context.options.emitESM) {
        await typesBuild.write({
            chunkFileNames: (chunk) => getChunkFilename(context, chunk, "d.mts"),
            dir: resolve(context.options.rootDir, context.options.outDir),
            entryFileNames: "[name].d.mts",
        });
    }

    // .d.ts for node10 compatibility (TypeScript version < 4.7)
    if (context.options.declaration === true || context.options.declaration === "compatible") {
        await typesBuild.write({
            chunkFileNames: (chunk) => getChunkFilename(context, chunk, "d.ts"),
            dir: resolve(context.options.rootDir, context.options.outDir),
            entryFileNames: "[name].d.ts",
        });
    }

    await context.hooks.callHook("rollup:dts:done", context);
};

export default buildTypes;
