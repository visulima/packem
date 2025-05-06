import { cyan } from "@visulima/colorize";
import { join } from "@visulima/path";

import type { BuildContext } from "../../types";
import createOrUpdateKeyStorage from "../../utils/create-or-update-key-storage";
import generateReferenceDocumentation from "./generate-reference-documentation";

const builder = async (context: BuildContext, cachePath: string | undefined, _: never, logged: boolean): Promise<void> => {
    if (context.options.typedoc && context.options.typedoc.format !== undefined) {
        let typedocVersion = "unknown";

        if (context.pkg.dependencies?.typedoc) {
            typedocVersion = context.pkg.dependencies.typedoc;
        } else if (context.pkg.devDependencies?.typedoc) {
            typedocVersion = context.pkg.devDependencies.typedoc;
        }

        if (cachePath) {
            createOrUpdateKeyStorage("typedoc", cachePath as string, context.logger, true);
        }

        if (logged) {
            context.logger.raw("\n");
        }

        context.logger.info({
            message: "Using " + cyan("typedoc") + " " + typedocVersion + " to generate reference documentation",
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

        await generateReferenceDocumentation(context.options.typedoc, context.options.entries, outputDirectory, context.logger);

        await context.hooks.callHook("typedoc:done", context);
    }
};

// eslint-disable-next-line import/no-unused-modules
export default builder;
