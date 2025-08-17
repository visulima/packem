import { versions } from "node:process";

import type { BuildContext } from "@visulima/packem-share/types";
import { arrayify } from "@visulima/packem-share/utils";
import { coerce, minVersion, satisfies } from "semver";

import type { InternalBuildOptions } from "../types";

/**
 * Warns when building CommonJS for Node targets that have deprecated CJS.
 * Triggers for Node >= 23.0.0 or >= 22.12.0.
 */
const warnLegacyCJS = (context: BuildContext<InternalBuildOptions>): void => {
    // Only relevant for Node runtime and when emitting CJS
    if (context.options.runtime !== "node" || context.options.emitCJS !== true) {
        return;
    }

    // Collect potential Node target versions from multiple sources
    const candidateVersions: string[] = [];

    // 1) package.json engines.node (preferred if available)
    const enginesNode = context.pkg.engines?.node;
    const minEnginesNode = enginesNode ? minVersion(enginesNode) : null;

    if (minEnginesNode) {
        candidateVersions.push(minEnginesNode.version);
    }

    // 2) transformer explicit targets if already provided
    const esbuildTargets = arrayify(context.options.rollup.esbuild?.target ?? []) as string[];

    for (const t of esbuildTargets) {
        if (typeof t === "string" && t.startsWith("node")) {
            const coerced = coerce(t.slice("node".length));

            if (coerced) { candidateVersions.push(coerced.version); }
        }
    }

    const oxcTargets = arrayify((context.options.rollup as unknown as { oxc?: { target?: string | string[] } }).oxc?.target ?? []) as string[];

    for (const t of oxcTargets) {
        if (typeof t === "string" && t.startsWith("node")) {
            const coerced = coerce(t.slice("node".length));

            if (coerced) { candidateVersions.push(coerced.version); }
        }
    }

    // 3) Fallback to current runtime major version if nothing else
    if (candidateVersions.length === 0) {
        const coerced = coerce(versions.node);

        if (coerced) { candidateVersions.push(coerced.version); }
    }

    const isLegacy = candidateVersions.some((v) => satisfies(v, ">=23.0.0 || >=22.12.0"));

    if (isLegacy) {
        context.logger.warn(
            [
                "We recommend using the ESM format instead of CommonJS.",
                "The ESM format is compatible with modern platforms and runtimes, and most new libraries are now distributed only in ESM format.",
                "Learn more at https://nodejs.org/en/learn/modules/publishing-a-package#how-did-we-get-here",
            ].join("\n"),
        );
    }
};

export default warnLegacyCJS;
