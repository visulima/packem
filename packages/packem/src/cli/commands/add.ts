import { cwd } from "node:process";

import { installPackage } from "@antfu/install-pkg";
import { confirm, multiselect, select, spinner } from "@clack/prompts";
import type { Cli } from "@visulima/cerebro";
import { readFile, writeFile } from "@visulima/fs";
import { resolve } from "@visulima/path";
import MagicString from "magic-string";

import findPackemFile from "../../config/utils/find-packem-file";
import cssLoaderDependencies from "./utils/css-loader-dependencies";

const typedocPackages = [
    "typedoc",
    "typedoc-plugin-markdown",
    "typedoc-plugin-rename-defaults",
];

const createAddCommand = (cli: Cli): void => {
    cli.addCommand({
        argument: {
            description: "Add a packem feature to your project",
            name: "feature",
            required: true,
        },
        description: "Add a optional packem feature to your project",
        // eslint-disable-next-line sonarjs/cognitive-complexity
        execute: async ({ argument, logger, options }): Promise<void> => {
            const s = spinner();

            const rootDirectory = resolve(cwd(), options.dir ?? ".");

            let packemConfigFilePath: string | undefined;

            try {
                packemConfigFilePath = await findPackemFile(
                    rootDirectory,
                    options.config,
                );
            } catch {
                // @TODO: Add a sub command run question to run `packem init` if the user wants to
                logger.error(
                    "Could not find a packem config file, please run `packem init` first.",
                );

                return;
            }

            const packemConfig: string = await readFile(packemConfigFilePath, {
                buffer: false,
            });

            let packemConfigFormat = "cjs";

            if (packemConfig.includes("import")) {
                packemConfigFormat = "esm";
            }

            const magic = new MagicString(packemConfig);

            const transformerReplaceKey = "  transformer,";
            let transformerSearchKey = "  transformer";

            if (packemConfig.includes("  transformer,")) {
                transformerSearchKey = "  transformer,";
            }

            if (argument.includes("typedoc")) {
                if (
                    packemConfig.includes("typedoc: typedocBuilder")
                    || packemConfig.includes("@visulima/packem/builder/typedoc")
                ) {
                    logger.warn(
                        "Typedoc has already been added to the packem config.",
                    );

                    return;
                }

                if (packemConfigFormat === "cjs") {
                    magic.prepend(
                        `const typedocBuilder = require("@visulima/packem/builder/typedoc");\n`,
                    );
                } else {
                    magic.prepend(
                        `import typedocBuilder from "@visulima/packem/builder/typedoc";\n`,
                    );
                }

                // add the builder key to the packem config, if it doesn't exist
                if (packemConfig.includes("builder: {")) {
                    // add typedoc to the builder key
                    magic.replace(
                        "builder: {",
                        `builder: {\n        typedoc: typedocBuilder,\n    `,
                    );
                } else {
                    magic.replace(
                        transformerSearchKey,
                        `${transformerReplaceKey}\n    builder: {\n        typedoc: typedocBuilder,\n    },`,
                    );
                }

                logger.info("Adding typedoc dependencies...");

                s.start("Installing packages");
                await installPackage(typedocPackages, {
                    cwd: rootDirectory,
                    dev: true,
                    silent: true,
                });
                s.stop("Installed packages");

                logger.success("\nTypedoc added!");
            }

            if (argument.includes("css")) {
                if (
                    packemConfig.includes("css: {")
                    || packemConfig.includes("@visulima/packem/css")
                ) {
                    logger.warn(
                        "Css loaders have already been added to the packem config.",
                    );

                    return;
                }

                const cssLoaders: (
                    | keyof typeof cssLoaderDependencies
                    | "sourceMap"
                )[] = [];

                const mainCssLoader = (await select({
                    message: "Pick a css loader",
                    options: [
                        { label: "PostCSS", value: "postcss" },
                        {
                            hint: "experimental",
                            label: "Lightning CSS",
                            value: "lightningcss",
                        },
                        {
                            hint: "Tailwind Css Oxide",
                            label: "Tailwind CSS",
                            value: "tailwindcss",
                        },
                    ],
                })) as keyof typeof cssLoaderDependencies;

                cssLoaders.push(mainCssLoader);

                if (mainCssLoader !== "tailwindcss") {
                    let extraCssLoaders = (await multiselect({
                        message: "Pick extra loaders",
                        options: [
                            { label: "Sass", value: "sass" },
                            { label: "Stylus", value: "stylus" },
                            { label: "Less", value: "less" },
                        ],
                        required: false,
                    })) as (keyof typeof cssLoaderDependencies)[];

                    if (extraCssLoaders.includes("sass")) {
                        const sassLoader = await select({
                            message: "Pick a sass loader",
                            options: [
                                {
                                    hint: "recommended",
                                    label: "Sass embedded",
                                    value: "sass-embedded",
                                },
                                { label: "Sass", value: "sass" },
                                {
                                    hint: "legacy",
                                    label: "Node Sass",
                                    value: "node-sass",
                                },
                            ],
                        });

                        if (sassLoader !== "sass") {
                            extraCssLoaders = extraCssLoaders.filter(
                                (loader) => loader !== "sass",
                            );

                            extraCssLoaders.push(
                                sassLoader as keyof typeof cssLoaderDependencies,
                            );
                        }
                    }

                    cssLoaders.push(...extraCssLoaders);
                }

                const packagesToInstall: string[] = [];

                for (const loader of cssLoaders) {
                    packagesToInstall.push(
                        ...(cssLoaderDependencies[
                            loader as keyof typeof cssLoaderDependencies
                        ] as string[]),
                    );
                }

                if (mainCssLoader !== "tailwindcss") {
                    cssLoaders.push("sourceMap");
                }

                for (let loader of cssLoaders) {
                    if (loader === "sass-embedded" || loader === "node-sass") {
                        // eslint-disable-next-line sonarjs/updated-loop-counter
                        loader = "sass";
                    }

                    if (packemConfigFormat === "cjs") {
                        magic.prepend(
                            `const ${loader as string}Loader = require("@visulima/packem/css/loader/${loader.toLowerCase() as string}");\n`,
                        );
                    } else {
                        magic.prepend(
                            `import ${loader as string}Loader from "@visulima/packem/css/loader/${loader.toLowerCase() as string}";\n`,
                        );
                    }
                }

                const useCssMinifier = (await confirm({
                    initialValue: false,
                    message: "Do you want to minify your css?",
                })) as boolean;

                let cssMinifier: "cssnano" | "lightningcss" | undefined;

                if (useCssMinifier) {
                    cssMinifier = (await select({
                        message: "Pick a css minifier",
                        options: [
                            { label: "CSSNano", value: "cssnano" },
                            { label: "Lightning CSS", value: "lightningcss" },
                        ],
                    })) as "cssnano" | "lightningcss";

                    if (!cssLoaders.includes("lightningcss")) {
                        packagesToInstall.push(cssMinifier);
                    }

                    if (packemConfigFormat === "cjs") {
                        magic.prepend(
                            `const ${cssMinifier as string}Minifier = require("@visulima/packem/css/minifier/${cssMinifier.toLowerCase() as string}");\n`,
                        );
                    } else {
                        magic.prepend(
                            `import ${cssMinifier as string}Minifier from "@visulima/packem/css/minifier/${cssMinifier.toLowerCase() as string}";\n`,
                        );
                    }
                }

                const stringCssLoaders = cssLoaders
                    .map((loader) => {
                        if (
                            loader === "sass-embedded"
                            || loader === "node-sass"
                        ) {
                            // eslint-disable-next-line no-param-reassign
                            loader = "sass";
                        }

                        return `${loader}Loader`;
                    })
                    .join(", ");

                if (packemConfig.includes("rollup: {")) {
                    magic.replace(
                        "rollup: {",
                        `rollup: {\n        css: {${cssMinifier ? `\n            minifier: ${cssMinifier as string}Minifier,` : ""}\n            loaders: [${stringCssLoaders}],\n        },\n`,
                    );
                } else {
                    magic.replace(
                        transformerSearchKey,
                        `${
                            transformerReplaceKey
                        }\n    rollup: {\n        css: {${cssMinifier ? `\n            minifier: ${cssMinifier as string}Minifier,` : ""}\n            loaders: [${stringCssLoaders}],\n        },\n    },`,
                    );
                }

                s.start("Installing packages");
                await installPackage(packagesToInstall, {
                    cwd: rootDirectory,
                    dev: true,
                    silent: true,
                });
                s.stop("Installed packages");

                logger.success("\nCSS loaders added!");
            }

            await writeFile(packemConfigFilePath, magic.toString(), {
                overwrite: true,
            });
        },
        name: "add",
        options: [
            {
                defaultValue: ".",
                description: "The directory to build",
                name: "dir",
                type: String,
            },
            {
                description: "Use a custom config file",
                name: "config",
                type: String,
            },
        ],
    });
};

export default createAddCommand;
