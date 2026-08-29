import { emptyDir } from "@visulima/fs";
import type { BuildContext } from "@visulima/packem-share/types";
import { relative } from "@visulima/path";

import type { InternalBuildOptions } from "../types";

/**
 * Minimal, precisely-typed view of the `@visulima/pail` logger surface used here.
 *
 * `context.logger` is typed `Pail`, which the published `@visulima/pail` types
 * re-export from a non-existent `./pail.d.ts`, so it resolves to an
 * unresolved/`any`-like type. Modelling only the methods we call keeps the call
 * sites strictly typed without an `any` escape.
 * @internal
 */
interface Logger {
    info: (message: string, ...arguments_: unknown[]) => void;
}

const cleanDistributionDirectories = async (context: BuildContext<InternalBuildOptions>): Promise<void> => {
    if (!context.options.clean) {
        return;
    }

    const logger = context.logger as unknown as Logger;
    const cleanedDirectories: string[] = [];

    for (const directory of new Set(
        context.options.entries
            .map((entry) => entry.outDir)
            .filter(Boolean)
            .toSorted((a, b) => a.localeCompare(b)),
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

        logger.info(`Cleaning dist directory: \`./${relative(context.options.rootDir, directory)}\``);

        // eslint-disable-next-line no-await-in-loop
        await emptyDir(directory);
    }
};

export default cleanDistributionDirectories;
