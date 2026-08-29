import { cwd } from "node:process";

import { installPackage } from "@antfu/install-pkg";
import { cancel, confirm, multiselect, select, spinner } from "@clack/prompts";
import type { Cli } from "@visulima/cerebro";
import { readFile, writeFile } from "@visulima/fs";
import { parsePackageJson } from "@visulima/package/package-json";
import type { Pail } from "@visulima/pail";
import { join, resolve } from "@visulima/path";
import MagicString from "magic-string";
import { exec } from "tinyexec";

import findPackemFile from "../../config/utils/find-packem-file";
import cssLoaderDependencies from "./utils/css-loader-dependencies";

/**
 * Minimal structural logger contract used by this command.
 * `Pail` (the runtime logger) is structurally assignable to this, but its
 * intersection-with-constructor shape cannot be resolved by the typed linter,
 * so the command narrows to this precise subset of methods it actually uses.
 */
interface CommandLogger {
    debug: (...message: unknown[]) => void;
    error: (...message: unknown[]) => void;
    info: (...message: unknown[]) => void;
    success: (...message: unknown[]) => void;
    warn: (...message: unknown[]) => void;
}

const DEFINE_CONFIG_REGEXP = /defineConfig\s*\(\s*\{/;
const PRESET_REGEXP = /preset:\s*['"][^'"]+['"]/;

const typedocPackages = ["typedoc", "typedoc-plugin-markdown", "typedoc-plugin-rename-defaults"];

const reactDevDependencies = ["@babel/core", "@babel/preset-react"];
const reactDependencies = ["react", "react-dom"];

const solidDevDependencies = ["@babel/core", "babel-preset-solid"];
const solidDependencies = ["solid-js"];

const preactDevDependencies = ["@babel/core", "@babel/preset-react", "babel-plugin-transform-hook-names"];
const preactDependencies = ["preact"];

const vueDevDependencies = ["unplugin-vue"];
const vueDependencies = ["vue"];

const svelteDevDependencies = ["rollup-plugin-svelte"];
const svelteDependencies = ["svelte"];

interface AddFeatureContext {
    logger: CommandLogger;
    magic: MagicString;
    packemConfig: string;
    packemConfigFilePath: string;
    packemConfigFormat: "cjs" | "esm";
    rootDirectory: string;
    spinner: ReturnType<typeof spinner>;
    transformerReplaceKey: string;
    transformerSearchKey: string;
}

const checkPresetExists = (config: string, presetName: string, importName: string): boolean =>
    config.includes(`preset: '${presetName}'`)
    || config.includes(`preset: "${presetName}"`)
    || config.includes(`preset: '${presetName}',`)
    || config.includes(`preset: "${presetName}",`)
    || config.includes(importName)
    || config.includes(`@visulima/packem/config/preset/${presetName}`);

const insertPreset = (context: AddFeatureContext, presetName: string): void => {
    const { logger, magic, packemConfig } = context;

    const defineConfigMatch = DEFINE_CONFIG_REGEXP.exec(packemConfig);

    if (defineConfigMatch?.index !== undefined) {
        const insertIndex = defineConfigMatch.index + defineConfigMatch[0].length;

        if (packemConfig.includes("preset:")) {
            const presetMatch = PRESET_REGEXP.exec(packemConfig);

            if (presetMatch) {
                magic.replace(presetMatch[0], `preset: '${presetName}'`);
            } else {
                logger.warn(`A preset already exists in the config. Please manually set it to '${presetName}'.`);

                throw new Error("Preset exists but is not a string");
            }
        } else {
            magic.appendLeft(insertIndex, `\n    preset: '${presetName}',`);
        }
    } else if (packemConfig.includes("transformer:")) {
        magic.replace("transformer:", `preset: '${presetName}',\n    transformer:`);
    } else {
        const configStart = packemConfig.indexOf("{");

        if (configStart !== -1) {
            magic.appendLeft(configStart + 1, `\n    preset: '${presetName}',`);
        }
    }
};

const checkGitDirty = async (rootDirectory: string): Promise<boolean> => {
    try {
        const result = await exec("git", ["status", "--porcelain"], {
            nodeOptions: {
                cwd: rootDirectory,
                stdio: ["pipe", "pipe", "pipe"],
            },
        });

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tinyexec types stdout as non-nullable string, but a child process may produce no stdout at runtime, so the guard is required.
        return (result.stdout?.trim().length ?? 0) > 0;
    } catch {
        return false;
    }
};

const checkTypeScriptInstalled = async (rootDirectory: string): Promise<boolean> => {
    const packageJsonPath = join(rootDirectory, "package.json");
    const packageJson = await parsePackageJson(packageJsonPath, {
        resolveCatalogs: true,
    });

    return Boolean(packageJson.devDependencies?.typescript ?? packageJson.dependencies?.typescript);
};

const getReactTypeDependencies = async (rootDirectory: string): Promise<{ devPackages: string[]; packages: string[] }> => {
    const hasTypescript = await checkTypeScriptInstalled(rootDirectory);
    const packages: string[] = [...reactDependencies];
    const devPackages: string[] = [...reactDevDependencies];

    if (hasTypescript) {
        devPackages.push("@types/react", "@types/react-dom");
    } else {
        const isUseTypescript = (await confirm({
            initialValue: false,
            message: "Do you want to use TypeScript?",
        })) as boolean;

        if (isUseTypescript) {
            devPackages.push("typescript", "@types/react", "@types/react-dom");
        }
    }

    return { devPackages, packages };
};

const installPackages = async (context: AddFeatureContext, devPackages: string[], packages: string[]): Promise<void> => {
    const { rootDirectory, spinner: s } = context;

    s.start("Installing packages");
    await installPackage(packages, {
        cwd: rootDirectory,
        dev: false,
        silent: true,
    });
    await installPackage(devPackages, {
        cwd: rootDirectory,
        dev: true,
        silent: true,
    });
    s.stop("Installed packages");
};

const addTypedoc = async (context: AddFeatureContext): Promise<void> => {
    const { logger, magic, packemConfig, packemConfigFormat, rootDirectory, spinner: s, transformerReplaceKey, transformerSearchKey } = context;

    if (packemConfig.includes("typedoc: typedocBuilder") || packemConfig.includes("@visulima/packem/builder/typedoc")) {
        logger.warn("Typedoc has already been added to the packem config.");

        return;
    }

    if (packemConfigFormat === "cjs") {
        magic.prepend(`const typedocBuilder = require("@visulima/packem/builder/typedoc");\n`);
    } else {
        magic.prepend(`import typedocBuilder from "@visulima/packem/builder/typedoc";\n`);
    }

    if (packemConfig.includes("builder: {")) {
        magic.replace("builder: {", `builder: {\n        typedoc: typedocBuilder,\n    `);
    } else {
        magic.replace(transformerSearchKey, `${transformerReplaceKey}\n    builder: {\n        typedoc: typedocBuilder,\n    },`);
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
};

const addReact = async (context: AddFeatureContext): Promise<void> => {
    const { logger, packemConfig } = context;

    if (checkPresetExists(packemConfig, "react", "createReactPreset")) {
        logger.warn("React preset has already been added to the packem config.");

        return;
    }

    insertPreset(context, "react");

    const { devPackages, packages } = await getReactTypeDependencies(context.rootDirectory);

    logger.info("Adding React dependencies...");
    await installPackages(context, devPackages, packages);

    logger.success("\nReact preset added!");
};

const addSolid = async (context: AddFeatureContext): Promise<void> => {
    const { logger, packemConfig } = context;

    if (checkPresetExists(packemConfig, "solid", "createSolidPreset")) {
        logger.warn("Solid preset has already been added to the packem config.");

        return;
    }

    insertPreset(context, "solid");

    logger.info("Adding Solid dependencies...");
    await installPackages(context, solidDevDependencies, solidDependencies);

    logger.success("\nSolid preset added!");
};

const getPreactTypeDependencies = async (rootDirectory: string): Promise<{ devPackages: string[]; packages: string[] }> => {
    const hasTypescript = await checkTypeScriptInstalled(rootDirectory);
    const packages: string[] = [...preactDependencies];
    const devPackages: string[] = [...preactDevDependencies];

    if (hasTypescript) {
        devPackages.push("@types/preact");
    } else {
        const isUseTypescript = (await confirm({
            initialValue: false,
            message: "Do you want to use TypeScript?",
        })) as boolean;

        if (isUseTypescript) {
            devPackages.push("typescript", "@types/preact");
        }
    }

    return { devPackages, packages };
};

const addPreact = async (context: AddFeatureContext): Promise<void> => {
    const { logger, packemConfig } = context;

    if (checkPresetExists(packemConfig, "preact", "createPreactPreset")) {
        logger.warn("Preact preset has already been added to the packem config.");

        return;
    }

    insertPreset(context, "preact");

    const { devPackages, packages } = await getPreactTypeDependencies(context.rootDirectory);

    logger.info("Adding Preact dependencies...");
    await installPackages(context, devPackages, packages);

    logger.success("\nPreact preset added!");
};

const addVue = async (context: AddFeatureContext): Promise<void> => {
    const { logger, packemConfig } = context;

    if (checkPresetExists(packemConfig, "vue", "createVuePreset")) {
        logger.warn("Vue preset has already been added to the packem config.");

        return;
    }

    insertPreset(context, "vue");

    logger.info("Adding Vue dependencies...");
    await installPackages(context, vueDevDependencies, vueDependencies);

    logger.success("\nVue preset added!");
};

const addSvelte = async (context: AddFeatureContext): Promise<void> => {
    const { logger, packemConfig } = context;

    if (checkPresetExists(packemConfig, "svelte", "createSveltePreset")) {
        logger.warn("Svelte preset has already been added to the packem config.");

        return;
    }

    insertPreset(context, "svelte");

    logger.info("Adding Svelte dependencies...");
    await installPackages(context, svelteDevDependencies, svelteDependencies);

    logger.success("\nSvelte preset added!");
};

/**
 * Runs the interactive prompts that decide which CSS loaders to wire up.
 * The loader list is a plain string array because the dependency map is keyed by string.
 */
const promptCssLoaders = async (): Promise<{ cssLoaders: string[]; mainCssLoader: string }> => {
    const cssLoaders: string[] = [];

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
                extraCssLoaders = extraCssLoaders.filter((loader) => loader !== "sass");

                extraCssLoaders.push(sassLoader as keyof typeof cssLoaderDependencies);
            }
        }

        cssLoaders.push(...extraCssLoaders);
    }

    return { cssLoaders, mainCssLoader };
};

/**
 * Prompts for an optional CSS minifier and, when chosen, prepends the matching
 * import and registers the package to install. Returns the selected minifier
 * (or `undefined` when the user opts out).
 */
const promptCssMinifier = async (
    magic: MagicString,
    packemConfigFormat: "cjs" | "esm",
    cssLoaders: string[],
    packagesToInstall: string[],
): Promise<"cssnano" | "lightningcss" | undefined> => {
    const isUseCssMinifier = (await confirm({
        initialValue: false,
        message: "Do you want to minify your css?",
    })) as boolean;

    if (!isUseCssMinifier) {
        return undefined;
    }

    const cssMinifier = (await select({
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
        magic.prepend(`const ${cssMinifier as string}Minifier = require("@visulima/packem/css/minifier/${cssMinifier.toLowerCase()}");\n`);
    } else {
        magic.prepend(`import ${cssMinifier as string}Minifier from "@visulima/packem/css/minifier/${cssMinifier.toLowerCase()}";\n`);
    }

    return cssMinifier;
};

const addCss = async (context: AddFeatureContext): Promise<void> => {
    const { logger, magic, packemConfig, packemConfigFormat, transformerReplaceKey, transformerSearchKey } = context;

    if (packemConfig.includes("css: {") || packemConfig.includes("@visulima/packem/css")) {
        logger.warn("Css loaders have already been added to the packem config.");

        return;
    }

    const { cssLoaders, mainCssLoader } = await promptCssLoaders();

    const packagesToInstall: string[] = [];

    for (const loader of cssLoaders) {
        packagesToInstall.push(...cssLoaderDependencies[loader]);
    }

    if (mainCssLoader !== "tailwindcss") {
        cssLoaders.push("sourceMap");
    }

    for (const loader of cssLoaders) {
        const normalizedLoader = loader === "sass-embedded" || loader === "node-sass" ? "sass" : loader;

        if (packemConfigFormat === "cjs") {
            magic.prepend(`const ${normalizedLoader}Loader = require("@visulima/packem/css/loader/${normalizedLoader.toLowerCase()}");\n`);
        } else {
            magic.prepend(`import ${normalizedLoader}Loader from "@visulima/packem/css/loader/${normalizedLoader.toLowerCase()}";\n`);
        }
    }

    const cssMinifier = await promptCssMinifier(magic, packemConfigFormat, cssLoaders, packagesToInstall);

    const stringCssLoaders = cssLoaders
        .map((loader) => {
            if (loader === "sass-embedded" || loader === "node-sass") {
                return "sass";
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

    context.spinner.start("Installing packages");
    await installPackage(packagesToInstall, {
        cwd: context.rootDirectory,
        dev: true,
        silent: true,
    });
    context.spinner.stop("Installed packages");

    logger.success("\nCSS loaders added!");
};

const createAddCommand = (cli: Cli<Pail>): void => {
    cli.addCommand({
        argument: {
            description: "Add a packem feature to your project",
            name: "feature",
            required: true,
        },
        description: "Add a optional packem feature to your project",
        execute: async ({ argument, logger: rawLogger, options }): Promise<void> => {
            // `rawLogger` is a Pail instance; narrow it to the structural
            // subset of logger methods this command actually uses.
            const logger: CommandLogger = rawLogger as CommandLogger;
            const s = spinner();
            const rootDirectory = resolve(cwd(), typeof options.dir === "string" ? options.dir : ".");

            let packemConfigFilePath: string | undefined;

            try {
                packemConfigFilePath = await findPackemFile(rootDirectory, options.config as string | undefined);
            } catch {
                logger.error("Could not find a packem config file, please run `packem init` first.");

                return;
            }

            const isGitDirty = await checkGitDirty(rootDirectory);

            if (isGitDirty) {
                const isProceed = (await confirm({
                    initialValue: false,
                    message: "Git repository has uncommitted changes. Do you want to proceed?",
                })) as boolean;

                if (!isProceed) {
                    cancel("Operation cancelled.");

                    return;
                }
            }

            const packemConfig: string = await readFile(packemConfigFilePath, {
                buffer: false,
            });

            const packemConfigFormat = packemConfig.includes("import") ? "esm" : "cjs";
            const magic = new MagicString(packemConfig);

            const transformerReplaceKey = "  transformer,";
            const transformerSearchKey = packemConfig.includes("  transformer,") ? "  transformer," : "  transformer";

            const context: AddFeatureContext = {
                logger,
                magic,
                packemConfig,
                packemConfigFilePath,
                packemConfigFormat,
                rootDirectory,
                spinner: s,
                transformerReplaceKey,
                transformerSearchKey,
            };

            if (argument.includes("typedoc")) {
                await addTypedoc(context);
            }

            if (argument.includes("react")) {
                await addReact(context);
            }

            if (argument.includes("solid")) {
                await addSolid(context);
            }

            if (argument.includes("preact")) {
                await addPreact(context);
            }

            if (argument.includes("vue")) {
                await addVue(context);
            }

            if (argument.includes("svelte")) {
                await addSvelte(context);
            }

            if (argument.includes("css")) {
                await addCss(context);
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
