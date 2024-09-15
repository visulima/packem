import { installPackage } from "@antfu/install-pkg";
import { cancel, confirm, intro, log, outro, select, spinner } from "@clack/prompts";
import type { Cli } from "@visulima/cerebro";
import { isAccessibleSync, writeFileSync, writeJsonSync } from "@visulima/fs";
import { parsePackageJson } from "@visulima/package/package-json";
import { join } from "@visulima/path";

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

            const packageJsonPath = join(options.dir, "package.json");

            if (!isAccessibleSync(packageJsonPath)) {
                throw new Error("No package.json found in the directory");
            }

            const packageJson = parsePackageJson(packageJsonPath);

            const packages = [];

            if (packageJson.dependencies) {
                packages.push(...Object.keys(packageJson.dependencies));
            }

            if (packageJson.devDependencies) {
                packages.push(...Object.keys(packageJson.devDependencies));
            }

            const hasTypescript = Boolean(packageJson.devDependencies?.typescript ?? packageJson.dependencies?.typescript);

            if (options.typescript === undefined && !hasTypescript) {
                // eslint-disable-next-line no-param-reassign
                options.typescript = await confirm({
                    message: "Do you want to install TypeScript?",
                });

                if (options.typescript) {
                    const s = spinner();

                    s.start("Installing typescript@latest");
                    await installPackage("typescript@latest", { cwd: options.dir, dev: true, silent: true });
                    s.stop("");
                }
            } else {
                log.message(
                    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands,no-unsafe-optional-chaining
                    "TypeScript version " + (packageJson.devDependencies?.typescript ?? packageJson.dependencies?.typescript) + " is already installed",
                );
            }

            if (!isAccessibleSync(join(options.dir, "tsconfig.json"))) {
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
                    writeJsonSync(join(options.dir, "tsconfig.json"), {
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
                    ],
                });

                if (!packages.includes(options.transformer)) {
                    const shouldInstall = await confirm({
                        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                        message: "Do you want to install " + options.transformer + "?",
                    });

                    if (shouldInstall) {
                        const s = spinner();

                        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                        s.start("Installing " + options.transformer);
                        await installPackage(options.transformer === "swc" ? "@swc/core" : options.transformer, { cwd: options.dir, dev: true, silent: true });
                        s.stop("");
                    }
                }
            } else {
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                log.message("Transformer " + options.transformer + " is already installed.");
            }

            let useIsolatedDeclarationTransformer = true;

            if (options.isolatedDeclarationTransformer === undefined) {
                useIsolatedDeclarationTransformer = (await confirm({
                    message: "Do you want to use an isolated declaration types?",
                    initialValue: false,
                })) as boolean;
            }

            if (options.isolatedDeclarationTransformer === undefined && useIsolatedDeclarationTransformer) {
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

                    if (packageName && !packages.includes(packageName)) {
                        const shouldInstall = await confirm({
                            message: "Do you want to install " + packageName + "?",
                        });

                        if (shouldInstall) {
                            const s = spinner();

                            // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                            s.start("Installing " + options.isolatedDeclarationTransformer);
                            await installPackage(packageName, { cwd: options.dir, dev: true, silent: true });
                            s.stop("");
                        }
                    }
                }
            }

            let template = "";

            if (hasTypescript || packageJson.type === "module") {
                template = `import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/${options.transformer as string}";
${!useIsolatedDeclarationTransformer || !options.isolatedDeclarationTransformer ? "" : `import isolatedDeclarationTransformer from "@visulima/packem/dts/isolated/transformer/${options.isolatedDeclarationTransformer as string}";\n`}
export default defineConfig({
    transformer${!useIsolatedDeclarationTransformer || !options.isolatedDeclarationTransformer ? "" : ",\n    isolatedDeclarationTransformer"}
});
`;
            } else {
                template = `const { defineConfig } = require("@visulima/packem/config");
const transformer = require("@visulima/packem/transformer/${options.transformer as string}");
${!useIsolatedDeclarationTransformer || !options.isolatedDeclarationTransformer ? "" : `const isolatedDeclarationTransformer = require("@visulima/packem/dts/isolated/transformer/${options.isolatedDeclarationTransformer as string}");\n`}
module.exports = defineConfig({
    transformer${!useIsolatedDeclarationTransformer || !options.isolatedDeclarationTransformer ? "" : ",\n    isolatedDeclarationTransformer"}
});
`;
            }

            const s = spinner();

            const extension = hasTypescript ? "ts" : "js";

            s.start("Creating packem.config." + extension);
            writeFileSync(join(options.dir, "packem.config." + extension), template);
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
                Description: "Use TypeScript",
                name: "typescript",
                type: Boolean,
            },
        ],
    });
};

export default createInitCommand;
