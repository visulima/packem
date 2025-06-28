import { yellow } from "@visulima/colorize";

import type { BuildContext } from "@visulima/packem-share/types";
import type { InternalBuildOptions, ValidationOptions } from "../../types";
import { warn } from "@visulima/packem-share/utils"

const joinWarnings = (warnings: Set<string> | string[]): string => [...warnings].map((id) => yellow(id)).join(", ");

const validateDependencies = (context: BuildContext<InternalBuildOptions>): void => {
    if (context.hoistedDependencies.size > 0) {
        const message = `These dependencies are shamefully hoisted: ${joinWarnings(context.hoistedDependencies)}`;

        warn(context, message);
    }

    let unusedDependencies = Object.keys(context.pkg.dependencies || {}).filter(
        (index) => !context.usedDependencies.has(index),
    );

    if (context.options?.validation && context.options?.validation?.dependencies !== false
        && context.options?.validation?.dependencies?.unused !== false) {
        unusedDependencies = unusedDependencies.filter((dependency) => !((context.options?.validation as ValidationOptions)?.dependencies as { unused: { exclude: string[] } })?.unused?.exclude.includes(dependency));
    }

    if (unusedDependencies.length > 0) {
        const message = `These dependencies are listed in package.json but not used: ${joinWarnings(unusedDependencies)}`;

        warn(context, message);
    }
};

export default validateDependencies;
