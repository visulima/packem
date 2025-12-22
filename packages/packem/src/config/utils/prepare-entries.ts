import { cyan } from "@visulima/colorize";
import { NotFoundError } from "@visulima/fs/error";
import { ENDING_REGEX } from "@visulima/packem-share/constants";
import type { BuildContext } from "@visulima/packem-share/types";
import { isAbsolute, join, normalize, relative, resolve } from "@visulima/path";
import { isRelative } from "@visulima/path/utils";
import { globSync, isDynamicPattern } from "tinyglobby";

import type { BuildEntry, InternalBuildOptions } from "../../types";

const extendEntry = async (entry: BuildEntry, context: BuildContext<InternalBuildOptions>): Promise<void> => {
    if (typeof entry.name !== "string") {
        let relativeInput = isAbsolute(entry.input) ? relative(context.options.rootDir, entry.input) : normalize(entry.input);

        if (relativeInput.startsWith("./")) {
            relativeInput = relativeInput.slice(2);
        }

        // eslint-disable-next-line no-param-reassign
        entry.name = relativeInput.replace(new RegExp(`^${context.options.sourceDir}/`), "").replace(ENDING_REGEX, "");
    }

    if (!entry.input) {
        throw new Error(`Missing entry input: ${JSON.stringify(entry)}`);
    }

    if (isRelative(entry.input)) {
        // eslint-disable-next-line no-param-reassign
        entry.input = resolve(context.options.rootDir, entry.input);
    }

    if (context.options.declaration && entry.declaration === undefined) {
        // eslint-disable-next-line no-param-reassign
        entry.declaration = context.options.declaration;
    }

    // @TODO: improve this logic
    if (entry.executable && (entry.cjs === undefined || entry.esm === undefined)) {
        if (context.pkg.type === "commonjs" && entry.cjs === undefined && context.options.emitCJS !== undefined) {
            // eslint-disable-next-line no-param-reassign
            entry.cjs = context.options.emitCJS;
            // eslint-disable-next-line no-param-reassign
            entry.esm = false;
        } else if (context.pkg.type === "module" && entry.esm === undefined && context.options.emitESM !== undefined) {
            // eslint-disable-next-line no-param-reassign
            entry.esm = context.options.emitESM;
            // eslint-disable-next-line no-param-reassign
            entry.cjs = false;
        }
    } else if (entry.cjs === undefined && entry.esm === undefined) {
        // Only set cjs/esm from global options if entry doesn't have declaration-only flag
        // Declaration-only entries (only types condition) should not get cjs/esm flags even if global options are set
        // We check if entry has declaration but no cjs/esm as a heuristic for declaration-only entries
        const isDeclarationOnly = entry.declaration && entry.cjs === undefined && entry.esm === undefined;

        if (!isDeclarationOnly) {
            if (context.options.emitCJS !== undefined) {
                // eslint-disable-next-line no-param-reassign
                entry.cjs = context.options.emitCJS;
            }

            if (context.options.emitESM !== undefined) {
                // eslint-disable-next-line no-param-reassign
                entry.esm = context.options.emitESM;
            }
        }
    }

    // eslint-disable-next-line no-param-reassign
    entry.outDir = resolve(context.options.rootDir, entry.outDir ?? context.options.outDir);
};

const prepareEntries = async (context: BuildContext<InternalBuildOptions>): Promise<void> => {
    context.options.entries = context.options.entries.map((entry) =>
        (typeof entry === "string"
            ? { input: entry, isGlob: isDynamicPattern(entry) }
            : {
                  ...entry,
                  exportKey: entry.exportKey ?? new Set(),
                  isGlob: isDynamicPattern(entry.input),
              }),
    );

    for (const entry of context.options.entries.filter((entry) => entry.isGlob)) {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { isGlob: _, ...entryWithoutGlob } = entry;
        const ignore = [
            "**/.git/**",
            "**/node_modules/**",
            "**/test-results/**", // Playwright
        ];

        if (context.options.rollup.watch) {
            if (typeof context.options.rollup.watch.exclude === "string") {
                ignore.push(context.options.rollup.watch.exclude);
            } else if (Array.isArray(context.options.rollup.watch.exclude)) {
                for (const pattern of context.options.rollup.watch.exclude) {
                    if (typeof pattern === "string") {
                        ignore.push(pattern);
                    }
                }
            }
        }

        const files = globSync([entryWithoutGlob.input], {
            cwd: context.options.rootDir,
            dot: false,
            ignore,
            onlyFiles: true,
        });

        if (files.length === 0) {
            throw new NotFoundError(`No files found in the glob pattern: ${cyan(join(context.options.rootDir, entryWithoutGlob.input))}`);
        }

        for (const file of files) {
            context.options.entries.push({
                ...entryWithoutGlob,
                input: resolve(context.options.rootDir, file),
            });
        }

        context.options.entries.splice(context.options.entries.indexOf(entry), 1);
    }

    // Detect runtime from export keys and file aliases for entries that don't have runtime set
    for (const entry of context.options.entries) {
        if (entry.runtime) {
            continue;
        }

        // Check for browser condition first (highest priority)
        const hasBrowserExportKey = entry.exportKey && [...entry.exportKey].some((key) => key.includes("browser") || key === "browser");
        const hasBrowserFileAlias = entry.fileAlias?.includes(".browser") ?? false;

        if (hasBrowserExportKey || hasBrowserFileAlias) {
            entry.runtime = "browser";
        } else if (entry.exportKey) {
            // Check for node/workerd conditions
            for (const exportKey of entry.exportKey) {
                if (exportKey === "node" || exportKey === "workerd" || exportKey.includes("node") || exportKey.includes("workerd")) {
                    entry.runtime = "node";

                    break;
                }
            }
        }

        // Check file alias for server/node/workerd patterns
        if (
            !entry.runtime
            && entry.fileAlias
            && (entry.fileAlias.includes(".server") || entry.fileAlias.includes(".node") || entry.fileAlias.includes(".workerd"))
        ) {
            entry.runtime = "node";
        }
    }

    // Convert fileAlias to name BEFORE extendEntry to ensure unique entry names
    // This ensures entries with different fileAlias get different names for rollup input
    // Entries with fileAlias should use fileAlias as their name to ensure separate builds
    for (const entry of context.options.entries) {
        if (entry.fileAlias) {
            // Set name to fileAlias to ensure unique entry names for rollup
            // This ensures entries with different fileAlias get separate builds
            // Sanitize the name by removing path prefixes (./, ../) as Rollup's [name] placeholder
            // doesn't accept absolute or relative paths
            let sanitizedName = entry.fileAlias;
            // Remove leading ./ or ../
            while (sanitizedName.startsWith("./") || sanitizedName.startsWith("../")) {
                sanitizedName = sanitizedName.replace(/^\.\.?\//, "");
            }
            entry.name = sanitizedName;
        }
    }

    // Process entries without fileAlias first
    for (const entry of context.options.entries.filter((entry) => !entry.fileAlias)) {
        // eslint-disable-next-line no-await-in-loop
        await extendEntry(entry, context);
    }

    // Process entries with fileAlias (name already set to fileAlias)
    for (const entry of context.options.entries.filter((entry) => entry.fileAlias)) {
        // Name is already set to fileAlias, extendEntry will preserve it
        // eslint-disable-next-line no-await-in-loop
        await extendEntry(entry, context);
        // Clear fileAlias after processing (no longer needed, name is set)

        entry.fileAlias = undefined;
    }
};

export default prepareEntries;
