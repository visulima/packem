import { VALID_EXPORT_EXTENSIONS } from "@visulima/packem-share/constants";
import type { BuildContext } from "@visulima/packem-share/types";
import { warn, getOutputExtension } from "@visulima/packem-share/utils";

import type { InternalBuildOptions, ValidationOptions } from "../../types";

/**
 * Validates the exports field according to Node.js specification.
 * @param context The build context containing validation options
 * @param exports The exports field value to validate
 * @see https://nodejs.org/api/packages.html#exports Official Node.js documentation for package exports
 * @see https://nodejs.org/api/packages.html#conditional-exports Guide to conditional exports in Node.js
 * @see https://nodejs.org/api/packages.html#subpath-exports Documentation for subpath exports patterns
 * @see https://nodejs.org/api/packages.html#exports-sugar Simplified syntax for exports field
 */
const validateExports = (context: BuildContext<InternalBuildOptions>, exports: unknown): void => {
    const validation = context.options.validation as ValidationOptions;

    if (validation.packageJson?.exports === false) {
        return;
    }

    // Node.js standard conditions ordered by priority
    // @see https://nodejs.org/api/packages.html#conditional-exports
    // @see https://nodejs.org/api/packages.html#community-conditions-definitions
    const STANDARD_CONDITIONS = new Set([
        "default", // @see https://nodejs.org/api/packages.html#default
        "import", // @see https://nodejs.org/api/packages.html#import
        "module-sync", // @see https://nodejs.org/api/packages.html#module-sync
        "node", // @see https://nodejs.org/api/packages.html#node
        "node-addons", // @see https://nodejs.org/api/packages.html#node-addons
        "require", // @see https://nodejs.org/api/packages.html#require
    ]);

    // Community conditions widely supported
    // @see https://nodejs.org/api/packages.html#community-conditions-definitions
    // @see https://webpack.js.org/guides/package-exports/
    // @see https://esbuild.github.io/api/#conditions
    const COMMUNITY_CONDITIONS = new Set([
        "browser", // @see https://github.com/defunctzombie/package-browser-field-spec
        "bun", // @see https://bun.sh/docs/bundler/vs-webpack#conditions
        "deno", // @see https://deno.land/manual/node/package_json#conditional-exports
        "development", // @see https://nodejs.org/api/packages.html#community-conditions-definitions
        "edge-light", // @see https://vercel.com/docs/functions/edge-functions/edge-runtime#compatible-node.js-apis
        "electron", // @see https://www.electronjs.org/docs/latest/tutorial/esm#conditional-exports
        "production", // @see https://nodejs.org/api/packages.html#community-conditions-definitions
        "react-native", // @see https://reactnative.dev/docs/metro#package-exports-support
        "react-server", // @see https://github.com/reactjs/rfcs/blob/main/text/0227-server-module-conventions.md
        "types", // @see https://www.typescriptlang.org/docs/handbook/esm-node.html#packagejson-exports-imports-and-self-referencing
        "workerd", // @see https://developers.cloudflare.com/workers/runtime-apis/nodejs/
    ]);

    // Add extra conditions from validation options
    const extraConditions = validation.packageJson?.extraConditions || [];
    const EXTRA_CONDITIONS = new Set(extraConditions);

    const ALL_CONDITIONS = new Set([...COMMUNITY_CONDITIONS, ...EXTRA_CONDITIONS, ...STANDARD_CONDITIONS]);

    // eslint-disable-next-line sonarjs/cognitive-complexity
    const validateExportsValue = (value: unknown, path: string): void => {
        if (value === null) {
            // null is allowed to block access to subpaths
            return;
        }

        if (typeof value === "string") {
            // Must be a relative path starting with "./"
            if (!value.startsWith("./")) {
                warn(context, `Invalid exports path "${value}" at ${path}. Export paths must start with "./"`);

                return;
            }

            // Should not contain ".." to prevent directory traversal
            if (value.includes("../")) {
                warn(context, `Invalid exports path "${value}" at ${path}. Export paths should not contain "../" for security reasons`);

                return;
            }

            // Check for valid file extensions
            const hasValidExtension = VALID_EXPORT_EXTENSIONS.some((extension) => value.endsWith(extension));

            if (!hasValidExtension) {
                warn(context, `Export path "${value}" at ${path} should have a valid file extension (${VALID_EXPORT_EXTENSIONS.join(", ")})`);
            }

            return;
        }

        if (Array.isArray(value)) {
            // Fallback arrays are supported but should contain valid values
            if (value.length === 0) {
                warn(context, `Empty fallback array at ${path}. Fallback arrays should contain at least one entry`);

                return;
            }

            value.forEach((item, index) => {
                validateExportsValue(item, `${path}[${index}]`);
            });

            return;
        }

        if (typeof value === "object" && value !== null) {
            // Conditional exports object
            const conditions = Object.keys(value);

            if (conditions.length === 0) {
                warn(context, `Empty conditions object at ${path}. Conditional exports should define at least one condition`);

                return;
            }

            // Check for unknown conditions
            const unknownConditions = conditions.filter((condition) => !ALL_CONDITIONS.has(condition));

            if (unknownConditions.length > 0) {
                const hasExtraConditions = extraConditions.length > 0;
                const standardConditionsList = [...STANDARD_CONDITIONS].join(", ");

                if (hasExtraConditions) {
                    warn(context, `Unknown export conditions [${unknownConditions.join(", ")}] at ${path}. Consider using standard conditions (${standardConditionsList}) or add custom conditions to 'validation.packageJson.extraConditions' in your packem config.`);
                } else {
                    warn(context, `Unknown export conditions [${unknownConditions.join(", ")}] at ${path}. Consider using standard conditions (${standardConditionsList}) or add custom conditions using the 'extraConditions' option in your validation config.`);
                }
            }

            // Validate condition priority order
            const standardConditionsPresent = conditions.filter((c) => STANDARD_CONDITIONS.has(c));

            if (standardConditionsPresent.length > 1) {
                const expectedOrder = ["node-addons", "node", "import", "require", "module-sync", "default"];
                const actualOrder = standardConditionsPresent;
                const correctOrder = expectedOrder.filter((c) => actualOrder.includes(c));

                if (JSON.stringify(actualOrder) !== JSON.stringify(correctOrder)) {
                    warn(context, `Incorrect condition order at ${path}. Standard conditions should be ordered: ${correctOrder.join(" > ")}`);
                }
            }

            // Validate mutually exclusive conditions
            if (conditions.includes("import") && conditions.includes("require")) {
                // This is actually valid they are mutually exclusive by nature
            }

            if (conditions.includes("development") && conditions.includes("production")) {
                warn(context, `Conflicting conditions "development" and "production" at ${path}. These conditions are mutually exclusive`);
            }

            // Recursively validate condition values
            conditions.forEach((condition) => {
                validateExportsValue(value[condition as keyof typeof value], `${path}.${condition}`);
            });

            return;
        }

        warn(context, `Invalid exports value type at ${path}. Expected string, array, object, or null`);
    };

    const validateExportsObject = (exportsObject: unknown): void => {
        if (typeof exportsObject === "string") {
            validateExportsValue(exportsObject, "exports");

            return;
        }

        if (Array.isArray(exportsObject)) {
            exportsObject.forEach((item, index) => {
                validateExportsValue(item, `exports[${index}]`);
            });

            return;
        }

        if (typeof exportsObject === "object" && exportsObject !== null) {
            const keys = Object.keys(exportsObject);

            if (keys.length === 0) {
                warn(context, "Empty exports object. Define at least one export entry");

                return;
            }

            // Check if it's a subpaths object (keys start with ".") or conditions object
            const subpathKeys = keys.filter((key) => key.startsWith("."));
            const conditionKeys = keys.filter((key) => !key.startsWith("."));

            if (subpathKeys.length > 0 && conditionKeys.length > 0) {
                warn(context, "Mixed subpaths and conditions in exports object. Use either subpaths (keys starting with \".\") or conditions, not both");

                return;
            }

            if (subpathKeys.length > 0) {
                // Subpaths exports
                if (!keys.includes(".")) {
                    warn(context, "Missing main export \".\". Subpaths exports should include a main export entry");
                }

                // Validate subpath patterns
                keys.forEach((key) => {
                    if (key.startsWith("./")) {
                        // Valid subpath
                    } else if (key === ".") {
                        // Valid main export
                    } else if (key.startsWith(".") && !key.startsWith("./")) {
                        warn(context, `Invalid subpath "${key}". Subpaths should start with "./" or be exactly "."`);
                    }

                    // Check for wildcard patterns
                    if (key.includes("*")) {
                        const asteriskCount = (key.match(/\*/g) || []).length;

                        if (asteriskCount > 1) {
                            warn(context, `Invalid subpath pattern "${key}". Only one "*" wildcard is allowed per subpath`);
                        }
                    }

                    validateExportsValue(exportsObject[key as keyof typeof exportsObject], `exports["${key}"]`);
                });
            } else {
                // Conditions object at root level
                validateExportsValue(exportsObject, "exports");
            }

            return;
        }

        warn(context, "Invalid exports field type. Expected string, array, or object");
    };

    validateExportsObject(exports);
};

// eslint-disable-next-line sonarjs/cognitive-complexity
const validatePackageFields = (context: BuildContext<InternalBuildOptions>): void => {
    const validation = context.options.validation as ValidationOptions;
    const { pkg } = context;
    const cjsJSExtension = getOutputExtension(context, "cjs");
    const esmJSExtension = getOutputExtension(context, "esm");

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

    if (pkg.exports !== undefined) {
        validateExports(context, pkg.exports);
    }

    if (validation.packageJson?.bin !== false) {
        const forbiddenExtension = isCjs ? esmJSExtension : cjsJSExtension;

        // If both ESM and CJS use the same extension, then no extension is forbidden
        const shouldValidateBinExtensions = cjsJSExtension !== esmJSExtension;

        if (shouldValidateBinExtensions) {
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
