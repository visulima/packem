import type { FileCache } from "@visulima/packem-share";
import type { BuildContext, BuildContextBuildAssetAndChunk, BuildContextBuildEntry } from "@visulima/packem-share/types";
import type { RollupBuild } from "rollup";

import { getRollupOptions } from "../rollup/get-rollup-options";
import type { InternalBuildOptions } from "../types";
import type { BuildOutputItem } from "../utils/collect-build-entries";
import { collectBuildEntries } from "../utils/collect-build-entries";
import { getRolldownBuild } from "./get-rolldown";

type RolldownBundle = {
    write: (options: unknown) => Promise<{ output: BuildOutputItem[] }>;
};

const build = async (
    context: BuildContext<InternalBuildOptions>,
    fileCache: FileCache,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _subDirectory: string,
): Promise<void> => {
    const rollupLikeOptions = await getRollupOptions(context, fileCache);

    await context.hooks.callHook("rollup:options", context, rollupLikeOptions);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Object.keys(rollupLikeOptions.input as any).length === 0) {
        return;
    }

    const rolldown = await getRolldownBuild();
    const bundle = await rolldown(rollupLikeOptions as unknown as Record<string, unknown>) as unknown as RolldownBundle;

    await context.hooks.callHook("rollup:build", context, bundle as unknown as RollupBuild);

    const assets = new Map<string, BuildContextBuildAssetAndChunk | BuildContextBuildEntry>();

    for (const outputOptions of rollupLikeOptions.output as unknown as Record<string, unknown>[]) {
        // eslint-disable-next-line no-await-in-loop
        const { output } = await bundle.write(outputOptions);
        collectBuildEntries(output, context, assets);
    }

    context.buildEntries.push(...assets.values());
};

export default build;
