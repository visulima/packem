import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureSymlink, writeFile, writeJson } from "@visulima/fs";
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

export type PackemConfigProperties = {
    config?: BuildConfig | string | undefined;
    cssLoader?: ("postcss" | "less" | "stylus" | "sass" | "sourcemap" | "lightningcss")[];
    cssOptions?: StyleOptions | string | undefined;
    isolatedDeclarationTransformer?: "swc" | "typescript" | "oxc" | undefined;
    minimizer?: "cssnano" | "lightningcss" | undefined;
    plugins?: {
        code: string;
        from?: string;
        importName?: string;
        namedExport?: boolean;
        when: "after" | "before";
    }[];
    transformer?: "esbuild" | "swc" | "sucrase";
};

export const createPackemConfig = async (
    fixturePath: string,
    {
        config = undefined,
        cssLoader = [],
        cssOptions = undefined,
        isolatedDeclarationTransformer = undefined,
        minimizer = undefined,
        plugins = [],
        transformer = "esbuild",
    }: PackemConfigProperties = {},
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<void> => {
    await installPackage(fixturePath, transformer === "swc" ? "@swc" : transformer);

    let rollupConfig = "";

    if (typeof config === "object" || cssLoader.length > 0 || plugins.length > 0) {
        rollupConfig = "\n    rollup: {\n";
    }

    if (config === undefined) {
        // eslint-disable-next-line no-param-reassign
        config = "";
    } else if (typeof config === "object") {
        const { rollup, ...rest } = config;

        if (rollup?.css && cssLoader.length > 0) {
            throw new Error("Cannot use both `rollup.css` and `cssLoader` options in the same configuration");
        }

        if (rollup) {
            rollupConfig += JSON.stringify(rollup, null, 4).slice(1, -1) + ",\n";
        }

        if (typeof rest === "object") {
            // eslint-disable-next-line no-param-reassign
            config = JSON.stringify(rest, null, 4).slice(1, -1);

            if (config !== "") {
                // eslint-disable-next-line no-param-reassign
                config += ",";
            }
        }
    }

    if (cssLoader.length > 0) {
        rollupConfig += `        css: {\n        loaders: [${cssLoader.map((loader) => `${loader}Loader`).join(", ")}],${minimizer ? `\n        minifier: ${minimizer},` : ""}${typeof cssOptions === "string" ? cssOptions : typeof cssOptions === "object" ? JSON.stringify(cssOptions, null, 4).slice(1, -1) : ""}
    },`;
    }

    const pluginImports: string[] = [];
    const pluginCode: string[] = [];

    for (const plugin of plugins) {
        if (plugin.namedExport !== undefined && plugin.importName && plugin.from) {
            pluginImports.push(
                `import ${plugin.namedExport ? "{" + plugin.importName + "}" : plugin.importName} from "${plugin.from.replace("__dist__", distributionPath)}";`,
            );
        }

        pluginCode.push(`{ ${plugin.when}: "packem:${transformer}", plugin: ${plugin.code}, }`);
    }

    if (pluginCode.length > 0) {
        rollupConfig += `\n    plugins: [\n        ${pluginCode.join(",\n")}\n    ],`;
    }

    if (rollupConfig !== "") {
        rollupConfig += "\n},";
    }

    await writeFile(
        join(fixturePath, "packem.config.ts"),
        `import { normalize } from "node:path";
import { defineConfig } from "${distributionPath}/config";
import transformer from "${distributionPath}/rollup/plugins/${transformer}/${transformer === "swc" ? "swc-plugin" : "index"}";
${isolatedDeclarationTransformer ? `import isolatedDeclarationTransformer from "${distributionPath}/rollup/plugins/${isolatedDeclarationTransformer}/isolated-declarations-${isolatedDeclarationTransformer}-transformer";` : ""}
${cssLoader.map((loader) => `import ${loader}Loader from "${distributionPath}/rollup/plugins/css/loaders/${loader}";`).join("\n")}
${minimizer ? `import ${minimizer} from "${distributionPath}/rollup/plugins/css/minifiers/${minimizer}";` : ""}
${pluginImports.join("\n")}
// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    transformer,${isolatedDeclarationTransformer ? `\nisolatedDeclarationTransformer,` : ""}${config as string}${rollupConfig}
});
`,
        {
            overwrite: true,
        },
    );
};

export const createPackageJson = async (fixturePAth: string, data: PackageJson, transformer: "esbuild" | "swc" | "sucrase" = "esbuild"): Promise<void> => {
    await writeJson(
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

export const createTsConfig = async (fixturePath: string, config: TsConfigJson = {}, name = ""): Promise<void> => {
    await writeJson(
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
