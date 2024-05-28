import { execSync } from "node:child_process";
import { mkdir, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { writeFileSync, writeJsonSync } from "@visulima/fs";
import { type PackageJson, TsConfigJson } from "@visulima/package";
import type { Options } from "execa";
import { execaNode } from "execa";
import getNode from "get-node";

import type { BuildConfig } from "../src/types";

const distributionPath = join(dirname(fileURLToPath(import.meta.url)), "../dist");

/**
 * Escape the slash `\` in ESC-symbol.
 * Use it to show by an error the received ESC sequence string in console output.
 */
export const esc = (string_: string): string => string_.replaceAll("", "\\x1b");

export const execScriptSync = (file: string, flags: string[] = [], environment: string[] = []): string => {
    const environmentVariables = environment.length > 0 ? `${environment.join(" ")} ` : "";

    let cmd = `node "${file}" ${flags.join(" ")}`;

    if (environmentVariables) {
        cmd = `${environmentVariables}${cmd}`;
    }

    const result = execSync(cmd);

    // replace last newline in result
    return result.toString().replace(/\n$/, "");
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const execPackemSync = (command: "build" | "init", flags: string[] = [], options: Options = {}) =>
    execaNode(join(distributionPath, "cli.mjs"), [command, ...flags], options);

export const getNodePathList = async (): Promise<string[][]> => {
    const supportedNode = ["18", "20"];
    const outputNodes = [];

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for await (const node of supportedNode) {
        const nodeBinary = await getNode(node);

        outputNodes.push([nodeBinary.version, nodeBinary.path]);
    }

    return outputNodes;
};

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

export const createPackemConfig = (fixturePath: string, config: BuildConfig | BuildConfig[], transformer: "esbuild" | "swc" | "sucrase" = "esbuild"): void => {
    const packemConfigPath = join(fixturePath, "packem.config.ts");

    writeFileSync(
        packemConfigPath,
        `import { defineConfig } from "${distributionPath}/dist/config";
import transformer from "${distributionPath}/dist/rollup/plugins/${transformer}";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    ${JSON.stringify(config, null, 4).slice(1, -1)},
    transformer,
});
`,
    );
};

export const createPackageJson = (fixturePAth: string, data: PackageJson): void => {
    writeJsonSync(`${fixturePAth}/package.json`, {
        devDependencies: {
            esbuild: "0.20",
        },
        ...data,
    });
};

export const createTsConfig = (fixturePath: string, config: TsConfigJson, name = ""): void => {
    writeJsonSync(`${fixturePath}/tsconfig${name}.json`, {
        ...config,
        compilerOptions: {
            isolatedModules: true,
            ...config.compilerOptions,
        },
    } satisfies TsConfigJson);
};
