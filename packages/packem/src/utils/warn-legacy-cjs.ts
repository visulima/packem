import { versions } from "node:process";

import type { BuildContext } from "@visulima/packem-share/types";
import { arrayify } from "@visulima/packem-share/utils";
import { coerce, minVersion, satisfies } from "semver";

import type { InternalBuildOptions } from "../types";

/**
 * Minimal, precisely-typed view of the `@visulima/pail` logger surface used here.
 *
 * `context.logger` is typed `Pail`, which the published `@visulima/pail` types
 * re-export from a non-existent `./pail.d.ts`, so it resolves to an
 * unresolved/`any`-like type. Modelling only the methods we call keeps the call
 * sites strictly typed without an `any` escape.
 * @internal
 */
interface Logger {
    warn: (message: string, ...arguments_: unknown[]) => void;
}

/**
 * Appends the coerced Node version for any `node*` target string to the accumulator.
 */
const collectNodeTargets = (targets: unknown, candidateVersions: string[]): void => {
    for (const target of arrayify(targets ?? [])) {
        if (!(typeof target === "string" && target.startsWith("node"))) {
            continue;
        }

        const coerced = coerce(target.slice("node".length));

        if (coerced) {
            candidateVersions.push(coerced.version);
        }
    }
};

/**
 * Warns when building CommonJS for Node targets that have deprecated CJS.
 * Triggers for Node >= 23.0.0 or >= 22.12.0.
 */
const warnLegacyCJS = (context: BuildContext<InternalBuildOptions>): void => {
    // Only relevant for Node runtime and when emitting CJS
    if (context.options.runtime !== "node" || !context.options.emitCJS) {
        return;
    }

    // Collect potential Node target versions from multiple sources
    const candidateVersions: string[] = [];

    // 1) package.json engines.node (preferred if available)
    const enginesNode = context.pkg.engines?.node;
    const minEnginesNode = enginesNode ? minVersion(enginesNode) : undefined;

    if (minEnginesNode) {
        candidateVersions.push(minEnginesNode.version);
    }

    const rollup = context.options.rollup as unknown as {
        esbuild?: { target?: string | string[] };
        oxc?: { target?: string | string[] };
    };

    // 2) transformer explicit targets if already provided
    collectNodeTargets(rollup.esbuild?.target, candidateVersions);
    collectNodeTargets(rollup.oxc?.target, candidateVersions);

    // 3) Fallback to current runtime major version if nothing else
    if (candidateVersions.length === 0) {
        const coerced = coerce(versions.node);

        if (coerced) {
            candidateVersions.push(coerced.version);
        }
    }

    const isLegacy = candidateVersions.some((v) => satisfies(v, ">=23.0.0 || >=22.12.0"));

    if (isLegacy) {
        (context.logger as unknown as Logger).warn(
            [
                "We recommend using the ESM format instead of CommonJS.",
                "The ESM format is compatible with modern platforms and runtimes, and most new libraries are now distributed only in ESM format.",
                "Learn more at https://nodejs.org/en/learn/modules/publishing-a-package#how-did-we-get-here",
            ].join("\n"),
        );
    }
};

export default warnLegacyCJS;
