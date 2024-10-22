import { cwd } from "node:process";

import { installPackage } from "@antfu/install-pkg";
import type { Cli } from "@visulima/cerebro";
import { readFile, writeFile } from "@visulima/fs";
import { resolve } from "@visulima/path";
import MagicString from "magic-string";

import findPackemFile from "../utils/find-packem-file";

const typedocPackages = ["typedoc", "typedoc-plugin-markdown", "typedoc-plugin-rename-defaults", "@ckeditor/typedoc-plugins"];

const createAddCommand = (cli: Cli): void => {
    cli.addCommand({
        argument: {
            description: "Add a packem feature to your project",
            name: "feature",
            required: true,
        },
        description: "Add a optional packem feature to your project",
        execute: async ({ argument, logger, options }): Promise<void> => {
            const rootDirectory = resolve(cwd(), options.dir ?? ".");

            const packemConfigFilePath = await findPackemFile(rootDirectory, options.config ?? "");
            const packemConfig: string = await readFile(packemConfigFilePath, { buffer: false });

            const magic = new MagicString(packemConfig);

            if (argument.includes("typedoc")) {
                if (packemConfig.includes("typedoc: typedocBuilder") || packemConfig.includes("@visulima/packem/builder/typedoc")) {
                    logger.warn("Typedoc has already been added to the packem config.");

                    return;
                }

                logger.info("Adding typedoc dependencies...");

                await installPackage(typedocPackages, { cwd: process.cwd(), dev: true, silent: true });

                magic.prepend(`import typedocBuilder from "@visulima/packem/builder/typedoc";\n`);

                // add the builder key to the packem config, if it doesn't exist
                if (packemConfig.includes("builder: {")) {
                    // add typedoc to the builder key
                    magic.replace("builder: {", `builder: {\n        typedoc: typedocBuilder,\n    `);
                } else {
                    magic.replace("transformer,", "transformer,\n    builder: {\n        typedoc: typedocBuilder,\n    },");
                }

                logger.success("Typedoc added!");
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
