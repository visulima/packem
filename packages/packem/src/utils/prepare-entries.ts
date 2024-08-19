import { readdir } from "node:fs/promises";

import { cyan } from "@visulima/colorize";
import { isAccessibleSync } from "@visulima/fs";
import { NotFoundError } from "@visulima/fs/error";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from "@visulima/path";
import isGlob from "is-glob";
import { globSync } from "tinyglobby";

import { DEFAULT_EXTENSIONS } from "../constants";
import type { BuildContext, BuildEntry } from "../types";
import dumpObject from "./dump-object";

const removeExtension = (filename: string): string => filename.replace(/\.(?:js|mjs|cjs|ts|mts|cts|json|jsx|tsx)$/, "");

// eslint-disable-next-line sonarjs/cognitive-complexity
const prepareEntries = async (context: BuildContext, rootDirectory: string): Promise<void> => {
    context.options.entries = context.options.entries.map((entry) =>
        (typeof entry === "string" ? { input: entry, isGlob: isGlob(entry) } : { ...entry, isGlob: isGlob(entry.input) }),
    );

    const fileAliasEntries: BuildEntry[] = [];

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax,@typescript-eslint/no-shadow
    for (const entry of context.options.entries.filter((entry) => entry.isGlob)) {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { isGlob: _, ...entryWithoutGlob } = entry;

        const files = globSync([entryWithoutGlob.input], {
            cwd: context.options.rootDir,
            dot: false,
            ignore: ["**/node_modules/**"],
            onlyFiles: true,
        });

        if (files.length === 0) {
            throw new NotFoundError("No files found in the glob pattern: " + cyan(join(context.options.rootDir, entryWithoutGlob.input)));
        }

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const file of files) {
            context.options.entries.push({
                ...entryWithoutGlob,
                input: resolve(context.options.rootDir, file),
            });
        }

        context.options.entries.splice(context.options.entries.indexOf(entry), 1);
    }

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for await (const entry of context.options.entries) {
        if (typeof entry.name !== "string") {
            let relativeInput = isAbsolute(entry.input) ? relative(rootDirectory, entry.input) : normalize(entry.input);

            if (relativeInput.startsWith("./")) {
                relativeInput = relativeInput.slice(2);
            }

            // eslint-disable-next-line @rushstack/security/no-unsafe-regexp,security/detect-non-literal-regexp
            entry.name = removeExtension(relativeInput.replace(new RegExp(`^${context.options.sourceDir}/`), ""));

            if (entry.fileAlias) {
                fileAliasEntries.push({
                    ...entry,
                    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                    name: entry.name + "." + entry.environment,
                });
            }
        }

        if (!entry.input) {
            throw new Error(`Missing entry input: ${dumpObject(entry)}`);
        }

        entry.input = resolve(context.options.rootDir, entry.input);

        if (context.options.declaration && entry.declaration === undefined) {
            entry.declaration = context.options.declaration;
        }

        if (context.options.emitCJS !== undefined && entry.cjs === undefined) {
            entry.cjs = context.options.emitCJS;
        }

        if (context.options.emitESM !== undefined && entry.esm === undefined) {
            entry.esm = context.options.emitESM;
        }

        if (!isAccessibleSync(entry.input)) {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            const filesInWorkingDirectory = new Set(await readdir(dirname(entry.input)));

            let hasFile = false;

            // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
            for (const extension of DEFAULT_EXTENSIONS) {
                if (filesInWorkingDirectory.has(basename(entry.input) + extension)) {
                    hasFile = true;
                    break;
                }
            }

            if (!hasFile) {
                throw new NotFoundError("Your configured entry: " + cyan(entry.input) + " does not exist.");
            }
        }

        entry.outDir = resolve(context.options.rootDir, entry.outDir ?? context.options.outDir);
    }

    context.options.entries.push(...fileAliasEntries);
};

export default prepareEntries;
