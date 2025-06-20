import type { BuildContext, ValidationOptions } from "../../types";
import warn from "../../utils/warn";

// eslint-disable-next-line sonarjs/cognitive-complexity
const validatePackageFields = (context: BuildContext): void => {
    const validation = context.options.validation as ValidationOptions;
    const { pkg } = context;
    const cjsJSExtension = context.options.outputExtensionMap?.cjs ?? "cjs";
    const esmJSExtension = context.options.outputExtensionMap?.esm ?? "mjs";

    if (pkg.name === undefined && validation.packageJson?.name !== false) {
        warn(context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
    }

    // Omitting the field will make it default to ["*"], which means it will include all files.
    // @see {@link https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files}
    if (validation.packageJson?.files !== false && Array.isArray(pkg.files) && !pkg.files.includes("*")) {
        if (pkg.files.length === 0) {
            warn(context, "The 'files' field in your package.json is empty. Please specify the files to be included in the package.");
        } else if (!pkg.files.some((file) => file.includes(context.options.outDir))) {
            warn(
                context,
                `The 'files' field in your package.json is missing the '${context.options.outDir}' directory. Ensure the output directory is included.`,
            );
        }
    }

    const isCjs = pkg.type === "commonjs" || pkg.type === undefined;
    const isEsm = pkg.type === "module";

    if (isCjs) {
        if (validation.packageJson?.main !== false) {
            if (pkg.main === undefined) {
                warn(context, "The 'main' field is missing in your package.json. This field should point to your main entry file.");
            }

            if (pkg.main?.endsWith(`.${esmJSExtension}`)) {
                warn(context, `The 'main' field in your package.json should not use a '.${esmJSExtension}' extension for CommonJS modules.`);
            }
        }

        if (validation.packageJson?.module !== false) {
            if (pkg.module === undefined && context.options.emitESM) {
                warn(context, "The 'module' field is missing in your package.json, but you are emitting ES modules.");
            }

            if (pkg.module && pkg.main && pkg.module === pkg.main) {
                warn(
                    context,
                    `Conflict detected: The 'module' and 'main' fields both point to '${pkg.module as string}'. Please ensure they refer to different module types.`,
                );
            }

            if (context.options.emitESM && pkg.module?.endsWith(`.${cjsJSExtension}`)) {
                warn(context, `The 'module' field in your package.json should not use a '.${cjsJSExtension}' extension for ES modules.`);
            }
        }
    } else if (isEsm) {
        if (pkg.exports === undefined && !context.options.emitCJS) {
            if (validation.packageJson?.exports !== false) {
                warn(context, "The 'exports' field is missing in your package.json. Define module exports explicitly.");
            }
        } else if (context.options.emitCJS) {
            if (validation.packageJson?.main !== false && pkg.main === undefined) {
                warn(context, "The 'main' field is missing in your package.json. This field is needed when emitting CommonJS modules.");
            }

            if (validation.packageJson?.module !== false) {
                if (pkg.module === undefined) {
                    warn(context, "The 'module' field is missing in your package.json. This field is necessary when emitting ES modules.");
                }

                if (pkg.module?.endsWith(`.${cjsJSExtension}`)) {
                    warn(context, `The 'module' field should not use a '.${cjsJSExtension}' extension for ES modules.`);
                }

                if (pkg.module && pkg.main && pkg.module === pkg.main) {
                    warn(
                        context,
                        `Conflict detected: The 'module' and 'main' fields both point to '${pkg.module as string}'. Please ensure they refer to different module types.`,
                    );
                }
            }

            if (validation.packageJson?.exports !== false && pkg.exports === undefined) {
                warn(context, "The 'exports' field is missing in your package.json. This field is required for defining explicit exports.");
            }
        }
    }

    if (typeof pkg.exports === "object") {
        // @TODO: add validation for exports
    }

    if (validation.packageJson?.bin !== false) {
        const forbiddenExtension = isCjs ? esmJSExtension : cjsJSExtension;

        if (typeof pkg.bin === "string" && pkg.bin.endsWith(`.${forbiddenExtension}`)) {
            warn(
                context,
                `The 'bin' field in your package.json should not use a .${forbiddenExtension} extension for ${isCjs ? "CommonJS" : "ES modules"} binaries.`,
            );
        } else if (typeof pkg.bin === "object") {
            for (const [bin, binPath] of Object.entries(pkg.bin)) {
                if (binPath && (binPath as string).endsWith(`.${forbiddenExtension}`)) {
                    warn(
                        context,
                        `The 'bin.${bin}' field in your package.json should not use a .${forbiddenExtension} extension for ${isCjs ? "CommonJS" : "ES modules"} binaries.`,
                    );
                }
            }
        }
    }

    if (context.options.declaration) {
        let showWarning = true;

        if (pkg.type === "module") {
            showWarning = Boolean(pkg.main?.endsWith(`.${cjsJSExtension}`));
        }

        if (pkg.types === undefined && pkg.typings === undefined && showWarning && validation.packageJson?.types !== false) {
            warn(context, "The 'types' field is missing in your package.json. This field should point to your type definitions file.");
        }

        if (
            (context.options.declaration === true || context.options.declaration === "compatible")
            && showWarning
            && validation.packageJson?.typesVersions !== false
            && (pkg.typesVersions === undefined || Object.keys(pkg.typesVersions).length === 0)
        ) {
            warn(
                context,
                "No 'typesVersions' field found in your package.json. Consider adding this field, or change the declaration option to 'node16' or 'false'.",
            );
        }
    }
};

export default validatePackageFields;
