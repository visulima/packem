export const getDefaultSassImplementation = (): string => {
    let sassImplPackage = "sass";

    try {
        require.resolve("sass-embedded");

        sassImplPackage = "sass-embedded";
    } catch {
        try {
            require.resolve("sass");
        } catch {
            try {
                require.resolve("node-sass");

                sassImplPackage = "node-sass";
            } catch {
                sassImplPackage = "sass";
            }
        }
    }

    return sassImplPackage;
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-explicit-any
export const getSassImplementation = (implementation: Record<string, any> | string | undefined) => {
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
        return resolvedImplementation;
    }

    if (implementationName === "node-sass") {
        return resolvedImplementation;
    }

    if (implementationName === "sass-embedded") {
        return resolvedImplementation;
    }

    throw new Error(`Unknown Sass implementation "${implementationName as string}".`);
};
