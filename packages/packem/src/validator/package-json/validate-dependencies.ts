import { yellow } from "@visulima/colorize";
import type { BuildContext } from "@visulima/packem-share/types";
import { warn } from "@visulima/packem-share/utils";

import type { InternalBuildOptions } from "../../types";

const joinWarnings = (warnings: Set<string> | string[]): string => Array.from(warnings, (id) => yellow(id)).join(", ");

const validateDependencies = (context: BuildContext<InternalBuildOptions>): void => {
    if (context.hoistedDependencies.size > 0) {
        const message = `These dependencies are shamefully hoisted: ${joinWarnings(context.hoistedDependencies)}`;

        warn(context, message);
    }

    if (context.externalizedDevDependencies.size > 0) {
        const message =
            `These packages are imported by the build output but only declared in devDependencies: ${joinWarnings(context.externalizedDevDependencies)}`
            + `\n ↳ a consumer never installs them, so the import resolves only where the package manager happens to hoist it.`
            + `\n ↳ move them to "dependencies" (or "peerDependencies" when the consumer should choose the version).`;

        warn(context, message);
    }

    let unusedDependencies = Object.keys(context.pkg.dependencies ?? {}).filter((index) => !context.usedDependencies.has(index));

    const { validation } = context.options;
    const dependenciesValidation = validation === false || validation === undefined ? false : validation.dependencies;
    const unusedValidation = dependenciesValidation === false ? false : dependenciesValidation.unused;

    if (unusedValidation !== false) {
        unusedDependencies = unusedDependencies.filter((dependency) => !unusedValidation.exclude.includes(dependency));
    }

    if (unusedDependencies.length > 0) {
        const message = `These dependencies are listed in package.json but not used: ${joinWarnings(unusedDependencies)}`;

        warn(context, message);
    }
};

export default validateDependencies;
