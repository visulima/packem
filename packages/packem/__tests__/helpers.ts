import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureSymlink, writeFile, writeJsonSync } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import type { TsConfigJson } from "@visulima/tsconfig";
import type { Options } from "execa";
import { execaNode } from "execa";
import { expect } from "vitest";

import type { StyleOptions } from "../src/rollup/plugins/css/types";
import type { BuildConfig } from "../src/types";

const distributionPath = join(dirname(fileURLToPath(import.meta.url)), "../dist");

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
        cleanup: true,
        ...options,
    });
};

export const installPackage = async (fixturePath: string, packageName: string): Promise<void> => {
    const nodeModulesDirectory = join(fixturePath, "node_modules");

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await mkdir(nodeModulesDirectory, { recursive: true });

    await ensureSymlink(resolve("node_modules/" + packageName), join(nodeModulesDirectory, packageName));
};

export const createPackemConfig = async (
    fixturePath: string,
    config: BuildConfig | string = {},
    transformer: "esbuild" | "swc" | "sucrase" = "esbuild",
    isolatedDeclarationTransformer: "swc" | "typescript" | "oxc" | undefined = undefined,
    cssLoader: ("postcss" | "less" | "stylus" | "sass" | "sourcemap")[] = [],
    cssOptions: StyleOptions | string | undefined = undefined,
    minimizer: "cssnano" | "lightningcss" | undefined = undefined,
): Promise<void> => {
    await installPackage(fixturePath, transformer === "swc" ? "@swc" : transformer);

    await writeFile(
        join(fixturePath, "packem.config.ts"),
        `import { normalize } from "node:path";
import { defineConfig } from "${distributionPath}/config";
import transformer from "${distributionPath}/rollup/plugins/${transformer}/${transformer === "swc" ? "swc-plugin" : "index"}";
${isolatedDeclarationTransformer ? `import isolatedDeclarationTransformer from "${distributionPath}/rollup/plugins/${isolatedDeclarationTransformer}/isolated-declarations-${isolatedDeclarationTransformer}-transformer";` : ""}
${cssLoader.map((loader) => `import ${loader}Loader from "${distributionPath}/rollup/plugins/css/loaders/${loader}";`).join("\n")}
${minimizer ? `import ${minimizer} from "${distributionPath}/rollup/plugins/css/minifiers/${minimizer}";` : ""}
// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    transformer,
    ${isolatedDeclarationTransformer ? `isolatedDeclarationTransformer,` : ""}
    ${typeof config === "string" ? config : JSON.stringify(config, null, 4).slice(1, -1)}
    ${
        cssLoader.length > 0
            ? `rollup: {
    css: {
        ${typeof cssOptions === "string" ? cssOptions : typeof cssOptions === "object" ? JSON.stringify(cssOptions, null, 4).slice(1, -1) + ", " : ""}
        loaders: [${cssLoader.map((loader) => `${loader}Loader`).join(", ")}],
        ${minimizer ? `minifier: ${minimizer},` : ""}
        }
    },`
            : ""
    }
});
`,
        {
            overwrite: true,
        },
    );
};

export const createPackageJson = (fixturePAth: string, data: PackageJson, transformer: "esbuild" | "swc" | "sucrase" = "esbuild"): void => {
    writeJsonSync(
        `${fixturePAth}/package.json`,
        {
            ...data,
            devDependencies: {
                [transformer === "swc" ? "@swc/core" : transformer]: "*",
                ...data.devDependencies,
            },
        },
        {
            overwrite: true,
        },
    );
};

export const createTsConfig = (fixturePath: string, config: TsConfigJson, name = ""): void => {
    writeJsonSync(
        fixturePath + "/tsconfig" + name + ".json",
        {
            ...config,
            compilerOptions: {
                isolatedModules: true,
                ...config.compilerOptions,
            },
        } satisfies TsConfigJson,
        {
            overwrite: true,
        },
    );
};

export const assertContainFiles = (directory: string, filePaths: string[]): void => {
    const results = [];

    for (const filePath of filePaths) {
        const fullPath = resolve(directory, filePath);
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const existed = existsSync(fullPath);

        if (existed) {
            results.push(filePath);
        }
    }

    expect(results).toStrictEqual(filePaths);
};
