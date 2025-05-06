import { cwd } from "node:process";

import { installPackage } from "@antfu/install-pkg";
import { cancel, confirm, intro, log, multiselect, outro, select, spinner } from "@clack/prompts";
import type { Cli } from "@visulima/cerebro";
import { isAccessibleSync, writeFileSync, writeJsonSync } from "@visulima/fs";
import { parsePackageJson } from "@visulima/package/package-json";
import { join, resolve } from "@visulima/path";

import cssLoaderDependencies from "./utils/css-loader-dependencies";

const createInitCommand = (cli: Cli): void => {
    cli.addCommand({
        description: "Initialize packem configuration",
        // eslint-disable-next-line sonarjs/cognitive-complexity
        execute: async ({ logger, options }): Promise<void> => {
            intro("Welcome to packem setup");

            if (isAccessibleSync(join(options.dir, "packem.config.ts"))) {
                logger.info("Packem project already initialized, you can use `packem build` to build your project");

                return;
            }

            const rootDirectory = resolve(cwd(), options.dir ?? ".");
            const packageJsonPath = join(rootDirectory, "package.json");

            if (!isAccessibleSync(packageJsonPath)) {
                throw new Error("No package.json found in the directory");
            }

            const packageJson = parsePackageJson(packageJsonPath);
            const packages: string[] = [];

            if (packageJson.dependencies) {
                packages.push(...Object.keys(packageJson.dependencies));
            }

            if (packageJson.devDependencies) {
                packages.push(...Object.keys(packageJson.devDependencies));
            }

            const hasTypescript = Boolean(packageJson.devDependencies?.typescript ?? packageJson.dependencies?.typescript);

            const packagesToInstall: string[] = [];

            if (options.typescript === undefined && !hasTypescript) {
                // eslint-disable-next-line no-param-reassign
                options.typescript = await confirm({
                    message: "Do you want to install TypeScript?",
                });

                if (options.typescript) {
                    packagesToInstall.push("typescript@latest");
                }
            } else {
                log.message(
                    // eslint-disable-next-line no-unsafe-optional-chaining
                    "TypeScript version " + (packageJson.devDependencies?.typescript ?? packageJson.dependencies?.typescript) + " is already installed",
                );
            }

            if (!isAccessibleSync(join(rootDirectory, "tsconfig.json"))) {
                const shouldGenerate = await confirm({
                    message: "Do you want to use generate a tsconfig.json?",
                });
                const runInDom = await confirm({
                    message: "Do you want to run your code in the DOM?",
                });

                if (shouldGenerate) {
                    const s = spinner();

                    s.start("Generating tsconfig.json");
                    // eslint-disable-next-line eslint-comments/disable-enable-pair
                    /* eslint-disable perfectionist/sort-objects */
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
                    s.stop("");
                }
            }

            if (options.runtime === undefined) {
                // eslint-disable-next-line no-param-reassign
                options.runtime = await select({
                    message: "Pick a build runtime",
                    options: [
                        { label: "Node", value: "node" },
                        { label: "Browser", value: "browser" },
                    ],
                });
            }

            if (packages.includes("esbuild")) {
                // eslint-disable-next-line no-param-reassign
                options.transformer = "esbuild";
            } else if (packages.includes("@swc/core")) {
                // eslint-disable-next-line no-param-reassign
                options.transformer = "swc";
            } else if (packages.includes("sucrase")) {
                // eslint-disable-next-line no-param-reassign
                options.transformer = "sucrase";
            }

            if (options.transformer === undefined) {
                // eslint-disable-next-line no-param-reassign
                options.transformer = await select({
                    message: "Pick a transformer",
                    options: [
                        { label: "esbuild", value: "esbuild" },
                        { label: "swc", value: "swc" },
                        { label: "Sucrase", value: "sucrase" },
                        { label: "OXC", value: "oxc" },
                    ],
                });

                if (options.transformer && options.transformer !== "oxc" && !packages.includes(options.transformer as string)) {
                    const shouldInstall = await confirm({
                         
                        message: "Do you want to install " + options.transformer + "?",
                    });

                    if (shouldInstall) {
                        packagesToInstall.push(options.transformer === "swc" ? "@swc/core" : options.transformer);
                    }
                }
            } else {
                 
                log.message("Transformer " + options.transformer + " is already installed.");
            }

            if (options.isolatedDeclarationTransformer === undefined) {
                // eslint-disable-next-line no-param-reassign
                options.isolatedDeclarationTransformer = (await confirm({
                    message: "Do you want to use an isolated declaration types?",
                    initialValue: false,
                })) as boolean;
            }

            if (options.isolatedDeclarationTransformer === undefined) {
                // eslint-disable-next-line no-param-reassign
                options.isolatedDeclarationTransformer = await select({
                    message: "Pick a isolated declaration transformer",
                    options: [
                        { label: "Typescript", value: "typescript" },
                        { label: "swc", value: "swc" },
                        { label: "OXC", value: "oxc" },
                        { label: "None", value: null },
                    ],
                });

                if (options.isolatedDeclarationTransformer !== null) {
                    let packageName: string | undefined;

                    switch (options.isolatedDeclarationTransformer) {
                        case "typescript": {
                            packageName = "typescript";

                            break;
                        }
                        case "swc": {
                            packageName = "@swc/core";

                            break;
                        }
                        case "oxc": {
                            packageName = "oxc-transform";

                            break;
                        }
                        default: {
                            cancel("Invalid isolated declaration transformer");
                        }
                    }

                    if (packageName !== undefined && !packages.includes(packageName as string)) {
                        const shouldInstall = await confirm({
                            message: "Do you want to install " + packageName + "?",
                        });

                        if (shouldInstall) {
                            packagesToInstall.push(packageName);
                        }
                    }
                }
            }

            if (options.css === undefined) {
                // eslint-disable-next-line no-param-reassign
                options.css = (await confirm({
                    message: "Do you want to use css in your project?",
                    initialValue: false,
                })) as boolean;
            }

            const cssLoaders: (keyof typeof cssLoaderDependencies | "sourceMap")[] = [];

            if (options.css) {
                const mainCssLoader = (await select({
                    message: "Pick a css loader",
                    options: [
                        { label: "PostCSS", value: "postcss" },
                        { hint: "experimental", label: "Lightning CSS", value: "lightningcss" },
                    ],
                })) as keyof typeof cssLoaderDependencies;

                cssLoaders.push(mainCssLoader);

                let extraCssLoaders = (await multiselect({
                    message: "Pick your loaders",
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
                            { label: "Sass embedded", value: "sass-embedded", hint: "recommended" },
                            { label: "Sass", value: "sass" },
                            { label: "Node Sass", value: "node-sass", hint: "legacy" },
                        ],
                    });

                    if (sassLoader !== "sass") {
                        extraCssLoaders = extraCssLoaders.filter((loader) => loader !== "sass");

                        extraCssLoaders.push(sassLoader as keyof typeof cssLoaderDependencies);
                    }
                }

                cssLoaders.push(...extraCssLoaders);

                const shouldInstall = await confirm({
                    message: 'Do you want to install "' + cssLoaders.join('", "') + '"?',
                });

                if (shouldInstall) {
                    for (const loader of cssLoaders) {
                        packagesToInstall.push(...(cssLoaderDependencies[loader as keyof typeof cssLoaderDependencies] as string[]));
                    }
                }

                cssLoaders.push("sourceMap");
            }

            if (options.cssMinifier === undefined) {
                // eslint-disable-next-line no-param-reassign
                options.cssMinifier = (await confirm({
                    message: "Do you want to minify your css?",
                    initialValue: false,
                })) as boolean;
            }

            let cssMinifier: "cssnano" | "lightningcss" | undefined;

            if (options.cssMinifier) {
                cssMinifier = (await select({
                    message: "Pick a css minifier",
                    options: [
                        { label: "CSSNano", value: "cssnano" },
                        { label: "Lightning CSS", value: "lightningcss" },
                    ],
                })) as "cssnano" | "lightningcss";

                if (!cssLoaders.includes("lightningcss")) {
                    const shouldInstall = await confirm({
                        message: 'Do you want to install "' + cssMinifier + '"?',
                    });

                    if (shouldInstall) {
                        packagesToInstall.push(cssMinifier);
                    }
                }
            }

            let template = "";
            let packemConfig = "";

            if (options.isolatedDeclarationTransformer) {
                packemConfig += ",\n    isolatedDeclarationTransformer";
            }

            if (options.css || options.cssMinifier) {
                packemConfig += ",\n    rollup: {\n        css: {";
            }

            if (options.css) {
                const stringCssLoaders = cssLoaders
                    .map((loader) => {
                        if (loader === "sass-embedded" || loader === "node-sass") {
                            // eslint-disable-next-line no-param-reassign
                            loader = "sass";
                        }

                        return `${loader}Loader`;
                    })
                    .join(", ");

                packemConfig += `\n            loaders: [${stringCssLoaders}],`;
            }

            if (options.cssMinifier && cssMinifier) {
                packemConfig += "\n            minifier: " + cssMinifier + "Minifier,";
            }

            if (options.css || options.cssMinifier) {
                packemConfig += "\n        }\n    }";
            }

            if (hasTypescript || packageJson.type === "module") {
                let imports = "";

                if (options.isolatedDeclarationTransformer) {
                    imports += `import isolatedDeclarationTransformer from "@visulima/packem/dts/isolated/transformer/${options.isolatedDeclarationTransformer as string}";\n`;
                }

                if (options.css) {
                    for (let loader of cssLoaders) {
                        if (loader === "sass-embedded" || loader === "node-sass") {
                            loader = "sass";
                        }

                        imports += `import ${loader as string}Loader from "@visulima/packem/css/loader/${loader.toLowerCase() as string}";\n`;
                    }
                }

                if (options.cssMinifier && cssMinifier) {
                    imports += `import ${cssMinifier as string}Minifier from "@visulima/packem/css/minifier/${cssMinifier.toLowerCase() as string}";\n`;
                }

                template = `import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/${options.transformer as string}";
${imports}
export default defineConfig({
    runtime: "${options.runtime as string}",
    transformer${packemConfig}
});
`;
            } else {
                let imports = "";

                if (options.isolatedDeclarationTransformer) {
                    imports += `const isolatedDeclarationTransformer = require("@visulima/packem/dts/isolated/transformer/${options.isolatedDeclarationTransformer as string}");\n`;
                }

                if (options.css) {
                    for (let loader of cssLoaders) {
                        if (loader === "sass-embedded" || loader === "node-sass") {
                            loader = "sass";
                        }

                        imports += `const ${loader as string}Loader = require("@visulima/packem/css/loader/${loader.toLowerCase() as string}");\n`;
                    }
                }

                if (options.cssMinifier && cssMinifier) {
                    imports += `const ${cssMinifier as string}Minifier = require("@visulima/packem/css/minifier/${cssMinifier.toLowerCase() as string}");\n`;
                }

                template = `const { defineConfig } = require("@visulima/packem/config");
const transformer = require("@visulima/packem/transformer/${options.transformer as string}");
${imports}
module.exports = defineConfig({
    runtime: ${options.runtime as string},
    transformer${packemConfig}
});
`;
            }

            const s = spinner();

            const extension = hasTypescript ? "ts" : "js";

            if (packagesToInstall.length > 0) {
                s.start("Installing packages");
                await installPackage(packagesToInstall, { cwd: rootDirectory, dev: true, silent: true });
                s.stop("Installed packages");
            }

            s.start("Creating packem.config." + extension);
            writeFileSync(join(rootDirectory, "packem.config." + extension), template);
            s.stop("Created packem.config." + extension);

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
                description: "Choose a isolated declaration transformer",
                name: "isolated-declaration-transformer",
                type: (value: unknown) => {
                    if (typeof value === "string" && ["none", "oxc", "swc", "typescript"].includes(value)) {
                        return value;
                    }

                    throw new Error("Invalid isolated declaration isolated declaration, please choose one of 'none', 'oxc', 'swc' or 'typescript'");
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
                Description: "Use TypeScript",
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
