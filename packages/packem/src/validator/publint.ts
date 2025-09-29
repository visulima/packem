import process from "node:process";

import { dim } from "@visulima/colorize";
import type { NormalizedPackageJson } from "@visulima/package";
import { ensurePackages } from "@visulima/package";
import type { BuildContext } from "@visulima/packem-share/types";

import loadPackageJson from "../config/utils/load-package-json";
import type { InternalBuildOptions, ValidationOptions } from "../types";

const publint = async (context: BuildContext<InternalBuildOptions>, logged: boolean): Promise<void> => {
    if (!context.options?.validation) {
        return;
    }

    const validation = context.options.validation as ValidationOptions;

    if (!validation.publint) {
        return;
    }

    const { packageJson } = loadPackageJson(context.options.rootDir);

    context.pkg = packageJson;

    if (logged) {
        context.logger.raw("\n");
    }

    if (!context.pkg) {
        context.logger.warn({
            message: "publint is enabled but package.json is not found",
            prefix: "publint",
        });

        return;
    }

    await ensurePackages(context.pkg as NormalizedPackageJson, ["publint"], "devDependencies");

    const t = performance.now();

    context.logger.debug({
        message: "Running publint",
        prefix: "publint",
    });

    const { publint: publintModule } = await import("publint");
    const { formatMessage } = await import("publint/utils");
    const { messages } = await publintModule(validation.publint === true ? {} : validation.publint);

    context.logger.debug({
        message: `Found ${messages.length} issues`,
        prefix: "publint",
    });

    if (messages.length === 0) {
        context.logger.success({
            message: `No publint issues found ${dim`(${Math.round(performance.now() - t).toString()}ms)`}`,
            prefix: "publint",
        });
    }

    let hasError = false;

    for (const message of messages) {
        hasError ||= message.type === "error";

        const formattedMessage = formatMessage(message, context.pkg);
        const logType = ({ error: "error", suggestion: "info", warning: "warn" } as const)[message.type];

        context.logger[logType]({
            message: formattedMessage,
            prefix: "publint",
        });
    }

    if (hasError) {
        context.logger.debug({
            message: "Found errors, setting exit code to 1",
            prefix: "publint",
        });

        process.exitCode = 1;
    }
};

export default publint;
