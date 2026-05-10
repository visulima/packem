import { cpSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { readFileSync, readJson, writeJson } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import { dirname } from "@visulima/path";
import { temporaryDirectory } from "tempy";

import { createPackemConfig, createTsConfig, execPackem, installPackage } from "./index";

export interface CreateJobOptions {
    directory: string;
}

export interface CreateJobResult {
    distDir: string;
    tempDir: string;
}

/**
 * Create a test job by copying a test directory and building it.
 */
export const createJob = async (options: CreateJobOptions): Promise<CreateJobResult> => {
    const tempDir = temporaryDirectory();
    const currentFile = fileURLToPath(import.meta.url);
    const helpersDir = dirname(currentFile);
    const sourceDir = join(helpersDir, "../..", "__fixtures__", options.directory);

    // Copy the test directory to temp
    cpSync(sourceDir, tempDir, { recursive: true });

    // Read existing package.json and add TypeScript as devDependency
    const packageJsonPath = join(tempDir, "package.json");
    const existingPackageJson = (await readJson(packageJsonPath)) as PackageJson;

    await writeJson(
        packageJsonPath,
        {
            ...existingPackageJson,
            devDependencies: {
                ...existingPackageJson.devDependencies,
                typescript: "*",
            },
        },
        { overwrite: true },
    );

    // Install dependencies and build
    await installPackage(tempDir, "typescript");
    await installPackage(tempDir, "react");
    await createTsConfig(tempDir);
    await createPackemConfig(tempDir);

    const binProcess = await execPackem("build", [], {
        cwd: tempDir,
    });

    if (binProcess.exitCode !== 0) {
        throw new Error(`Build failed: ${binProcess.stderr}`);
    }

    return {
        distDir: join(tempDir, "dist"),
        tempDir,
    };
};

/**
 * Get file names from a directory.
 */
export const getFileNamesFromDirectory = async (directory: string): Promise<string[]> => {
    const files: string[] = [];

    const walkDir = (dir: string, baseDir: string = dir): void => {
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relativePath = join(dir.replace(baseDir, ""), entry.name).replace(/^\//, "");

            if (entry.isDirectory()) {
                walkDir(fullPath, baseDir);
            } else {
                files.push(relativePath);
            }
        }
    };

    walkDir(directory);

    return files.toSorted();
};

/**
 * Get file contents from a directory as a map of filename -> content.
 */
export const getFileContents = async (directory: string): Promise<Record<string, string>> => {
    const files = await getFileNamesFromDirectory(directory);
    const contents: Record<string, string> = {};

    for (const file of files) {
        const filePath = join(directory, file);

        contents[file] = readFileSync(filePath);
    }

    return contents;
};

/**
 * Normalize a JS bundle output string so byte-exact assertions pass under both
 * rollup and rolldown. Rolldown wraps every module's emitted code in
 * `//#region <id>` / `//#endregion` comment markers and emits double-quoted
 * strings; rollup does neither. Stripping these makes structurally-equal
 * outputs compare equal between the two bundlers.
 *
 * Note: this does NOT rewrite rolldown's `var X_default = ...` synthetic
 * default-export rename — those tests must use per-test skipIf instead.
 */
export const normalizeBundleOutput = (content: string): string => {
    // Strip the region opener entirely (no replacement). Strip the closer but
    // leave a newline behind so adjacent code blocks remain separated by a
    // blank line — matching rollup's spacing between modules.
    let normalized = content
        .replaceAll(/^\/\/#region(?:\s.*)?\n/gm, "")
        .replaceAll(/^\/\/#endregion\n/gm, "\n");

    // Normalize import/export string literals from double to single quotes.
    // We only touch quoted strings on `from` / `import(...)` / `require(...)`
    // statements to avoid disturbing arbitrary string content in user code.
    normalized = normalized
        .replaceAll(/(\bfrom\s+)"([^"\n]*)"/g, "$1'$2'")
        .replaceAll(/(\bimport\()"([^"\n]*)"(\))/g, "$1'$2'$3")
        .replaceAll(/(\brequire\()"([^"\n]*)"(\))/g, "$1'$2'$3")
        .replaceAll(/(\bimport\s+)"([^"\n]*)"/g, "$1'$2'");

    // Collapse runs of 3+ blank lines (created by stripped markers) into 2.
    normalized = normalized.replaceAll(/\n{3,}/g, "\n\n");

    return normalized;
};
