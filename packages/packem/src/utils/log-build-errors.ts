import type { BuildContext } from "@visulima/packem-share/types";

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
    raw: (message: string, ...arguments_: unknown[]) => void;
    warn: (message: string, ...arguments_: unknown[]) => void;
}

const logBuildErrors = (context: BuildContext<InternalBuildOptions>, hasOtherLogs: boolean): void => {
    if (context.warnings.size === 0) {
        return;
    }

    const logger = context.logger as unknown as Logger;

    if (hasOtherLogs) {
        logger.raw("\n");
    }

    logger.warn(`Build is done with some warnings:\n\n${Array.from(context.warnings, (message) => `- ${message}`).join("\n")}`);

    if (context.options.failOnWarn) {
        throw new Error("Exiting with code (1). You can change this behavior by setting `failOnWarn: false`.");
    }
};

export default logBuildErrors;
