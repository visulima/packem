import { cyan } from "@visulima/colorize";

import type { BuildContext } from "../types";
import arrayIncludes from "../utils/array-includes";
import getPackageName from "../utils/get-package-name";
import warn from "../utils/warn";

const validateDependencies = (context: BuildContext): void => {
    const usedDependencies = new Set<string>();
    const unusedDependencies = new Set<string>(Object.keys(context.pkg.dependencies ?? {}));
    const implicitDependencies = new Set<string>();

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const id of context.usedImports) {
        unusedDependencies.delete(id);
        usedDependencies.add(id);
    }

    if (context.pkg.dependencies) {
        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const id of Object.keys(context.pkg.dependencies)) {
            unusedDependencies.delete(id);
        }
    }

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const id of usedDependencies) {
        const packageId = getPackageName(id);

        if (
            !arrayIncludes(context.options.externals, id) &&
            !id.startsWith("chunks/") &&
            // eslint-disable-next-line security/detect-object-injection
            !context.pkg.dependencies?.[packageId] &&
            // eslint-disable-next-line security/detect-object-injection
            !context.pkg.peerDependencies?.[packageId] && // Check if it's optional
            // eslint-disable-next-line security/detect-object-injection
            !context.pkg.peerDependenciesMeta?.[packageId]?.optional
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
