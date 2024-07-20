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

/**
 * Escape the slash `\` in ESC-symbol.
 * Use it to show by an error the received ESC sequence string in console output.
 */
export const esc = (string_: string): string => string_.replaceAll("", "\\x1b");

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const execPackemSync = async (command: "build" | "init", flags: string[] = [], options: Options = {}) =>
    await execaNode(join(distributionPath, "cli.mjs"), [command, ...flags], {
        env: {
            NODE_ENV: "development",
        },
        ...options,
    });

// @TODO: Fix type
export const streamToString = async (stream: any): Promise<string> => {
    // lets have a ReadableStream as a stream variable
    const chunks = [];

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }

    return esc(Buffer.concat(chunks).toString("utf8"));
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
): Promise<void> => {
    const transformerPackageNames = {
        esbuild: "esbuild",
        sucrase: "sucrase",
        swc: "@swc/core",
    };

    await installPackage(fixturePath, transformerPackageNames[transformer]);

    writeFileSync(
        join(fixturePath, "packem.config.ts"),
        `import { defineConfig } from "${distributionPath}/config";
import transformer from "${distributionPath}/rollup/plugins/${transformer}/index";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    transformer,
    ${JSON.stringify(config, null, 4).slice(1, -1)}
});
`,
    );
};

export const createPackageJson = (fixturePAth: string, data: PackageJson): void => {
    writeJsonSync(`${fixturePAth}/package.json`, {
        ...data,
        devDependencies: {
            esbuild: "^0.23.0",
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
