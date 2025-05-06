import { readdirSync } from "node:fs";

import { readFileSync, writeFileSync } from "@visulima/fs";
import type { Pail } from "@visulima/pail";
import { join } from "@visulima/path";
import { Application } from "typedoc";

import type { BuildEntry, TypeDocumentOptions } from "../../types";
import replaceContentWithinMarker from "../../utils/replace-content-within-marker";

// eslint-disable-next-line sonarjs/cognitive-complexity
const generateReferenceDocumentation = async (options: TypeDocumentOptions, entries: BuildEntry[], outputDirectory: string, logger: Pail): Promise<void> => {
    if (entries.length === 0) {
        return;
    }

    const { format, jsonFileName, marker, output, plugin, readmePath, ...typedocOptions } = options;

    if (format === "inline" && readmePath === undefined) {
        throw new Error("The `readmePath` option is required when using the `inline` format.");
    }

    if (format !== "inline" && typeof readmePath === "string") {
        logger.warn({
            message: "The `readmePath` option is only used when the `inline` format is used.",
            prefix: "typedoc",
        });
    }

    if (format === "json") {
        if (jsonFileName === undefined) {
            throw new Error("The `jsonFileName` option is required when using the `json` format.");
        } else if (!jsonFileName.endsWith(".json")) {
            throw new Error("The `jsonFileName` option must end with `.json`.");
        }
    }

    if (format !== "json" && typeof jsonFileName === "string") {
        logger.warn({
            message: "The `jsonFileName` option is only used when the `json` format is used.",
            prefix: "typedoc",
        });
    }

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
            ...(format === "inline"
                ? {
                      hideBreadcrumbs: true,
                      hidePageHeader: true,
                      navigation: false,
                      outputFileStrategy: "modules",
                      useCodeBlocks: true,
                  }
                : {}),
            // we dont need the default loader
        },
        [],
    );

    const project = await app.convert();

    if (project) {
        if (format === "json") {
            await app.generateJson(project, jsonFileName as string);
        } else if (format === "html") {
            await app.generateDocs(project, outputDirectory);
        } else {
            await app.generateOutputs(project);

            if (format === "inline") {
                if (marker === undefined) {
                    throw new Error("The `marker` option is required when using the `inline` format.");
                }

                // eslint-disable-next-line security/detect-non-literal-fs-filename
                const markdownPathsList = readdirSync(outputDirectory, {
                    withFileTypes: true,
                }).filter((item) => item.isFile());

                let markdownContent = "";

                for (const item of markdownPathsList) {
                    if (item.name === "README.md" && entries.length > 1) {
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    markdownContent += (readFileSync(join(outputDirectory, item.name)) as unknown as string)
                        // This is needed to not include the content in the wrong place
                        .replaceAll(`<!-- ${marker}`, `<!-- _REPLACE_${marker}`)
                        .replaceAll(`<!-- \${marker}`, `<!-- _REPLACE_\\${marker}`);
                }

                if (markdownContent !== "") {
                    const readmeContent = readFileSync(readmePath as string) as unknown as string;
                    const updatedReadmeContent = replaceContentWithinMarker(readmeContent, marker, "\n" + markdownContent);

                    if (!updatedReadmeContent) {
                        logger.error({
                            message: `Could not find the typedoc marker: <!-- ${marker} --><!-- /${marker} --> in ${readmePath as string}`,
                            prefix: "typedoc",
                        });

                        return;
                    }

                    if (readmeContent === updatedReadmeContent) {
                        return;
                    }

                    if (updatedReadmeContent) {
                        writeFileSync(
                            readmePath as string,
                            updatedReadmeContent
                                .replaceAll(`<!-- _REPLACE_${marker}`, `<!-- ${marker}`)
                                .replaceAll(`<!-- _REPLACE_\\${marker}`, `<!-- \${marker}`),
                            {
                                overwrite: true,
                            },
                        );
                    }
                }
            }
        }
    }
};

export default generateReferenceDocumentation;
