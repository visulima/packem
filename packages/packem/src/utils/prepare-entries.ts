import { cyan } from "@visulima/colorize";
import { NotFoundError } from "@visulima/fs/error";
import { isAbsolute, join, normalize, relative, resolve } from "@visulima/path";
import { isRelative } from "@visulima/path/utils";
import isGlob from "is-glob";
import { globSync } from "tinyglobby";

import { ENDING_RE } from "../constants";
import type { BuildContext, BuildEntry } from "../types";
import dumpObject from "./dump-object";

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
        throw new Error(`Missing entry input: ${dumpObject(entry)}`);
    }

    if (isRelative(entry.input)) {
        // eslint-disable-next-line no-param-reassign
        entry.input = resolve(context.options.rootDir, entry.input);
    }

    if (context.options.declaration && entry.declaration === undefined) {
        // eslint-disable-next-line no-param-reassign
        entry.declaration = context.options.declaration;
    }

    if (context.options.emitCJS !== undefined && entry.cjs === undefined) {
        // eslint-disable-next-line no-param-reassign
        entry.cjs = context.options.emitCJS;
    }

    if (context.options.emitESM !== undefined && entry.esm === undefined) {
        // eslint-disable-next-line no-param-reassign
        entry.esm = context.options.emitESM;
    }

    // eslint-disable-next-line no-param-reassign
    entry.outDir = resolve(context.options.rootDir, entry.outDir ?? context.options.outDir);
};

const prepareEntries = async (context: BuildContext): Promise<void> => {
    context.options.entries = context.options.entries.map((entry) =>
        (typeof entry === "string" ? { input: entry, isGlob: isGlob(entry) } : { ...entry, isGlob: isGlob(entry.input) }),
    );

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

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax,@typescript-eslint/no-shadow
    for await (const entry of context.options.entries.filter((entry) => entry.fileAlias === undefined)) {
        await extendEntry(entry, context);
    }

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax,@typescript-eslint/no-shadow
    for await (const entry of context.options.entries.filter((entry) => entry.fileAlias !== undefined)) {
        entry.name = entry.fileAlias;
        entry.fileAlias = undefined;

        await extendEntry(entry, context);
    }
};

export default prepareEntries;
