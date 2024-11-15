import { emptyDir } from "@visulima/fs";
import { relative } from "@visulima/path";

import type { BuildContext } from "../types";

const cleanDistributionDirectories = async (context: BuildContext): Promise<void> => {
    const cleanedDirectories: string[] = [];

    if (context.options.clean) {
        for (const directory of new Set(
            // eslint-disable-next-line @typescript-eslint/require-array-sort-compare
            context.options.entries
                .map((entry) => entry.outDir)
                .filter(Boolean)
                .sort() as unknown as Set<string>,
        )) {
            if (
                directory === context.options.rootDir ||
                directory === context.options.sourceDir ||
                context.options.rootDir.startsWith(directory.endsWith("/") ? directory : `${directory}/`) ||
                cleanedDirectories.some((c) => directory.startsWith(c))
            ) {
                // eslint-disable-next-line no-continue
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
