import { bold, cyan, gray } from "@visulima/colorize";
import { collectSync, isAccessibleSync } from "@visulima/fs";
import type { NormalizedPackageJson } from "@visulima/package";
import { ALLOWED_TRANSFORM_EXTENSIONS_REGEX, EXCLUDE_REGEXP } from "@visulima/packem-share/constants";
import type { BuildContext } from "@visulima/packem-share/types";
import { join } from "@visulima/path";

import type { BuildConfig, InternalBuildOptions } from "../../types";
import inferEntries from "./utils/infer-entries";
import overwriteWithPublishConfig from "./utils/overwrite-with-publish-config";

// eslint-disable-next-line sonarjs/slow-regex -- bounded path segment match against collected file list
const DIST_PATH_REGEXP = /.*\/dist\/.*/;

const TRAILING_SLASH_REGEXP = /\/$/;

const MJS_OUTPUT_REGEXP = /\.mjs$/;
const CJS_OUTPUT_REGEXP = /\.cjs$/;
const DECLARATION_OUTPUT_REGEXP = /\.d\.[mc]?ts$/;
// Plain `.js` that is not a declaration file; its format depends on package type.
const JS_OUTPUT_REGEXP = /(?<!\.d)\.js$/;

/**
 * Collects every output file path and condition key referenced by a
 * package.json's `exports`/`main`/`module`/`types`. Used to derive emit formats
 * in unbundle mode, which skips {@link inferEntries}.
 * @param packageJson The package manifest to scan.
 * @returns Referenced output file paths and the set of export condition keys.
 */
const collectPackageOutputs = (packageJson: NormalizedPackageJson): { conditions: Set<string>; files: string[] } => {
    const files: string[] = [];
    const conditions = new Set<string>();

    const walk = (value: unknown): void => {
        if (typeof value === "string") {
            files.push(value);

            return;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                walk(item);
            }

            return;
        }

        if (value && typeof value === "object") {
            for (const [key, nested] of Object.entries(value)) {
                // Subpath keys start with "." (e.g. "./core"); everything else is
                // a condition name (import, require, types, node, development, …).
                if (!key.startsWith(".")) {
                    conditions.add(key);
                }

                walk(nested);
            }
        }
    };

    if (packageJson.exports) {
        walk(packageJson.exports);
    }

    for (const field of [packageJson.main, packageJson.module, packageJson.types]) {
        if (typeof field === "string") {
            files.push(field);
        }
    }

    return { conditions, files };
};

/**
 * Minimal structural view of the {@link BuildContext}'s `logger` (a `Pail`
 * instance). The `@visulima/pail` package's export map is not resolvable by
 * the typed-linting program (it resolves fine under `tsc`), which would
 * otherwise surface as `no-unsafe-*` false positives. Narrowing to the
 * methods actually used here keeps the call sites correctly typed.
 */
interface AutoPresetLogger {
    debug: (...arguments_: unknown[]) => void;
    info: (...arguments_: unknown[]) => void;
    warn: (...arguments_: unknown[]) => void;
}

const autoPreset: BuildConfig = {
    hooks: {
        "build:prepare": async function (context: BuildContext<InternalBuildOptions>) {
            // For unbundle mode, always create entries for all source files
            if (context.options.unbundle) {
                // Clear existing entries
                context.options.entries.length = 0;

                const sourceDirectory = join(context.options.rootDir, context.options.sourceDir);

                if (!isAccessibleSync(sourceDirectory)) {
                    throw new Error("No 'src' directory found. Please provide entries manually.");
                }

                const sourceFiles = collectSync(sourceDirectory, {
                    extensions: [],
                    includeDirs: false,
                    includeSymlinks: false,
                    skip: [EXCLUDE_REGEXP, DIST_PATH_REGEXP],
                });

                // Filter for TypeScript/JavaScript files
                const codeFiles = sourceFiles.filter((file) => ALLOWED_TRANSFORM_EXTENSIONS_REGEX.test(file) && !file.endsWith(".d.ts"));

                // Unbundle mode skips inferEntries, so the emit-format flags it
                // normally derives from package.json are still unset here. Without
                // them every entry has neither `cjs` nor `esm` set and nothing is
                // emitted ("Emitting of ESM/CJS bundles is disabled"). Derive the
                // formats from the same package.json signals inferEntries uses —
                // but only when the user has not configured them explicitly.
                const { conditions, files } = collectPackageOutputs(context.pkg as NormalizedPackageJson);

                if (context.options.emitESM === undefined && context.options.emitCJS === undefined) {
                    const packageType: "cjs" | "esm" = context.pkg.type === "module" ? "esm" : "cjs";
                    const hasPlainJs = files.some((file) => JS_OUTPUT_REGEXP.test(file));

                    let emitESM
                        = files.some((file) => MJS_OUTPUT_REGEXP.test(file)) || conditions.has("import") || conditions.has("module") || (hasPlainJs && packageType === "esm");
                    let emitCJS = files.some((file) => CJS_OUTPUT_REGEXP.test(file)) || conditions.has("require") || (hasPlainJs && packageType === "cjs");

                    // Fall back to the package type when the package.json carries no
                    // format-specific signal (e.g. exports with only a `default`).
                    if (!emitESM && !emitCJS) {
                        if (packageType === "esm") {
                            emitESM = true;
                        } else {
                            emitCJS = true;
                        }
                    }

                    context.options.emitESM = emitESM;
                    context.options.emitCJS = emitCJS;
                }

                const emitESM = context.options.emitESM ?? false;
                const emitCJS = context.options.emitCJS ?? false;

                // Respect an explicit `declaration` (config/CLI); otherwise enable
                // it when the package references type declarations.
                if (context.options.declaration === undefined) {
                    const hasTypes = Boolean(context.pkg.types) || conditions.has("types") || files.some((file) => DECLARATION_OUTPUT_REGEXP.test(file));

                    context.options.declaration = hasTypes ? "node16" : false;
                }

                for (const file of codeFiles) {
                    const relativePath = file.replace(`${sourceDirectory}/`, "");
                    const name = relativePath.replace(ALLOWED_TRANSFORM_EXTENSIONS_REGEX, "").replaceAll("/", "/");

                    context.options.entries.push({
                        cjs: emitCJS,
                        declaration: context.options.declaration,
                        esm: emitESM,
                        input: file,
                        name,
                    });
                }

                (context.logger as AutoPresetLogger).info(
                    "Unbundle mode: preserving source structure for",
                    cyan(`${String(context.options.entries.length)} entr${context.options.entries.length === 1 ? "y" : "ies"}`),
                    gray(
                        [emitESM && "esm", emitCJS && "cjs", context.options.declaration && "dts"]
                            .filter(Boolean)
                            .map((tag) => `[${String(tag)}]`)
                            .join(" "),
                    ),
                );

                // Don't run the normal auto logic
                return;
            }

            // Disable auto if entries already provided of pkg not available
            if (context.options.entries.length > 0) {
                return;
            }

            const sourceDirectory = join(context.options.rootDir, context.options.sourceDir);

            if (!isAccessibleSync(sourceDirectory)) {
                throw new Error("No 'src' directory found. Please provide entries manually.");
            }

            const sourceFiles = collectSync(sourceDirectory, {
                extensions: [],
                includeDirs: false,
                includeSymlinks: false,
                skip: [EXCLUDE_REGEXP, DIST_PATH_REGEXP],
            });

            if (sourceFiles.length === 0) {
                throw new Error("No source files found in 'src' directory. Please provide entries manually.");
            }

            const logger = context.logger as AutoPresetLogger;

            let packageJson = { ...context.pkg } as NormalizedPackageJson;

            if (packageJson.publishConfig) {
                logger.info(
                    `Using publishConfig found in package.json, to override the default key-value pairs of "${Object.keys(packageJson.publishConfig).join(
                        ", ",
                    )}".`,
                );
                logger.debug(packageJson.publishConfig);

                packageJson = overwriteWithPublishConfig(packageJson, context.options.declaration);
            }

            // Unbundle mode is handled by the early branch above (which
            // returns), so by here we always run inferEntries.
            const result = await inferEntries(packageJson, sourceFiles, context);

            for (const message of result.warnings) {
                logger.warn(message);
            }

            context.options.entries.push(...result.entries);

            if (context.options.entries.length === 0) {
                throw new Error("No entries detected. Please provide entries manually.");
            } else {
                logger.info(
                    "Automatically detected entries:",
                    cyan(
                        context.options.entries
                            .map((buildEntry) => {
                                if (buildEntry.fileAlias) {
                                    return `${bold(buildEntry.fileAlias)} => ${bold(
                                        buildEntry.input.replace(`${context.options.rootDir}/`, "").replace(TRAILING_SLASH_REGEXP, "/*"),
                                    )}`;
                                }

                                return bold(buildEntry.input.replace(`${context.options.rootDir}/`, "").replace(TRAILING_SLASH_REGEXP, "/*"));
                            })
                            .join(", "),
                    ),
                    gray(
                        [context.options.emitESM && "esm", context.options.emitCJS && "cjs", context.options.declaration && "dts"]
                            .filter(Boolean)
                            .map((tag) => `[${tag}]`)
                            .join(" "),
                    ),
                );
            }
        },
    },
};

export default autoPreset;
