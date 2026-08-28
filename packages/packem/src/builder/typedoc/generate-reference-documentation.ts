import { readdirSync } from "node:fs";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { replaceContentWithinMarker } from "@visulima/packem-share";
import { join } from "@visulima/path";
import { Application } from "typedoc";

import type { BuildEntry, TypeDocumentOptions } from "../../types";

/**
 * Structured payload accepted by the Pail logger methods.
 * @internal
 */
interface LoggerMessage {
    context?: unknown[];
    message: unknown;
    prefix?: string;
    suffix?: string;
}

/**
 * Minimal, precisely-typed view of the `@visulima/pail` logger surface used here.
 *
 * The published `@visulima/pail` types re-export `Pail` from a non-existent
 * `./pail.d.ts` (the real declaration is `./pail.server.d.ts`), so the upstream
 * `Pail` type resolves to an unresolved/`any`-like type. Modelling only the
 * methods we call keeps the call sites strictly typed without an `any` escape.
 * @internal
 */
interface Logger {
    error: (message: LoggerMessage | string, ...arguments_: unknown[]) => void;
    warn: (message: LoggerMessage | string, ...arguments_: unknown[]) => void;
}

/**
 * Inlines generated typedoc markdown into the project README between the
 * configured marker comments. Extracted from the main flow to keep the
 * orchestration function within the cognitive-complexity budget; behavior
 * is unchanged.
 * @internal
 */
const inlineMarkdownIntoReadme = (outputDirectory: string, entriesCount: number, marker: string, readmePath: string, logger: Logger): void => {
    const markdownPathsList = readdirSync(outputDirectory, {
        withFileTypes: true,
    }).filter((item) => item.isFile());

    let markdownContent = "";

    for (const item of markdownPathsList) {
        if (item.name === "README.md" && entriesCount > 1) {
            continue;
        }

        markdownContent += readFileSync(join(outputDirectory, item.name))
            // This is needed to not include the content in the wrong place
            .replaceAll(`<!-- ${marker}`, `<!-- _REPLACE_${marker}`)
            .replaceAll(`<!-- \${marker}`, `<!-- _REPLACE_\\${marker}`);
    }

    if (markdownContent === "") {
        return;
    }

    const readmeContent = readFileSync(readmePath);
    const updatedReadmeContent = replaceContentWithinMarker(readmeContent, marker, `\n${markdownContent}`);

    if (!updatedReadmeContent) {
        logger.error({
            message: `Could not find the typedoc marker: <!-- ${marker} --><!-- /${marker} --> in ${readmePath}`,
            prefix: "typedoc",
        });

        return;
    }

    if (readmeContent === updatedReadmeContent) {
        return;
    }

    writeFileSync(
        readmePath,
        updatedReadmeContent.replaceAll(`<!-- _REPLACE_${marker}`, `<!-- ${marker}`).replaceAll(`<!-- _REPLACE_\\${marker}`, `<!-- \${marker}`),
        {
            overwrite: true,
        },
    );
};

/**
 * Validates the format-specific typedoc options and emits warnings for
 * options that are ignored by the active format. Extracted to keep the
 * orchestration function within the cognitive-complexity budget.
 * @internal
 */
const validateFormatOptions = (
    format: TypeDocumentOptions["format"],
    jsonFileName: string | undefined,
    readmePath: string | undefined,
    logger: Logger,
): void => {
    if (format === "inline" && readmePath === undefined) {
        throw new Error("The `readmePath` option is required when using the `inline` format.");
    }

    if (format !== "inline" && typeof readmePath === "string") {
        logger.warn({
            message: "The `readmePath` option is only used when the `inline` format is used.",
            prefix: "typedoc",
        });
    }

    if (format === "json" && !jsonFileName?.endsWith(".json")) {
        throw new Error(
            jsonFileName === undefined
                ? "The `jsonFileName` option is required when using the `json` format."
                : "The `jsonFileName` option must end with `.json`.",
        );
    }

    if (format !== "json" && typeof jsonFileName === "string") {
        logger.warn({
            message: "The `jsonFileName` option is only used when the `json` format is used.",
            prefix: "typedoc",
        });
    }
};

const generateReferenceDocumentation = async (options: TypeDocumentOptions, entries: BuildEntry[], outputDirectory: string, logger: Logger): Promise<void> => {
    if (entries.length === 0) {
        return;
    }

    // `output` is a packem-only field and must NOT be forwarded into typedoc's
    // bootstrap options, so it is destructured purely to exclude it from the
    // `...typedocOptions` rest below.
    // eslint-disable-next-line unused-imports/no-unused-vars -- intentional rest-exclusion of a non-typedoc option
    const { format, jsonFileName, marker, output, plugin, readmePath, ...typedocOptions } = options;

    validateFormatOptions(format, jsonFileName, readmePath, logger);

    const entryPoints = entries.map((entry) => entry.input);

    const plugins = plugin ?? [];

    plugins.push("typedoc-plugin-rename-defaults");

    if (format === "inline" || format === "markdown") {
        plugins.push("typedoc-plugin-markdown");
    }

    const app = await Application.bootstrapWithPlugins(
        {
            ...typedocOptions,
            compilerOptions: {
                allowJs: true,
                declaration: false,
                declarationMap: false,
                esModuleInterop: true,
                module: 99, // "ESNext"
                moduleResolution: 100, // Bundler,
                noEmit: true,
                noImplicitAny: false,
                skipLibCheck: true,
                sourceMap: false,
                // Ensure we can parse the latest code
                target: 99, // ESNext
                ...(typedocOptions.compilerOptions as object),
            },
            entryPoints,
            hideGenerator: true,
            out: outputDirectory,
            plugin: plugins,
            ...(format === "inline" && {
                hideBreadcrumbs: true,
                hidePageHeader: true,
                navigation: false,
                outputFileStrategy: "modules",
                useCodeBlocks: true,
            }),
            // we dont need the default loader
        },
        [],
    );

    const project = await app.convert();

    if (project) {
        if (format === "json") {
            // jsonFileName is guaranteed defined here by the `format === "json"` validation above.
            await app.generateJson(project, jsonFileName as string);
        } else if (format === "html") {
            await app.generateDocs(project, outputDirectory);
        } else {
            await app.generateOutputs(project);

            if (format === "inline") {
                if (marker === undefined) {
                    throw new Error("The `marker` option is required when using the `inline` format.");
                }

                // readmePath is guaranteed defined here by the `format === "inline"` validation above.
                inlineMarkdownIntoReadme(outputDirectory, entries.length, marker, readmePath as string, logger);
            }
        }
    }
};

export default generateReferenceDocumentation;
