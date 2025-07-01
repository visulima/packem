import { emptyDir } from "@visulima/fs";
import type { BuildContext } from "@visulima/packem-share/types";
import { relative } from "@visulima/path";

import type { InternalBuildOptions } from "../types";

const cleanDistributionDirectories = async (context: BuildContext<InternalBuildOptions>): Promise<void> => {
    const cleanedDirectories: string[] = [];

    if (context.options.clean) {
        for (const directory of new Set(

            context.options.entries
                .map((entry) => entry.outDir)
                .filter(Boolean)
                .sort() as unknown as Set<string>,
        )) {
            if (
                directory === context.options.rootDir
                || directory === context.options.sourceDir
                || context.options.rootDir.startsWith(directory.endsWith("/") ? directory : `${directory}/`)
                || cleanedDirectories.some((c) => directory.startsWith(c))
            ) {
                continue;
            }

            cleanedDirectories.push(directory);
            context.logger.info(`Cleaning dist directory: \`./${relative(context.options.rootDir, directory)}\``);

            // eslint-disable-next-line no-await-in-loop
            await emptyDir(directory);
        }
    }
};

export default cleanDistributionDirectories;
