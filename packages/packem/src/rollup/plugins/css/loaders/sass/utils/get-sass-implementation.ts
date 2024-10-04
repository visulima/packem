// eslint-disable-next-line import/no-namespace
import type * as nodeSass from "node-sass";
// eslint-disable-next-line import/no-namespace
import type * as sass from "sass";
// eslint-disable-next-line import/no-namespace
import type * as sassEmbedded from "sass-embedded";

export const getDefaultSassImplementation = (): string => {
    const implementations = ["sass-embedded", "sass", "node-sass"];

    for (const impl of implementations) {
        try {
            // eslint-disable-next-line unicorn/prefer-module
            require.resolve(impl);
            return impl;
        } catch {
            // Continue to the next implementation
        }
    }

    return "sass"; // Default fallback
};

export const getSassImplementation = (
    implementation?: string | typeof sass | typeof sassEmbedded | typeof nodeSass,
): typeof sass | typeof sassEmbedded | typeof nodeSass => {
    let resolvedImplementation = implementation;

    if (!resolvedImplementation) {
        resolvedImplementation = getDefaultSassImplementation();
    }

    if (typeof resolvedImplementation === "string") {
        // eslint-disable-next-line import/no-dynamic-require,global-require,@typescript-eslint/no-require-imports,unicorn/prefer-module,security/detect-non-literal-require
        resolvedImplementation = require(resolvedImplementation);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { info = undefined } = resolvedImplementation as Record<string, any>;

    if (!info) {
        throw new Error("Unknown Sass implementation.");
    }

    const infoParts = info.split("\t");

    if (infoParts.length < 2) {
        throw new Error(`Unknown Sass implementation "${info as string}".`);
    }

    const [implementationName] = infoParts;

    if (implementationName === "dart-sass") {
        return resolvedImplementation as typeof sass;
    }

    if (implementationName === "node-sass") {
        return resolvedImplementation as typeof nodeSass;
    }

    if (implementationName === "sass-embedded") {
        return resolvedImplementation as typeof sassEmbedded;
    }

    throw new Error(`Unknown Sass implementation "${implementationName as string}".`);
};
