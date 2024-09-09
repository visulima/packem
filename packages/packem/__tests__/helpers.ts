import { mkdir, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { writeFileSync, writeJsonSync } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import type { TsConfigJson } from "@visulima/tsconfig";
import type { Options } from "execa";
import { execaNode } from "execa";

import type { BuildConfig } from "../src/types";

const distributionPath = join(dirname(fileURLToPath(import.meta.url)), "../dist");

const transformerPackageNames = {
    esbuild: "esbuild",
    sucrase: "sucrase",
    swc: "@swc/core",
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const execPackemSync = async (command: "build" | "init", flags: string[] = [], options: Options = {}) => {
    let environmentFlag: string | undefined = "--development";

    if (flags.includes("--production") || flags.includes("--development") || flags.includes("--no-environment")) {
        environmentFlag = undefined;
    }

    if (flags.includes("--no-environment")) {
        // eslint-disable-next-line no-param-reassign
        flags = flags.filter((flag) => flag !== "--no-environment");
    }

    if (!flags.includes("--validation")) {
        flags.push("--no-validation");
    }

    return await execaNode(join(distributionPath, "cli.mjs"), [command, environmentFlag, ...flags].filter(Boolean) as string[], {
        ...options,
    });
};

export const installPackage = async (fixturePath: string, packageName: string): Promise<void> => {
    const nodeModulesDirectory = join(fixturePath, "node_modules");

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await mkdir(nodeModulesDirectory, { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await symlink(resolve("node_modules/" + packageName), join(nodeModulesDirectory, packageName), "dir");
};

export const createPackemConfig = async (
    fixturePath: string,
    config: BuildConfig | BuildConfig[] = {},
    transformer: "esbuild" | "swc" | "sucrase" = "esbuild",
    isolatedDeclarationTransformer: "swc" | "typescript" | "oxc" | undefined = undefined,
): Promise<void> => {
    // eslint-disable-next-line security/detect-object-injection
    await installPackage(fixturePath, transformerPackageNames[transformer]);

    writeFileSync(
        join(fixturePath, "packem.config.ts"),
        `import { defineConfig } from "${distributionPath}/config";
import transformer from "${distributionPath}/rollup/plugins/${transformer}/index";
${isolatedDeclarationTransformer ? `import isolatedDeclarationTransformer from "${distributionPath}/rollup/plugins/${isolatedDeclarationTransformer}/isolated-declarations-${isolatedDeclarationTransformer}-transformer";` : ""}

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    transformer,
    ${isolatedDeclarationTransformer ? `isolatedDeclarationTransformer,` : ""}
    ${JSON.stringify(config, null, 4).slice(1, -1)}
});
`,
        {
            overwrite: true,
        },
    );
};

export const createPackageJson = (fixturePAth: string, data: PackageJson, transformer: "esbuild" | "swc" | "sucrase" = "esbuild"): void => {
    writeJsonSync(`${fixturePAth}/package.json`, {
        ...data,
        devDependencies: {
            // eslint-disable-next-line security/detect-object-injection
            [transformerPackageNames[transformer]]: "*",
            ...data.devDependencies,
        },
    });
};

export const createTsConfig = (fixturePath: string, config: TsConfigJson, name = ""): void => {
    writeJsonSync(fixturePath + "/tsconfig" + name + ".json", {
        ...config,
        compilerOptions: {
            isolatedModules: true,
            ...config.compilerOptions,
        },
    } satisfies TsConfigJson);
};
