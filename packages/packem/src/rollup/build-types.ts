import type { FileCache } from "@visulima/packem-share";
import type { BuildContext } from "@visulima/packem-share/types";
import {
    getChunkFilename,
    getDtsExtension,
} from "@visulima/packem-share/utils";
import { resolve } from "@visulima/path";
import type { RollupCache } from "rollup";
import { rollup } from "rollup";

import type { InternalBuildOptions } from "../types";
import { getRollupDtsOptions } from "./get-rollup-options";

const DTS_CACHE_KEY = "rollup-dts.json";

const buildTypes = async (
    context: BuildContext<InternalBuildOptions>,
    fileCache: FileCache,
    subDirectory: string,
): Promise<void> => {
    if (
        context.options.declaration
        && context.options.rollup.isolatedDeclarations
        && context.options.isolatedDeclarationTransformer
    ) {
        context.logger.info({
            message:
                "Using isolated declaration transformer to generate declaration files...",
            prefix: "dts",
        });

        return;
    }

    const rollupTypeOptions = await getRollupDtsOptions(context, fileCache);

    await context.hooks.callHook(
        "rollup:dts:options",
        context,
        rollupTypeOptions,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Object.keys(rollupTypeOptions.input as any).length === 0) {
        return;
    }

    rollupTypeOptions.cache = fileCache.get<RollupCache>(
        DTS_CACHE_KEY,
        subDirectory,
    );

    const typesBuild = await rollup(rollupTypeOptions);

    fileCache.set(DTS_CACHE_KEY, typesBuild.cache, subDirectory);

    await context.hooks.callHook("rollup:dts:build", context, typesBuild);

    context.logger.info({
        message: "Building declaration files...",
        prefix: "dts",
    });

    if (context.options.emitCJS) {
        const cjsDTSExtension = getDtsExtension(context, "cjs");

        await typesBuild.write({
            chunkFileNames: (chunk) => getChunkFilename(chunk, cjsDTSExtension),
            dir: resolve(context.options.rootDir, context.options.outDir),
            entryFileNames: `[name].${cjsDTSExtension}`,
        });
    }

    if (context.options.emitESM) {
        const esmDTSExtension = getDtsExtension(context, "esm");

        await typesBuild.write({
            chunkFileNames: (chunk) => getChunkFilename(chunk, esmDTSExtension),
            dir: resolve(context.options.rootDir, context.options.outDir),
            entryFileNames: `[name].${esmDTSExtension}`,
        });
    }

    // .d.ts for node10 compatibility (TypeScript version < 4.7)
    if (
        context.options.declaration === true
        || context.options.declaration === "compatible"
    ) {
        await typesBuild.write({
            chunkFileNames: (chunk) => getChunkFilename(chunk, "d.ts"),
            dir: resolve(context.options.rootDir, context.options.outDir),
            entryFileNames: "[name].d.ts",
        });
    }

    await context.hooks.callHook("rollup:dts:done", context);
};

export default buildTypes;
