import { cpSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { readFileSync, readJson, writeJson } from "@visulima/fs";
import { dirname } from "@visulima/path";
import { expect } from "vitest";
// eslint-disable-next-line e18e/ban-dependencies -- tempy is core test-runner infra; fs.mkdtemp migration tracked separately
import { temporaryDirectory } from "tempy";

import { createPackemConfig, createTsConfig, execPackem, installPackage } from "./index";

const LEADING_SLASH_REGEX = /^\//;

// Machine-specific absolute path leaking into rolldown's `//#region` markers for
// inlined node_modules deps, e.g. `../../home/<user>/.../packem/node_modules/.pnpm/`.
// Locally that climbs out to `…/packem/…`; on CI it is `…/runner/work/packem/packem/…`.
// Collapse the volatile prefix to a stable `<root>` token so the snapshot is portable.
const ROLLDOWN_PNPM_STORE_PATH_REGEX = /(?:\.\.\/)+\S*?\/node_modules\/\.pnpm\//g;

// Rolldown's shared-chunk filenames carry a content hash. The hash itself is
// deterministic, but for chunks that inline node_modules code it is derived from
// content that embeds the machine-specific `//#region` path above, so it shifts
// between machines/CI. Replace the 8-char hash with a fixed token so the
// reference compares equal regardless of where the bundle was produced.
const ROLLDOWN_SHARED_CHUNK_HASH_REGEX = /(packem_shared\/[\w$.-]+?-)[\w-]{8}(\.[cm]?js)/g;

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

/**
 * Normalize rolldown bundle output that embeds machine-specific or
 * non-deterministic fragments so a raw `toMatchSnapshot` stays portable across
 * machines and runs. Only active when the rolldown backend is selected; for
 * rollup (the CI-checked `.snap` gate) this is a pass-through, so wrapping an
 * assertion with it never disturbs the rollup baseline.
 */
export const normalizeRolldownOutput = (content: string): string => {
    if (process.env.PACKEM_TEST_BUNDLER !== "rolldown") {
        return content;
    }

    return content
        .replaceAll(ROLLDOWN_PNPM_STORE_PATH_REGEX, "<root>/node_modules/.pnpm/")
        .replaceAll(ROLLDOWN_SHARED_CHUNK_HASH_REGEX, "$1[HASH]$2");
};

// Advisory packem emits to stderr when a fixture imports a dependency it does not declare,
// covering both the rollup ("… but not declared in package.json") and rolldown
// ("[UNRESOLVED_IMPORT] Could not resolve …") phrasings.
export const UNDECLARED_DEPENDENCY_WARNING_REGEX = /but not declared in package\.json|ould not (?:be )?resolve/;

/**
 * Assert that no unexpected WARNING lines reached stderr. pail 4.0 routes warn-level logs to
 * stderr, and some fixtures legitimately provoke advisories (undeclared deps, config-field
 * conflicts). Pass those as `allow` regexes; every other line containing "WARNING" fails.
 */
export const expectNoUnexpectedStderrWarnings = (stderr: string, allow: RegExp[] = []): void => {
    const unexpected = stderr.split("\n").filter((line) => line.includes("WARNING") && !allow.some((regex) => regex.test(line)));

    expect(unexpected).toStrictEqual([]);
};
