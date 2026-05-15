import { cpSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { readFileSync, readJson, writeJson } from "@visulima/fs";
import { dirname } from "@visulima/path";
// eslint-disable-next-line e18e/ban-dependencies -- tempy is core test-runner infra; fs.mkdtemp migration tracked separately
import { temporaryDirectory } from "tempy";

import { createPackemConfig, createTsConfig, execPackem, installPackage } from "./index";

const LEADING_SLASH_REGEX = /^\//;

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
    const temporaryDirectoryPath = temporaryDirectory();
    const currentFile = fileURLToPath(import.meta.url);
    const helpersDirectory = dirname(currentFile);
    const sourceDirectory = join(helpersDirectory, "../..", "__fixtures__", options.directory);

    // Copy the test directory to temp
    cpSync(sourceDirectory, temporaryDirectoryPath, { recursive: true });

    // Read existing package.json and add TypeScript as devDependency
    const packageJsonPath = join(temporaryDirectoryPath, "package.json");
    const existingPackageJson = await readJson<{ devDependencies?: Record<string, string> }>(packageJsonPath);

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
    await installPackage(temporaryDirectoryPath, "typescript");
    await installPackage(temporaryDirectoryPath, "react");
    await createTsConfig(temporaryDirectoryPath);
    await createPackemConfig(temporaryDirectoryPath);

    const binProcess = await execPackem("build", [], {
        cwd: temporaryDirectoryPath,
    });

    if (binProcess.exitCode !== 0) {
        throw new Error(`Build failed: ${String(binProcess.stderr)}`);
    }

    return {
        distDir: join(temporaryDirectoryPath, "dist"),
        tempDir: temporaryDirectoryPath,
    };
};

/**
 * Get file names from a directory.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- async signature is part of the public helper API; callers await this and sibling get-file-names-from-directory.ts shares the contract
export const getFileNamesFromDirectory = async (directory: string): Promise<string[]> => {
    const files: string[] = [];

    const walkDirectory = (currentDirectory: string, baseDirectory: string = currentDirectory): void => {
        const entries = readdirSync(currentDirectory, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(currentDirectory, entry.name);
            const relativePath = join(currentDirectory.replace(baseDirectory, ""), entry.name).replace(LEADING_SLASH_REGEX, "");

            if (entry.isDirectory()) {
                walkDirectory(fullPath, baseDirectory);
            } else {
                files.push(relativePath);
            }
        }
    };

    walkDirectory(directory);

    return files.toSorted((a, b) => a.localeCompare(b));
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
 * `//#region &lt;id&gt;` / `//#endregion` comment markers and emits double-quoted
 * strings; rollup does neither. Stripping these makes structurally-equal
 * outputs compare equal between the two bundlers.
 *
 * Note: this does NOT rewrite rolldown's `var X_default = ...` synthetic
 * default-export rename — those tests must use per-test skipIf instead.
 */
export const normalizeBundleOutput = (content: string): string => {
    // Strip the region opener and closer markers rolldown emits around each
    // module body. The closer leaves a blank line so adjacent modules stay
    // separated — matching rollup's per-module spacing. When the opener is
    // directly preceded by a hoisted `import` statement (no blank between
    // them), insert a blank too: rolldown packs the import flush against the
    // user-code region, but rollup naturally separates them.
    let normalized = content
        .replaceAll(/^(import\s.*;\n)\/\/#region(?:\s.*)?\n/gm, "$1\n")
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

    // Normalize top-of-line directive prologues (e.g. `"use client";`) from
    // double to single quotes. Rolldown preserves the source's quote style;
    // rollup rewrites them to single. The two are semantically identical.
    normalized = normalized.replaceAll(/^"(use [^"\n]+)";/gm, "'$1';");

    // Collapse runs of 3+ blank lines (created by stripped markers) into 2.
    normalized = normalized.replaceAll(/\n{3,}/g, "\n\n");

    return normalized;
};
