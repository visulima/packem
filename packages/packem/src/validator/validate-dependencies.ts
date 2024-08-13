import { cyan } from "@visulima/colorize";

import type { BuildContext } from "../types";
import arrayIncludes from "../utils/array-includes";
import getPackageName from "../utils/get-package-name";
import warn from "../utils/warn";

const validateDependencies = (context: BuildContext): void => {
    const usedDependencies = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const unusedDependencies = new Set<string>(Object.keys(context.pkg?.dependencies ?? {}));
    const implicitDependencies = new Set<string>();

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const id of context.usedImports) {
        unusedDependencies.delete(id);
        usedDependencies.add(id);
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (context.pkg?.dependencies) {
        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax,@typescript-eslint/no-unnecessary-condition
        for (const id of Object.keys(context.pkg?.dependencies)) {
            unusedDependencies.delete(id);
        }
    }

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const id of usedDependencies) {
        const packageId = getPackageName(id);

        if (
            !arrayIncludes(context.options.externals, id) &&
            !id.startsWith("chunks/") &&
            // eslint-disable-next-line security/detect-object-injection,@typescript-eslint/no-unnecessary-condition
            context.pkg?.dependencies?.[packageId] === undefined &&
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition,security/detect-object-injection
            context.pkg?.peerDependencies?.[packageId] === undefined
        ) {
            implicitDependencies.add(id);
        }
    }

    if (unusedDependencies.size > 0) {
        warn(context, `Potential unused dependencies found: ${[...unusedDependencies].map((id) => cyan(id)).join(", ")}`);
    }

    if (implicitDependencies.size > 0) {
        warn(context, `Potential implicit dependencies found: ${[...implicitDependencies].map((id) => cyan(id)).join(", ")}`);
    }
};

export default validateDependencies;
