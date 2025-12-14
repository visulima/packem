import fs from "node:fs/promises";
import path from "node:path/posix";

import { isAccessibleSync } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import {
    DEFAULT_EXTENSIONS,
    DEVELOPMENT_ENV,
    ENDING_REGEX,
    PRODUCTION_ENV,
    RUNTIME_EXPORT_CONVENTIONS,
    SPECIAL_EXPORT_CONVENTIONS,
} from "@visulima/packem-share/constants";
import type { BuildContext } from "@visulima/packem-share/types";
import { extname, resolve, toNamespacedPath } from "@visulima/path";

import type { BuildEntry, Environment, InferEntriesResult, InternalBuildOptions, Runtime } from "../../../types";
import type { OutputDescriptor } from "../../../utils/extract-export-filenames";
import { extractExportFilenames } from "../../../utils/extract-export-filenames";
import { inferExportTypeFromFileName } from "../../../utils/infer-export-type";

// Cache directory scans to avoid scanning same directory multiple times
// Key: search path, Value: promise resolving to file list
const directoryCache = new Map<string, Promise<string[]>>();
const extensionPattern = /\.[^./]+$/;

const safeReaddir = async (searchPath: string) => {
    try {
        return await fs.readdir(searchPath, { withFileTypes: true });
    } catch (error) {
        // Directory doesn't exist - can happen when package.json exports reference
        // source directories that don't exist yet (e.g., optional wildcard patterns)
        const { code } = error as NodeJS.ErrnoException;

        if (code === "ENOENT") {
            return [];
        }

        throw error;
    }
};

const getDirectoryFilesRecursive = async (searchPath: string, basePath: string): Promise<string[]> => {
    const entries = await safeReaddir(searchPath);
    const files = await Promise.all(
        entries.map(async (entry) => {
            const fullPath = path.join(searchPath, entry.name);

            if (entry.isDirectory()) {
                return getDirectoryFilesRecursive(fullPath, basePath);
            }

            if (entry.isFile()) {
                return path.relative(basePath, fullPath);
            }

            return [];
        }),
    );

    return files.flat();
};

/**
 * Recursively list all file paths in a directory (with caching)
 * @param searchPath Directory to search in (expected to use forward slashes)
 * @returns Array of relative file paths with forward slashes (e.g., ["foo.js", "bar/baz.js"])
 */
const getDirectoryFiles = async (searchPath: string): Promise<string[]> => {
    let filesPromise = directoryCache.get(searchPath);

    if (!filesPromise) {
        filesPromise = getDirectoryFilesRecursive(searchPath, searchPath);
        directoryCache.set(searchPath, filesPromise);
    }

    return filesPromise;
};

/**
 * Match a file path against a wildcard pattern and return captured values
 * @param filePath File path to match (e.g., "foo/bar.ts")
 * @param pattern Wildcard pattern (e.g., "*")
 * @returns Array of captured wildcard values, or undefined if no match
 */
const matchWildcardPattern = (filePath: string, pattern: string): string[] | undefined => {
    // Remove extension from file path for matching
    const pathWithoutExtension = filePath.replace(extensionPattern, "");

    // Convert wildcard pattern to regex
    // Handle special case for "*" pattern
    if (pattern === "*") {
        // For pattern "*", capture the first segment
        const segments = pathWithoutExtension.split("/");

        if (segments.length > 0 && segments[0]) {
            return [segments[0]]; // Return the first segment
        }

        return undefined;
    }

    // For other patterns, convert to regex
    const regexPattern = pattern
        .replaceAll(/[.+?^${}()|[\]\\]/g, String.raw`\$&`) // Escape regex special chars
        .replaceAll("*", "(.*)"); // Convert * to capture group (allow multi-segment)

    const regex = new RegExp(`^${regexPattern}$`);
    const match = pathWithoutExtension.match(regex);

    return match ? match.slice(1) : undefined; // Return captured groups, excluding full match
};

/**
 * Substitute wildcard captures into a pattern
 * @param pattern Pattern with wildcards
 * @param captures Captured values from matchWildcardPattern
 * @returns Pattern with wildcards replaced
 */
const substituteWildcards = (pattern: string, captures: string[]): string => {
    let result = pattern;

    for (const capture of captures) {
        result = result.replace("*", capture);
    }

    return result;
};

const getEnvironment = (output: OutputDescriptor, environment: Environment): Environment => {
    if (output.key === "exports" && output.subKey === PRODUCTION_ENV) {
        return PRODUCTION_ENV as Environment;
    }

    if (output.key === "exports" && output.subKey === DEVELOPMENT_ENV) {
        return DEVELOPMENT_ENV as Environment;
    }

    return environment;
};

/**
 * Detects file naming patterns from output filename (e.g., ".browser", ".server", ".development")
 * @param outputFile Output file path (e.g., "./dist/index.browser.js")
 * @returns Object with detected pattern and base filename, or null if no pattern detected
 */
const detectFilePattern = (outputFile: string): { pattern: string; baseName: string } | undefined => {
    // Remove dist directory and extension from output file
    const outputWithoutDist = outputFile.replace(/^\.\/dist\//, "").replace(/^dist\//, "");
    const outputBase = outputWithoutDist.replace(/\.[^./]+$/, "");

    // Extract directory and filename
    const parts = outputBase.split("/");
    const filename = parts[parts.length - 1] || "";

    // Check if filename contains common patterns
    const commonPatterns = [".browser", ".server", ".development", ".production", ".node", ".workerd"];

    for (const pattern of commonPatterns) {
        if (filename.includes(pattern)) {
            const baseName = filename.replace(pattern, "");
            const directory = parts.length > 1 ? parts.slice(0, -1).join("/") : "";

            return {
                baseName: directory ? `${directory}/${baseName}` : baseName,
                pattern,
            };
        }
    }

    // Check for other patterns (e.g., index.something.js where something is not a known pattern)
    // This handles cases like index.custom.js
    const filenameParts = filename.split(".");

    if (filenameParts.length > 2) {
        // Has pattern: filename.pattern.ext -> filename.ext
        const baseName = filenameParts.slice(0, -2).join(".");
        const pattern = `.${filenameParts[filenameParts.length - 2]}`;
        const directory = parts.length > 1 ? parts.slice(0, -1).join("/") : "";

        return {
            baseName: directory ? `${directory}/${baseName}` : baseName,
            pattern,
        };
    }

    return undefined;
};

/**
 * Tries to find a source file matching a pattern (e.g., index.browser.tsx for index.browser.js)
 * @param sourceFiles List of available source files
 * @param baseName Base filename without extension (e.g., "index" or "src/index")
 * @param pattern Pattern to match (e.g., ".browser")
 * @param sourceDir Source directory path
 * @returns Found file path or null
 */
const tryFindPatternFile = (
    sourceFiles: string[],
    baseName: string,
    pattern: string,
    sourceDir: string,
): string | undefined => {
    // Normalize baseName - remove sourceDir prefix if present
    const normalizedBase = baseName.replace(new RegExp(`^${sourceDir}/?`), "");

    // Try to find files matching the pattern with various extensions
    const patternName = `${normalizedBase}${pattern}`;
    const escapedPattern = patternName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patternRegex = new RegExp(`${escapedPattern}\\.([cm]?[tj]sx?|ts|js)$`);

    // Look for exact matches - check if file path ends with pattern name + extension
    const exactMatch = sourceFiles.find((file) => {
        const relativePath = file.replace(sourceDir, "").replace(/^\//, "");

        return patternRegex.test(relativePath);
    });

    if (exactMatch) {
        return exactMatch;
    }

    // Also try matching by base path (handles subdirectories)
    const fullPatternPath = `${sourceDir}/${patternName}`;
    const fullMatch = sourceFiles.find((file) => {
        const fileBase = file.replace(/\.[^./]+$/, "");

        return fileBase === fullPatternPath || fileBase.endsWith(`/${patternName}`);
    });

    return fullMatch || undefined;
};

const createOrUpdateEntry = (
    entries: BuildEntry[],
    input: string,
    isDirectory: boolean,
    outputSlug: string,
    output: OutputDescriptor,
    context: BuildContext<InternalBuildOptions>,
    isGlob: boolean,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): void => {
    const entryEnvironment = getEnvironment(output, context.environment);

    let runtime: Runtime = context.options.runtime as Runtime;

    // Check for browser condition first (highest priority)
    // Check export key (subKey) for browser condition
    const isBrowserFromExportKey = output.subKey === "browser" || output.subKey?.includes("browser");
    // Check output file for .browser pattern
    const isBrowserFromFile = output.file.includes(".browser");

    if (isBrowserFromExportKey || isBrowserFromFile) {
        runtime = "browser";
    } else {
        // Check for other runtime conventions
        for (const runtimeExportConvention of RUNTIME_EXPORT_CONVENTIONS) {
            if (output.file.includes(`.${runtimeExportConvention}.`) || output.subKey === runtimeExportConvention) {
                runtime = runtimeExportConvention as Runtime;

                break;
            }
        }

        // Check for node/workerd conditions
        if (output.subKey === "node" || output.subKey === "workerd" || output.file.includes(".node") || output.file.includes(".workerd") || output.file.includes(".server")) {
            runtime = "node";
        }
    }

    // Calculate aliasName first to use in uniqueness check
    const aliasName = output.file.replace(extname(output.file), "").replace(new RegExp(`^./${context.options.outDir.replace(/^\.\//, "")}/`), "");

    // Check if input file matches the alias (if not, we need fileAlias)
    const inputBase = input.replace(/\.[^./]+$/, "").split("/").pop() || "";
    const aliasBase = aliasName.split("/").pop() || "";
    const needsFileAlias = !input.includes(aliasName) && inputBase !== aliasBase;

    // Include fileAlias in uniqueness check to ensure separate entries for same input with different outputs
    let entry: BuildEntry | undefined = entries.find(
        (index) =>
            index.input === input &&
            index.environment === entryEnvironment &&
            index.runtime === runtime &&
            index.fileAlias === (needsFileAlias ? aliasName : undefined),
    );

    if (entry === undefined) {
        entry = entries[
            entries.push({
                environment: entryEnvironment,
                exportKey: new Set([output.exportKey].filter(Boolean)),
                fileAlias: needsFileAlias ? aliasName : undefined,
                input,
                runtime,
            }) - 1
        ] as BuildEntry;
    } else if (entry.exportKey && output.exportKey) {
        entry.exportKey.add(output.exportKey);
    }

    if (isGlob) {
        entry.isGlob = true;
    }

    if (isDirectory) {
        entry.outDir = outputSlug;
    }

    if (output.isExecutable) {
        entry.executable = true;

        entry.declaration = false;

        if (output.type === "cjs") {
            entry.cjs = true;
        } else if (output.type === "esm") {
            entry.esm = true;
        }
    } else {
        if (/\.d\.[mc]?ts$/.test(output.file) && context.options.declaration !== false) {
            entry.declaration = context.options.declaration;
        }

        if (output.type === "cjs") {
            entry.cjs = true;
        } else if (output.type === "esm") {
            entry.esm = true;
        }
    }

    // Set fileAlias if needed (for any export condition producing different output filename)
    // This includes SPECIAL_EXPORT_CONVENTIONS and pattern-based outputs (e.g., .browser, .server)
    if (needsFileAlias && !entry.fileAlias) {
        entry.fileAlias = aliasName;
    }
};

let privateSubfolderWarningShown = false;

const validateIfTypescriptIsInstalled = (context: BuildContext<InternalBuildOptions>): void => {
    if (context.pkg?.dependencies?.typescript === undefined && context.pkg?.devDependencies?.typescript === undefined) {
        // @TODO: Add command to install typescript
        throw new Error("You tried to use a `.ts`, `.cts` or `.mts` file but `typescript` was not found in your package.json.");
    }
};

/**
 * Infer entries from package files.
 * @param packageJson
 * @param sourceFiles A list of source files to use for inferring entries.
 * @param context
 * @returns
 */
const inferEntries = async (
    packageJson: PackageJson,
    sourceFiles: string[],
    context: BuildContext<InternalBuildOptions>,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<InferEntriesResult> => {
    const hasRootTypes = packageJson.types || packageJson.typings;

    // Clear directory cache to ensure fresh results for each test run
    directoryCache.clear();

    const cjsJSExtension = (context.options.outputExtensionMap?.cjs ?? "cjs").replaceAll(".", String.raw`\.`);
    const esmJSExtension = (context.options.outputExtensionMap?.esm ?? "mjs").replaceAll(".", String.raw`\.`);

    const warnings: string[] = [];

    // Sort files so least-nested files are first
    sourceFiles.sort((a, b) => a.split("/").length - b.split("/").length);

    const packageType = packageJson.type === "module" ? "esm" : "cjs";

    if (packageType === "esm") {
        context.options.emitESM = true;
    }

    if (packageType === "cjs") {
        context.options.emitCJS = true;
    }

    const isDualFormat = context.options.emitCJS && context.options.emitESM;

    if (context.options.declaration === undefined) {
        context.options.declaration = isDualFormat ? "compatible" : "node16";
    }

    // Come up with a list of all output files & their formats
    const allOutputs = extractExportFilenames(
        packageJson.exports,
        packageType,
        context.options.declaration,
        [],
        context.options.ignoreExportKeys ?? [],
    );

    // Filter out ignored outputs
    const outputs = allOutputs.filter((output) => !output.ignored);

    // Check outputs to see if both ESM and CJS formats are present (dual format)
    // This handles cases where package.json has "type": "module" but exports has both "import" and "require"
    const hasESMOutput = outputs.some((output) => output.type === "esm");
    const hasCJSOutput = outputs.some((output) => output.type === "cjs");

    if (hasESMOutput && hasCJSOutput) {
        context.options.emitESM = true;
        context.options.emitCJS = true;
    } else if (hasESMOutput) {
        context.options.emitESM = true;
    } else if (hasCJSOutput) {
        context.options.emitCJS = true;
    }

    if (packageJson.bin) {
        const binaries = (typeof packageJson.bin === "string" ? [packageJson.bin] : Object.values(packageJson.bin)).filter(Boolean);

        for (const file of binaries) {
            const inferredType = inferExportTypeFromFileName(file);

            if (inferredType && inferredType !== packageType) {
                throw new Error(`Exported file "${file}" has an extension that does not match the package.json type "${packageJson.type ?? "commonjs"}".`);
            }

            outputs.push({
                file: file as string,
                isExecutable: true,
                key: "bin",
                type: inferredType ?? packageType,
            });
        }
    }

    if (packageJson.main) {
        outputs.push({
            file: packageJson.main,
            key: "main",
            type: inferExportTypeFromFileName(packageJson.main) ?? packageType,
        });
    }

    // Defacto module entry-point for bundlers (not Node.js)
    // https://github.com/dherman/defense-of-dot-js/blob/master/proposal.md
    if (packageJson.module) {
        outputs.push({ file: packageJson.module, key: "module", type: "esm" });
    }

    // Entry point for TypeScript
    if (hasRootTypes) {
        validateIfTypescriptIsInstalled(context);

        if ((context.options.declaration === undefined || context.options.declaration === "node16") && isDualFormat) {
            context.options.declaration = "compatible";
        }

        outputs.push({
            file: (packageJson.types ?? packageJson.typings) as string,
            key: "types",
        });
    }

    // Infer entries from package files
    const entries: BuildEntry[] = [];

    for await (const output of outputs) {
        const outputExtension = extname(output.file);

        // Only javascript files are supported
        if (outputExtension !== "" && !DEFAULT_EXTENSIONS.includes(outputExtension)) {
            continue;
        }

        if (context.options.emitCJS === undefined && output.type === "cjs") {
            context.options.emitCJS = true;
        }

        if (context.options.emitESM === undefined && output.type === "esm") {
            context.options.emitESM = true;
        }

        if (context.options.declaration === undefined || context.options.declaration === "node16") {
            const isDualFormat = context.options.emitCJS && context.options.emitESM;

            context.options.declaration = isDualFormat ? "compatible" : "node16";
        }

        // Supported output file extensions are `.d.ts`, `.d.cts`, `.d.mts`, `.js`, `.cjs` and `.mjs`
        // But we support any file extension here in case user has extended rollup options
        const outputSlug = output.file.replace(
            new RegExp(String.raw`(?:\*[^/\\]|\.d\.[mc]?ts|\.\w+|${[String.raw`\.${cjsJSExtension}`, String.raw`\.${esmJSExtension}`].join("|")})$`),
            "",
        );

        const isDirectory = outputSlug.endsWith("/");

        // Skip top level directory
        if (isDirectory && ["./", "/"].includes(outputSlug)) {
            continue;
        }

        const sourceSlug = outputSlug.replace(new RegExp(`(./)?${context.options.outDir}`), context.options.sourceDir).replace("./", "");

        const beforeSourceRegex = "(?<=/|$)";
        const fileExtensionRegex = isDirectory
            ? ""
            : String.raw`(\.d\.[cm]?ts|(\.[cm]?[tj]sx?)|${[String.raw`\.${cjsJSExtension}`, String.raw`\.${esmJSExtension}`].join("|")})$`;

        // @see https://nodejs.org/docs/latest-v16.x/api/packages.html#subpath-patterns
        if ((output.file.includes("/*") || outputSlug.includes("*")) && output.key === "exports") {
            if (!privateSubfolderWarningShown) {
                context.logger.debug("Private subfolders are not supported, if you need this feature please open an issue on GitHub.");

                privateSubfolderWarningShown = true;
            }

            // Determine input pattern from export key or file
            // For string exports like "./dist/runtime/*", extract pattern by removing dist prefix
            // For object exports like {"./*": "./dist/*"}, use exportKey
            let inputPattern: string;

            if (output.exportKey) {
                inputPattern = output.exportKey.startsWith("./") ? output.exportKey.slice(2) : output.exportKey;
            } else {
                // For string exports, try to derive input pattern from output pattern
                const outputPath = output.file.startsWith("./") ? output.file.slice(2) : output.file;

                // Remove common build directory prefixes like "dist/"
                inputPattern = outputPath.replace(/^dist\//, "");
            }

            // Determine output pattern from file
            const outputPattern = output.file; // e.g., "./dist/*/*.mjs"

            // Find source files that match the input pattern
            const sourceDirectoryRelative = context.options.sourceDir.replace(/^\.\//, "");
            const sourceDirectoryPath = resolve(context.options.rootDir, sourceDirectoryRelative);
            const matchingInputs: { input: string; output: string }[] = [];

            // Get all source files recursively
            const allSourceFiles = await getDirectoryFiles(sourceDirectoryPath);

            // For wildcard exports, scan all source files in the source directory
            for (const relativeFilePath of allSourceFiles) {
                // Check if this file matches the input pattern
                const wildcardMatch = matchWildcardPattern(relativeFilePath, inputPattern);

                if (wildcardMatch) {
                    // Generate output path by substituting wildcards
                    const outputPath = substituteWildcards(outputPattern, wildcardMatch);

                    matchingInputs.push({
                        input: resolve(sourceDirectoryPath, relativeFilePath),
                        output: outputPath,
                    });
                }
            }

            if (matchingInputs.length === 0) {
                warnings.push(`Could not find entrypoints matching pattern \`${inputPattern}\` for output \`${outputPattern}\``);
                continue;
            }

            // Create entries for each match
            for (const { input, output: outputPath } of matchingInputs) {
                // Create a modified output descriptor with the specific output path
                const specificOutput = { ...output, file: outputPath };

                createOrUpdateEntry(entries, input, isDirectory, outputSlug, specificOutput, context, true);
            }

            continue;
        }

        const SOURCE_RE = new RegExp(beforeSourceRegex + sourceSlug + fileExtensionRegex);

        let input = sourceFiles.find((index) => SOURCE_RE.test(index));

        // If not found, try to detect file pattern and find pattern-specific file
        if (input === undefined) {
            const sourceDirectoryRelative = context.options.sourceDir.replace(/^\.\//, "");
            const sourceDirectoryPath = resolve(context.options.rootDir, sourceDirectoryRelative);

            // Detect if output file has a pattern (e.g., index.browser.js)
            const patternResult = detectFilePattern(output.file);

            if (patternResult) {
                // Try to find pattern-specific file (e.g., index.browser.tsx)
                const patternFile = tryFindPatternFile(sourceFiles, patternResult.baseName, patternResult.pattern, sourceDirectoryPath);

                if (patternFile) {
                    input = patternFile;
                } else {
                    // Fall back to base file (e.g., index.tsx), fileAlias will be set in createOrUpdateEntry
                    const baseSourceSlug = patternResult.baseName;
                    const BASE_SOURCE_RE = new RegExp(beforeSourceRegex + baseSourceSlug + fileExtensionRegex);

                    input = sourceFiles.find((index) => BASE_SOURCE_RE.test(index));
                }
            } else {
                // Fallback: Try SPECIAL_EXPORT_CONVENTIONS pattern matching
                const sourceSlugWithoutExtension = sourceSlug.replace(/^(.+?)\.[^.]*$/, "$1").replace(/\/$/, "");

                if (SPECIAL_EXPORT_CONVENTIONS.has(output.subKey as string)) {
                    const SPECIAL_SOURCE_RE = new RegExp(beforeSourceRegex + sourceSlugWithoutExtension + fileExtensionRegex);

                    input = sourceFiles.find((index) => SPECIAL_SOURCE_RE.test(index));
                }
            }
        }

        if (input === undefined) {
            if (!isAccessibleSync(resolve(context.options.rootDir, output.file))) {
                warnings.push(`Could not find entrypoint for \`${output.file}\``);
            }

            continue;
        }

        if (isAccessibleSync(input) && /\.[cm]?tsx?$/.test(input)) {
            validateIfTypescriptIsInstalled(context);
        }

        const inputWithoutExtension = toNamespacedPath(input.replace(ENDING_REGEX, ""));

        if (isAccessibleSync(`${inputWithoutExtension}.cts`) && isAccessibleSync(`${inputWithoutExtension}.mts`)) {
            createOrUpdateEntry(entries, `${inputWithoutExtension}.cts`, isDirectory, outputSlug, { ...output, type: "cjs" }, context, false);
            createOrUpdateEntry(entries, `${inputWithoutExtension}.mts`, isDirectory, outputSlug, { ...output, type: "esm" }, context, false);
        } else {
            createOrUpdateEntry(entries, input, isDirectory, outputSlug, output, context, false);
        }
    }

    return { entries, warnings };
};

export default inferEntries;
