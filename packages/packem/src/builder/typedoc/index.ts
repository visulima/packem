import { cyan } from "@visulima/colorize";
import type { BuildContext } from "@visulima/packem-share/types";
import { join } from "@visulima/path";

import type { InternalBuildOptions } from "../../types";
import createOrUpdateKeyStorage from "../../utils/create-or-update-key-storage";
import generateReferenceDocumentation from "./generate-reference-documentation";

/**
 * Minimal structural logger contract. `@visulima/pail`'s shipped `Pail` type
 * re-exports from a non-existent `./pail.d.ts`, so the structural alias below
 * keeps the methods we call fully type-checked without the broken import.
 */
interface LogPayload {
    message: string;
    prefix: string;
}

interface Logger {
    debug: (payload: LogPayload | string, ...arguments_: unknown[]) => void;
    error: (payload: LogPayload | string, ...arguments_: unknown[]) => void;
    info: (payload: LogPayload) => void;
    raw: (message: string) => void;
    warn: (payload: LogPayload | string, ...arguments_: unknown[]) => void;
}

const getLogger = (context: BuildContext<InternalBuildOptions>): Logger => context.logger as Logger;

const builder = async (context: BuildContext<InternalBuildOptions>, cachePath: string | undefined, _: never, logged: boolean): Promise<void> => {
    if (!context.options.typedoc || context.options.typedoc.format === undefined) {
        return;
    }

    const logger = getLogger(context);
    let typedocVersion = "unknown";

    if (context.pkg.dependencies?.typedoc) {
        typedocVersion = context.pkg.dependencies.typedoc;
    } else if (context.pkg.devDependencies?.typedoc) {
        typedocVersion = context.pkg.devDependencies.typedoc;
    }

    if (cachePath) {
        createOrUpdateKeyStorage("typedoc", cachePath, logger, true);
    }

    if (logged) {
        logger.raw("\n");
    }

    logger.info({
        message: `Using ${cyan("typedoc")} ${typedocVersion} to generate reference documentation`,
        prefix: "typedoc",
    });

    await context.hooks.callHook("typedoc:before", context);

    let outputDirectory = context.options.rootDir;

    if (context.options.typedoc.output) {
        outputDirectory = context.options.typedoc.output;
    } else if (context.options.typedoc.format === "inline" && cachePath) {
        outputDirectory = join(cachePath, "typedoc");
    } else if (context.options.typedoc.format !== "json") {
        outputDirectory = join(outputDirectory, "api-docs");
    }

    await generateReferenceDocumentation(context.options.typedoc, context.options.entries, outputDirectory, logger);

    await context.hooks.callHook("typedoc:done", context);
};

export default builder;
