import type { BuildContext } from "@visulima/packem-share/types";

import type { InternalBuildOptions } from "../types";

const logBuildErrors = (context: BuildContext<InternalBuildOptions>, hasOtherLogs: boolean): void => {
    if (context.warnings.size > 0) {
        if (hasOtherLogs) {
            context.logger.raw("\n");
        }

        context.logger.warn(`Build is done with some warnings:\n\n${[...context.warnings].map((message) => `- ${message}`).join("\n")}`);

        if (context.options.failOnWarn) {
            throw new Error("Exiting with code (1). You can change this behavior by setting `failOnWarn: false`.");
        }
    }
};

export default logBuildErrors;
