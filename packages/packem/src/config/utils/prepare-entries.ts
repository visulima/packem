import { cyan } from "@visulima/colorize";
import { NotFoundError } from "@visulima/fs/error";
import { globSync } from "@visulima/fs/glob";
import isGlobPattern from "@visulima/fs/is-glob";
import { ENDING_REGEX } from "@visulima/packem-share/constants";
import type { BuildContext } from "@visulima/packem-share/types";
import { isAbsolute, join, normalize, relative, resolve } from "@visulima/path";
import { isRelative } from "@visulima/path/utils";

import type { BuildEntry, InternalBuildOptions } from "../../types";
import escapeRegExp from "../../utils/escape-regexp";

const LEADING_RELATIVE_SEGMENT_REGEXP = /^\.\.?\//;

/**
 * Applies the cjs/esm format flags to an entry from the global build options
 * when the entry does not already specify them. Extracted to keep
 * {@link extendEntry}'s control flow flat.
 */
const applyFormatFlags = (entry: BuildEntry, context: BuildContext<InternalBuildOptions>): void => {
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

        return;
    }

    if (entry.cjs !== undefined || entry.esm !== undefined) {
        return;
    }

    // Only set cjs/esm from global options if entry doesn't have declaration-only flag.
    // Declaration-only entries (only types condition) should not get cjs/esm flags even if
    // global options are set. Both cjs and esm are provably undefined here, so the heuristic
    // reduces to "does the entry have a declaration flag".
    const isDeclarationOnly = Boolean(entry.declaration);

    if (isDeclarationOnly) {
        return;
    }

    if (context.options.emitCJS !== undefined) {
        // eslint-disable-next-line no-param-reassign
        entry.cjs = context.options.emitCJS;
    }

    if (context.options.emitESM !== undefined) {
        // eslint-disable-next-line no-param-reassign
        entry.esm = context.options.emitESM;
    }
};

const extendEntry = (entry: BuildEntry, context: BuildContext<InternalBuildOptions>): void => {
    if (typeof entry.name !== "string") {
        let relativeInput = isAbsolute(entry.input) ? relative(context.options.rootDir, entry.input) : normalize(entry.input);

        if (relativeInput.startsWith("./")) {
            relativeInput = relativeInput.slice(2);
        }

        // eslint-disable-next-line no-param-reassign
        entry.name = relativeInput.replace(new RegExp(`^${escapeRegExp(context.options.sourceDir)}/`), "").replace(ENDING_REGEX, "");
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
    applyFormatFlags(entry, context);

    // eslint-disable-next-line no-param-reassign
    entry.outDir = resolve(context.options.rootDir, entry.outDir ?? context.options.outDir);
};

/**
 * Normalizes the raw entries list into objects and computes glob/exportKey
 * metadata.
 */
const normalizeEntries = (context: BuildContext<InternalBuildOptions>): void => {
    context.options.entries = context.options.entries.map((entry) => {
        if (typeof entry === "string") {
            return { input: entry, isGlob: isGlobPattern(entry) };
        }

        return {
            ...entry,
            exportKey: entry.exportKey ?? new Set(),
            isGlob: isGlobPattern(entry.input),
        };
    });
};

const collectGlobIgnorePatterns = (context: BuildContext<InternalBuildOptions>): string[] => {
    const ignore = [
        "**/.git/**",
        "**/node_modules/**",
        "**/test-results/**", // Playwright
    ];

    const { watch } = context.options.rollup;

    if (watch) {
        if (typeof watch.exclude === "string") {
            ignore.push(watch.exclude);
        } else if (Array.isArray(watch.exclude)) {
            for (const pattern of watch.exclude) {
                if (typeof pattern === "string") {
                    ignore.push(pattern);
                }
            }
        }
    }

    return ignore;
};

const expandGlobEntries = (context: BuildContext<InternalBuildOptions>): void => {
    for (const entry of context.options.entries.filter((globEntry) => globEntry.isGlob)) {
        const entryWithoutGlob: BuildEntry = { ...entry };

        delete entryWithoutGlob.isGlob;

        const files = globSync([entryWithoutGlob.input], {
            cwd: context.options.rootDir,
            dot: false,
            ignore: collectGlobIgnorePatterns(context),
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
};

const hasNodeLikeExportKey = (exportKey: Set<string>): boolean => {
    for (const key of exportKey) {
        if (key === "node" || key === "workerd" || key.includes("node") || key.includes("workerd")) {
            return true;
        }
    }

    return false;
};

const fileAliasIndicatesNode = (fileAlias: string): boolean => fileAlias.includes(".server") || fileAlias.includes(".node") || fileAlias.includes(".workerd");

/**
 * Resolves the runtime for a single entry from its export keys and file
 * alias. Returns `undefined` when no runtime can be inferred. Preserves the
 * exact precedence of the original inline logic (browser first, then
 * node/workerd from export keys, then node from the file alias).
 */
const resolveEntryRuntime = (entry: BuildEntry): BuildEntry["runtime"] => {
    // Check for browser condition first (highest priority)
    const hasBrowserExportKey = entry.exportKey && [...entry.exportKey].some((key) => key.includes("browser") || key === "browser");
    const hasBrowserFileAlias = entry.fileAlias?.includes(".browser") ?? false;

    if (hasBrowserExportKey || hasBrowserFileAlias) {
        return "browser";
    }

    if (entry.exportKey && hasNodeLikeExportKey(entry.exportKey)) {
        return "node";
    }

    // Check file alias for server/node/workerd patterns
    if (entry.fileAlias && fileAliasIndicatesNode(entry.fileAlias)) {
        return "node";
    }

    return undefined;
};

/**
 * Detects the runtime from export keys and file aliases for entries that
 * don't have a runtime set.
 */
const detectEntryRuntimes = (context: BuildContext<InternalBuildOptions>): void => {
    for (const entry of context.options.entries) {
        if (entry.runtime) {
            continue;
        }

        const runtime = resolveEntryRuntime(entry);

        if (runtime) {
            entry.runtime = runtime;
        }
    }
};

const applyFileAliasNames = (context: BuildContext<InternalBuildOptions>): void => {
    // Convert fileAlias to name BEFORE extendEntry to ensure unique entry names.
    // This ensures entries with different fileAlias get separate builds for rollup input.
    for (const entry of context.options.entries) {
        if (entry.fileAlias) {
            // Sanitize the name by removing path prefixes (./, ../) as Rollup's [name]
            // placeholder doesn't accept absolute or relative paths.
            let sanitizedName = entry.fileAlias;

            while (sanitizedName.startsWith("./") || sanitizedName.startsWith("../")) {
                sanitizedName = sanitizedName.replace(LEADING_RELATIVE_SEGMENT_REGEXP, "");
            }

            entry.name = sanitizedName;
        }
    }
};

const prepareEntries = (context: BuildContext<InternalBuildOptions>): void => {
    normalizeEntries(context);
    expandGlobEntries(context);
    detectEntryRuntimes(context);
    applyFileAliasNames(context);

    // Process entries without fileAlias first
    for (const entry of context.options.entries.filter((withoutAlias) => !withoutAlias.fileAlias)) {
        extendEntry(entry, context);
    }

    // Process entries with fileAlias (name already set to fileAlias)
    for (const entry of context.options.entries.filter((withAlias) => withAlias.fileAlias)) {
        // Name is already set to fileAlias, extendEntry will preserve it
        extendEntry(entry, context);

        // Clear fileAlias after processing (no longer needed, name is set)
        entry.fileAlias = undefined;
    }
};

export default prepareEntries;
