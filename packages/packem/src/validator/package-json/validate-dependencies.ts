import Module from "node:module";

import { cyan } from "@visulima/colorize";

import type { BuildContext, ValidationOptions } from "../../types";
import arrayIncludes from "../../utils/array-includes";
import getPackageName from "../../utils/get-package-name";
import warn from "../../utils/warn";

const validateDependencies = (context: BuildContext): void => {
    if ((context.options.validation as ValidationOptions).packageJson?.dependencies === false) {
        return;
    }

    const usedDependencies = new Set<string>();

    const unusedDependencies = new Set<string>(Object.keys(context.pkg?.dependencies ?? {}));
    const implicitDependencies = new Set<string>();

    for (const id of context.usedImports) {
        unusedDependencies.delete(id);
        usedDependencies.add(id);
    }

    if (context.pkg?.dependencies) {
        for (const id of Object.keys(context.pkg?.dependencies)) {
            unusedDependencies.delete(id);
        }
    }

    for (const id of usedDependencies) {
        const packageId = getPackageName(id);

        if (
            !arrayIncludes(context.options.externals, id)
            && !id.startsWith("chunks/")
            && ![...Module.builtinModules, ...Module.builtinModules.map((m) => `node:${m}`)].includes(packageId)

            && context.pkg?.dependencies?.[packageId] === undefined

            && context.pkg?.peerDependencies?.[packageId] === undefined

            && context.pkg.peerDependenciesMeta?.[packageId]?.optional !== true
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
