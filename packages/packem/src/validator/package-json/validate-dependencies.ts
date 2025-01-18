import Module from "node:module";

import { cyan } from "@visulima/colorize";

import type { BuildContext, PackageJsonValidationOptions } from "../../types";
import arrayIncludes from "../../utils/array-includes";
import getPackageName from "../../utils/get-package-name";
import warn from "../../utils/warn";

const validateDependencies = (context: BuildContext): void => {
    if ((context.options.validation as PackageJsonValidationOptions)?.packageJson?.dependencies === false) {
        return;
    }

    const usedDependencies = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const unusedDependencies = new Set<string>(Object.keys(context.pkg?.dependencies ?? {}));
    const implicitDependencies = new Set<string>();

    for (const id of context.usedImports) {
        unusedDependencies.delete(id);
        usedDependencies.add(id);
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (context.pkg?.dependencies) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        for (const id of Object.keys(context.pkg?.dependencies)) {
            unusedDependencies.delete(id);
        }
    }

    for (const id of usedDependencies) {
        const packageId = getPackageName(id);

        if (
            !arrayIncludes(context.options.externals, id) &&
            !id.startsWith("chunks/") &&
            ![...Module.builtinModules, ...Module.builtinModules.map((m) => `node:${m}`)].includes(packageId) &&
            // eslint-disable-next-line security/detect-object-injection,@typescript-eslint/no-unnecessary-condition
            context.pkg?.dependencies?.[packageId] === undefined &&
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition,security/detect-object-injection
            context.pkg?.peerDependencies?.[packageId] === undefined &&
            context.pkg.peerDependenciesMeta?.[packageId]?.optional !== true
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
