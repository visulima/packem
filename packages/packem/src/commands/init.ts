import { installPackage } from "@antfu/install-pkg";
import { cancel, confirm, intro, isCancel, outro, select, spinner } from "@clack/prompts";
import type { Cli } from "@visulima/cerebro";
import { isAccessibleSync, writeFileSync } from "@visulima/fs";
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

            if (isCancel(options.transformer)) {
                cancel("Operation cancelled");

                return;
            }

            if (options.transformer === undefined) {
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
            }

            const template = `import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/${options.transformer as string}";

export default defineConfig({
    transformer
});
`;

            const s = spinner();

            s.start("Creating packem.config.ts");
            writeFileSync(join(options.dir, "packem.config.ts"), template);
            s.stop("Created packem.config.ts");

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
                description: "Choose a transformer to use for packem",
                name: "transformer",
                type: String,
            },
        ],
    });
};

export default createInitCommand;
