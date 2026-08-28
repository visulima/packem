import { cwd } from "node:process";

import { installPackage } from "@antfu/install-pkg";
import { confirm, intro, log, multiselect, outro, select, spinner } from "@clack/prompts";
import type { Cli } from "@visulima/cerebro";
import { isAccessibleSync, writeFileSync, writeJsonSync } from "@visulima/fs";
import { parsePackageJson } from "@visulima/package/package-json";
import type { Pail } from "@visulima/pail";
import { join, resolve } from "@visulima/path";

import cssLoaderDependencies from "./utils/css-loader-dependencies";

type CssMinifier = "cssnano" | "lightningcss" | undefined;

interface InitOptions {
    css?: boolean;
    cssMinifier?: boolean;
    dir?: string;
    runtime?: string;
    transformer?: string;
    typescript?: boolean;
}

interface InitLogger {
    info: (message: string) => void;
}

const normalizeCssLoaderName = (loader: string): string => {
    if (loader === "sass-embedded" || loader === "node-sass") {
        return "sass";
    }

    return loader;
};

const writeTsconfig = (rootDirectory: string, runInDom: boolean): void => {
    /* eslint-disable perfectionist/sort-objects -- tsconfig key order is intentionally human-meaningful, not alphabetical. */
    writeJsonSync(join(rootDirectory, "tsconfig.json"), {
        compilerOptions: {
            esModuleInterop: true,
            skipLibCheck: true,
            target: "es2022",
            allowJs: true,
            resolveJsonModule: true,
            moduleDetection: "force",
            isolatedModules: true,
            verbatimModuleSyntax: true,
            strict: true,
            noUncheckedIndexedAccess: true,
            noImplicitOverride: true,
            module: "NodeNext",
            outDir: "dist",
            sourceMap: true,
            declaration: true,
            lib: runInDom ? ["es2022", "dom", "dom.iterable"] : ["es2022"],
        },
    });
    /* eslint-enable perfectionist/sort-objects -- end tsconfig literal. */
};

const buildCssImports = (cssEnabled: boolean, cssLoaders: string[], cssMinifier: CssMinifier, cssMinifierEnabled: boolean, useEsm: boolean): string => {
    let imports = "";

    if (cssEnabled) {
        for (const loader of cssLoaders) {
            const name = normalizeCssLoaderName(loader);

            imports += useEsm
                ? `import ${name}Loader from "@visulima/packem/css/loader/${name.toLowerCase()}";\n`
                : `const ${name}Loader = require("@visulima/packem/css/loader/${name.toLowerCase()}");\n`;
        }
    }

    if (cssMinifierEnabled && cssMinifier) {
        imports += useEsm
            ? `import ${cssMinifier}Minifier from "@visulima/packem/css/minifier/${cssMinifier.toLowerCase()}";\n`
            : `const ${cssMinifier}Minifier = require("@visulima/packem/css/minifier/${cssMinifier.toLowerCase()}");\n`;
    }

    return imports;
};

const buildCssConfigBlock = (cssEnabled: boolean, cssMinifier: CssMinifier, cssMinifierEnabled: boolean, cssLoaders: string[]): string => {
    if (!cssEnabled && !cssMinifierEnabled) {
        return "";
    }

    let block = ",\n    rollup: {\n        css: {";

    if (cssEnabled) {
        const stringCssLoaders = cssLoaders.map((loader) => `${normalizeCssLoaderName(loader)}Loader`).join(", ");

        block += `\n            loaders: [${stringCssLoaders}],`;
    }

    if (cssMinifierEnabled && cssMinifier) {
        block += `\n            minifier: ${cssMinifier}Minifier,`;
    }

    block += "\n        }\n    }";

    return block;
};

const buildConfigTemplate = (useEsm: boolean, transformer: string, runtime: string, imports: string, packemConfig: string): string => {
    if (useEsm) {
        return `import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/${transformer}";
${imports}
export default defineConfig({
    runtime: "${runtime}",
    transformer${packemConfig}
});
`;
    }

    return `const { defineConfig } = require("@visulima/packem/config");
const transformer = require("@visulima/packem/transformer/${transformer}");
${imports}
module.exports = defineConfig({
    runtime: ${runtime},
    transformer${packemConfig}
});
`;
};

const collectPackageNames = (packageJson: { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> }): string[] => {
    const packages: string[] = [];

    if (packageJson.dependencies) {
        packages.push(...Object.keys(packageJson.dependencies));
    }

    if (packageJson.devDependencies) {
        packages.push(...Object.keys(packageJson.devDependencies));
    }

    return packages;
};

const setupTypescript = async (
    typescriptOption: boolean | undefined,
    hasTypescript: boolean,
    packageJson: { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> },
    packagesToInstall: string[],
): Promise<boolean | undefined> => {
    if (typescriptOption === undefined && !hasTypescript) {
        const shouldInstall = (await confirm({
            message: "Do you want to install TypeScript?",
        })) as boolean;

        if (shouldInstall) {
            packagesToInstall.push("typescript@latest");
        }

        return shouldInstall;
    }

    const typescriptVersion = (packageJson.devDependencies?.typescript ?? packageJson.dependencies?.typescript ?? "unknown") as string;

    log.message(`TypeScript version ${typescriptVersion} is already installed`);

    return typescriptOption;
};

const resolveTransformer = async (transformerOption: string | undefined, packages: string[], packagesToInstall: string[]): Promise<string> => {
    let transformer = transformerOption;

    if (packages.includes("esbuild")) {
        transformer = "esbuild";
    } else if (packages.includes("@swc/core")) {
        transformer = "swc";
    } else if (packages.includes("sucrase")) {
        transformer = "sucrase";
    }

    if (transformer !== undefined) {
        log.message(`Transformer ${transformer} is already installed.`);

        return transformer;
    }

    transformer = (await select({
        message: "Pick a transformer",
        options: [
            { label: "esbuild", value: "esbuild" },
            { label: "swc", value: "swc" },
            { label: "Sucrase", value: "sucrase" },
            { label: "OXC", value: "oxc" },
        ],
    })) as string;

    if (transformer && transformer !== "oxc" && !packages.includes(transformer)) {
        const shouldInstall = await confirm({
            message: `Do you want to install ${transformer}?`,
        });

        if (shouldInstall) {
            packagesToInstall.push(transformer === "swc" ? "@swc/core" : transformer);
        }
    }

    return transformer;
};

const maybeGenerateTsconfig = async (rootDirectory: string): Promise<void> => {
    if (isAccessibleSync(join(rootDirectory, "tsconfig.json"))) {
        return;
    }

    const shouldGenerate = await confirm({
        message: "Do you want to use generate a tsconfig.json?",
    });
    const runInDom = await confirm({
        message: "Do you want to run your code in the DOM?",
    });

    if (shouldGenerate) {
        const s = spinner();

        s.start("Generating tsconfig.json");

        writeTsconfig(rootDirectory, Boolean(runInDom));

        s.stop("");
    }
};

const resolveSassLoader = async (extraCssLoaders: string[]): Promise<string[]> => {
    if (!extraCssLoaders.includes("sass")) {
        return extraCssLoaders;
    }

    const sassLoader = (await select({
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
    })) as string;

    if (sassLoader === "sass") {
        return extraCssLoaders;
    }

    return [...extraCssLoaders.filter((loader) => loader !== "sass"), sassLoader];
};

const selectCssLoaders = async (packagesToInstall: string[]): Promise<string[]> => {
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
        ],
    })) as string;

    cssLoaders.push(mainCssLoader);

    const extraCssLoaders = (await multiselect({
        message: "Pick your loaders",
        options: [
            { label: "Sass", value: "sass" },
            { label: "Stylus", value: "stylus" },
            { label: "Less", value: "less" },
        ],
        required: false,
    })) as string[];

    const resolvedExtraLoaders = await resolveSassLoader(extraCssLoaders);

    cssLoaders.push(...resolvedExtraLoaders);

    const shouldInstall = await confirm({
        message: `Do you want to install "${cssLoaders.join('", "')}"?`,
    });

    if (shouldInstall) {
        for (const loader of cssLoaders) {
            packagesToInstall.push(...cssLoaderDependencies[loader]);
        }
    }

    cssLoaders.push("sourceMap");

    return cssLoaders;
};

const selectCssMinifier = async (cssLoaders: string[], packagesToInstall: string[]): Promise<CssMinifier> => {
    const cssMinifier = (await select({
        message: "Pick a css minifier",
        options: [
            { label: "CSSNano", value: "cssnano" },
            { label: "Lightning CSS", value: "lightningcss" },
        ],
    })) as "cssnano" | "lightningcss";

    if (!cssLoaders.includes("lightningcss")) {
        const shouldInstall = await confirm({
            message: `Do you want to install "${cssMinifier}"?`,
        });

        if (shouldInstall) {
            packagesToInstall.push(cssMinifier);
        }
    }

    return cssMinifier;
};

const createInitCommand = (cli: Cli<Pail>): void => {
    cli.addCommand({
        description: "Initialize packem configuration",

        execute: async ({ logger: rawLogger, options: rawOptions }): Promise<void> => {
            const options = rawOptions as InitOptions;
            const logger = rawLogger as InitLogger;

            intro("Welcome to packem setup");

            if (isAccessibleSync(join(options.dir ?? ".", "packem.config.ts"))) {
                logger.info("Packem project already initialized, you can use `packem build` to build your project");

                return;
            }

            const rootDirectory = resolve(cwd(), options.dir ?? ".");
            const packageJsonPath = join(rootDirectory, "package.json");

            if (!isAccessibleSync(packageJsonPath)) {
                throw new Error("No package.json found in the directory");
            }

            const packageJson = await parsePackageJson(packageJsonPath, {
                resolveCatalogs: true,
            });
            const packages = collectPackageNames(packageJson);

            const hasTypescript = Boolean(packageJson.devDependencies?.typescript ?? packageJson.dependencies?.typescript);

            const packagesToInstall: string[] = [];

            options.typescript = await setupTypescript(options.typescript, hasTypescript, packageJson, packagesToInstall);

            await maybeGenerateTsconfig(rootDirectory);

            options.runtime ??= (await select({
                message: "Pick a build runtime",
                options: [
                    { label: "Node", value: "node" },
                    { label: "Browser", value: "browser" },
                ],
            })) as string;

            options.transformer = await resolveTransformer(options.transformer, packages, packagesToInstall);

            options.css ??= (await confirm({
                initialValue: false,
                message: "Do you want to use css in your project?",
            })) as boolean;

            const cssLoaders: string[] = options.css ? await selectCssLoaders(packagesToInstall) : [];

            options.cssMinifier ??= (await confirm({
                initialValue: false,
                message: "Do you want to minify your css?",
            })) as boolean;

            const cssMinifier: CssMinifier = options.cssMinifier ? await selectCssMinifier(cssLoaders, packagesToInstall) : undefined;

            const cssEnabled = options.css ?? false;
            const cssMinifierEnabled = options.cssMinifier ?? false;
            const useEsm = hasTypescript || packageJson.type === "module";

            const packemConfig = buildCssConfigBlock(cssEnabled, cssMinifier, cssMinifierEnabled, cssLoaders);
            const imports = buildCssImports(cssEnabled, cssLoaders, cssMinifier, cssMinifierEnabled, useEsm);
            const template = buildConfigTemplate(useEsm, options.transformer ?? "", options.runtime ?? "", imports, packemConfig);

            const s = spinner();

            const extension = hasTypescript ? "ts" : "js";

            if (packagesToInstall.length > 0) {
                s.start("Installing packages");
                await installPackage(packagesToInstall, {
                    cwd: rootDirectory,
                    dev: true,
                    silent: true,
                });
                s.stop("Installed packages");
            }

            s.start(`Creating packem.config.${extension}`);
            writeFileSync(join(rootDirectory, `packem.config.${extension}`), template);
            s.stop(`Created packem.config.${extension}`);

            outro("Now you can run `packem build` to build your project");
        },
        name: "init",
        options: [
            {
                defaultValue: ".",
                description: "The directory to initialize",
                name: "dir",
                type: String,
            },
            {
                description: "Choose a transformer",
                name: "transformer",
                type: (value: unknown) => {
                    if (typeof value === "string" && ["esbuild", "sucrase", "swc"].includes(value)) {
                        return value;
                    }

                    throw new Error("Invalid transformer, please choose one of 'swc', 'sucrase' or 'esbuild'");
                },
            },
            {
                description: "Use CSS",
                name: "css",
                type: Boolean,
            },
            {
                description: "Use CSS minifier",
                name: "css-minifier",
                type: Boolean,
            },
            {
                description: "Use TypeScript",
                name: "typescript",
                type: Boolean,
            },
            {
                // defaultValue: "browser",
                description: "Specify the build runtime (nodejs, browser).",
                name: "runtime",
                type: (input: string) => {
                    if (input === "node" || input === "browser") {
                        return input;
                    }

                    throw new Error("Invalid runtime. Use 'node' or 'browser'.");
                },
            },
        ],
    });
};

export default createInitCommand;
