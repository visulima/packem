import type { FileCache } from "@visulima/packem-share";
import type { BuildContext, BuildContextBuildAssetAndChunk, BuildContextBuildEntry } from "@visulima/packem-share/types";
import type { RollupBuild } from "rollup";

import { getRollupOptions } from "../rollup/get-rollup-options";
import type { InternalBuildOptions } from "../types";
import { collectBuildEntries } from "../utils/collect-build-entries";
import { getRolldownBuild } from "./get-rolldown";

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
    // Rolldown 1.0 removed native CSS bundling (rolldown#4271) and rejects any
    // module whose extension defaults to `moduleTypes: "css"`. Our `rollup-plugin-css`
    // already transforms CSS source into JS via the `transform()` hook, so override
    // the defaults to treat CSS-family extensions as JS — rolldown's CSS detection
    // gets bypassed and the plugin pipeline runs as it does under rollup.
    const rolldownOptions = {
        ...rollupLikeOptions,
        moduleTypes: {
            ".css": "js",
            ".less": "js",
            ".pcss": "js",
            ".sass": "js",
            ".scss": "js",
            ".styl": "js",
            ".stylus": "js",
            ...((rollupLikeOptions as { moduleTypes?: Record<string, string> }).moduleTypes ?? {}),
        },
    } as unknown as Record<string, unknown>;
    const bundle = await rolldown(rolldownOptions);

    await context.hooks.callHook("rollup:build", context, bundle as unknown as RollupBuild);

    const assets = new Map<string, BuildContextBuildAssetAndChunk | BuildContextBuildEntry>();

    try {
        for (const outputOptions of rollupLikeOptions.output as unknown as Record<string, unknown>[]) {
            // eslint-disable-next-line no-await-in-loop
            const { output } = await bundle.write(outputOptions);
            collectBuildEntries(output, context, assets);
        }
    } finally {
        await bundle.close?.();
    }

    context.buildEntries.push(...assets.values());
};

export default build;
