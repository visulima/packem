// eslint-disable-next-line import/no-namespace
import type * as nodeSass from "node-sass";
// eslint-disable-next-line import/no-namespace
import type * as sass from "sass";
// eslint-disable-next-line import/no-namespace
import type * as sassEmbedded from "sass-embedded";

export const getDefaultSassImplementation = (): "node-sass" | "sass-embedded" | "sass" => {
    const implementations = ["sass-embedded", "sass", "node-sass"];

    for (const impl of implementations) {
        try {
            require.resolve(impl);

            return impl as "node-sass" | "sass-embedded" | "sass";
        } catch {
            // Continue to the next implementation
        }
    }

    throw new Error("No supported Sass implementation found. Please install 'sass-embedded', 'sass', or 'node-sass'.");
};

export const getSassImplementation = (
    implementation: string | typeof nodeSass | typeof sass | typeof sassEmbedded,
): typeof nodeSass | typeof sass | typeof sassEmbedded => {
    let resolvedImplementation = implementation;

    if (typeof resolvedImplementation === "string") {
        // eslint-disable-next-line import/no-dynamic-require,global-require,@typescript-eslint/no-require-imports
        resolvedImplementation = require(resolvedImplementation);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { info = undefined } = resolvedImplementation as Record<string, any>;

    if (!info) {
        throw new Error(`Sass implementation is missing 'info' property. Implementation: ${JSON.stringify(resolvedImplementation)}`);
    }

    const infoParts = info.split("\t");

    if (infoParts.length < 2) {
        throw new Error(`Invalid Sass implementation info format. Expected at least 2 parts, got: "${info as string}".`);
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

    throw new Error(`Unsupported Sass implementation: "${implementationName as string}". Supported implementations are: dart-sass, node-sass, sass-embedded.`);
};
