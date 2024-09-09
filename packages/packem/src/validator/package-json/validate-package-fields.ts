import type { BuildContext } from "../../types";
import warn from "../../utils/warn";

// eslint-disable-next-line sonarjs/cognitive-complexity
const validatePackageFields = (context: BuildContext): void => {
    const {
        options: { validation },
        pkg,
    } = context;

    if (pkg.name === undefined && validation?.packageJson?.name !== false) {
        warn(context, "'name' field is missing in your package.json");
    }

    if (validation?.packageJson?.files !== false) {
        if (pkg.files === undefined) {
            warn(context, "'files' field is missing in your package.json");
        } else if (pkg.files.length === 0) {
            warn(context, "'files' field is empty in your package.json");
        } else if (!pkg.files.some((file) => file.includes(context.options.outDir))) {
            warn(context, `'files' field in your package.json is missing the '${context.options.outDir}' directory`);
        }
    }

    const isCjs = pkg.type === "commonjs" || pkg.type === undefined;
    const isEsm = pkg.type === "module";

    if (isCjs) {
        if (validation?.packageJson?.main !== false) {
            if (pkg.main === undefined) {
                warn(context, "'main' field is missing in your package.json");
            }

            if (pkg.main?.includes(".mjs")) {
                warn(context, "'main' field in your package.json should not have a '.mjs' extension");
            }
        }

        if (validation?.packageJson?.module !== false) {
            if (pkg.module === undefined && context.options.emitESM) {
                warn(context, "'module' field is missing in your package.json");
            }

            if (context.options.emitESM && pkg.module?.includes(".cjs")) {
                warn(context, "'module' field in your package.json should not have a '.cjs' extension");
            }
        }
    } else if (isEsm) {
        if (pkg.exports === undefined && !context.options.emitCJS) {
            if (validation?.packageJson?.exports !== false) {
                warn(context, "'exports' field is missing in your package.json");
            }
        } else if (context.options.emitCJS) {
            if (validation?.packageJson?.main !== false && pkg.main === undefined) {
                warn(context, "'main' field is missing in your package.json");
            }

            if (validation?.packageJson?.module !== false) {
                if (pkg.module === undefined) {
                    warn(context, "'module' field is missing in your package.json");
                }

                if (pkg.module?.includes(".cjs")) {
                    warn(context, "'module' field should not have a '.cjs' extension");
                }
            }

            if (validation?.packageJson?.exports !== false && pkg.exports === undefined) {
                warn(context, "'exports' field is missing in your package.json");
            }
        }
    }

    if (typeof pkg.exports === "object") {
        // TODO: add validation for exports
    }

    if (validation?.packageJson?.bin !== false) {
        if (typeof pkg.bin === "string" && pkg.bin.includes(isCjs ? ".mjs" : ".cjs")) {
            warn(context, `'bin' field in your package.json should not have a ${isCjs ? ".mjs" : ".cjs"} extension`);
        } else if (typeof pkg.bin === "object") {
            // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
            for (const [bin, binPath] of Object.entries(pkg.bin)) {
                if (binPath && (binPath as string).includes(isCjs ? ".mjs" : ".cjs")) {
                    warn(context, `'bin.${bin}' field in your package.json should not have a ${isCjs ? ".mjs" : ".cjs"} extension`);
                }
            }
        }
    }

    if (context.options.declaration) {
        if (pkg.types === undefined && pkg.typings === undefined && validation?.packageJson?.types !== false) {
            warn(context, "'types' field is missing in your package.json");
        }

        if (
            (context.options.declaration === true || context.options.declaration === "compatible") &&
            validation?.packageJson?.typesVersions !== false && (pkg.typesVersions === undefined || Object.keys(pkg.typesVersions).length === 0)
        ) {
            warn(context, "No 'typesVersions' field found in your package.json, or change the declaration option to 'node16' or 'false'.");
        }
    }
};

export default validatePackageFields;
