import { cyan } from "@visulima/colorize";
import { NotFoundError } from "@visulima/fs/error";
import { isAbsolute, join, normalize, relative, resolve } from "@visulima/path";
import { isRelative } from "@visulima/path/utils";
import { globSync, isDynamicPattern } from "tinyglobby";

import { ENDING_RE } from "../../constants";
import type { BuildContext, BuildEntry } from "../../types";

// eslint-disable-next-line sonarjs/cognitive-complexity
const extendEntry = async (entry: BuildEntry, context: BuildContext): Promise<void> => {
    if (typeof entry.name !== "string") {
        let relativeInput = isAbsolute(entry.input) ? relative(context.options.rootDir, entry.input) : normalize(entry.input);

        if (relativeInput.startsWith("./")) {
            relativeInput = relativeInput.slice(2);
        }

        // eslint-disable-next-line @rushstack/security/no-unsafe-regexp,security/detect-non-literal-regexp,no-param-reassign
        entry.name = relativeInput.replace(new RegExp(`^${context.options.sourceDir}/`), "").replace(ENDING_RE, "");
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
        if (context.options.emitCJS !== undefined) {
            // eslint-disable-next-line no-param-reassign
            entry.cjs = context.options.emitCJS;
        }

        if (context.options.emitESM !== undefined) {
            // eslint-disable-next-line no-param-reassign
            entry.esm = context.options.emitESM;
        }
    }

    // eslint-disable-next-line no-param-reassign
    entry.outDir = resolve(context.options.rootDir, entry.outDir ?? context.options.outDir);
};

// eslint-disable-next-line sonarjs/cognitive-complexity
const prepareEntries = async (context: BuildContext): Promise<void> => {
    context.options.entries = context.options.entries.map((entry) =>
        (typeof entry === "string"
            ? { input: entry, isGlob: isDynamicPattern(entry) }
            : { ...entry, exportKey: entry.exportKey ?? new Set(), isGlob: isDynamicPattern(entry.input) }),
    );

    // eslint-disable-next-line @typescript-eslint/no-shadow
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
            throw new NotFoundError("No files found in the glob pattern: " + cyan(join(context.options.rootDir, entryWithoutGlob.input)));
        }

        for (const file of files) {
            context.options.entries.push({
                ...entryWithoutGlob,
                input: resolve(context.options.rootDir, file),
            });
        }

        context.options.entries.splice(context.options.entries.indexOf(entry), 1);
    }

    // eslint-disable-next-line @typescript-eslint/no-shadow
    for (const entry of context.options.entries.filter((entry) => entry.fileAlias === undefined)) {
        // eslint-disable-next-line no-await-in-loop
        await extendEntry(entry, context);
    }

    // eslint-disable-next-line @typescript-eslint/no-shadow
    for (const entry of context.options.entries.filter((entry) => entry.fileAlias !== undefined)) {
        entry.name = entry.fileAlias;
        entry.fileAlias = undefined;

        // eslint-disable-next-line no-await-in-loop
        await extendEntry(entry, context);
    }
};

export default prepareEntries;
