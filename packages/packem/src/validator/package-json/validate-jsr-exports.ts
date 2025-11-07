import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";

import type { BuildContext } from "@visulima/packem-share/types";
import { relative, resolve } from "@visulima/path";
import { globSync, isDynamicPattern } from "tinyglobby";

import { extractExportFilenames } from "../../utils/extract-export-filenames";
import type { InternalBuildOptions, ValidationOptions } from "../../types";
import { warn } from "@visulima/packem-share/utils";

/**
 * Validates that exports in package.json match the built files for JSR.io (Deno's JavaScript Registry) compatibility.
 * Allows extra exports but validates that the file paths exist.
 * 
 * This validator ensures that package.json exports are valid for publishing to JSR.io,
 * which requires that all exported paths reference existing files.
 * 
 * JSR.io specific requirements:
 * - All exports must reference existing files
 * - Exports should use ESM format (.mjs or .js with "type": "module")
 * - Type definitions should be properly exported if declaration files are generated
 * - Relative paths are required (starting with "./")
 * 
 * @param context The build context containing validation options and build entries
 * @throws {Error} If validation fails and validation is strict
 * @see https://nodejs.org/api/packages.html#exports Official Node.js documentation for package exports
 * @see https://jsr.io/docs/publishing-packages JSR.io publishing documentation
 */
const validateJsrExports = async (context: BuildContext<InternalBuildOptions>): Promise<void> => {
    const validation = context.options.validation as ValidationOptions;
    
    // Check if JSR.io export validation is enabled
    if (validation.packageJson?.jsrExports === false) {
        return;
    }

    const { pkg } = context;
    
    if (!pkg.exports) {
        // No exports to validate
        return;
    }

    // Cache frequently used values
    const { rootDir, outDir } = context.options;
    const isModuleType = pkg.type === "module";
    const isStrictMode = validation.packageJson?.jsrExports === "strict";
    const isAllowExtraMode = validation.packageJson?.jsrExports === "allow-extra";

    // JSR.io specific: Warn if package type is not "module" (JSR.io prefers ESM)
    if (!isModuleType && pkg.type !== undefined) {
        warn(
            context,
            "JSR.io prefers packages with 'type': 'module' for better Deno compatibility. Consider using ESM format.",
        );
    }

    // Extract all export file paths from package.json
    const packageType = isModuleType ? "esm" : "cjs";
    const exportDescriptors = extractExportFilenames(
        pkg.exports,
        packageType,
        context.options.declaration,
        [],
        context.options.ignoreExportKeys || [],
    );

    // Early return if no exports to validate
    if (exportDescriptors.length === 0) {
        return;
    }

    // Get all built file paths (excluding chunks) - optimized with single pass
    // Note: buildEntries may not be populated if validator runs before build
    const builtFiles = new Set<string>();
    const hasBuildEntries = context.buildEntries.length > 0;
    
    if (hasBuildEntries) {
        // Pre-compute outDir path for built files
        const outDirPath = resolve(rootDir, outDir);
        
        for (const entry of context.buildEntries) {
            if (!entry.chunk && entry.type !== "chunk") {
                const fullPath = resolve(outDirPath, entry.path);
                const relPath = relative(rootDir, fullPath);
                // Normalize to use forward slashes for consistency
                builtFiles.add(relPath.replace(/\\/g, "/"));
            }
        }
    }

    // Track which exports have been matched
    const matchedExports = new Set<string>();
    const unmatchedExports: Array<{ path: string; exportKey?: string }> = [];
    const invalidPaths: Array<{ path: string; exportKey?: string; reason: string }> = [];

    // Helper function to check and warn about .cjs extension
    const checkCjsExtension = (path: string, exportKey?: string): void => {
        if (path.endsWith(".cjs") && isModuleType) {
            warn(
                context,
                `Export "${path}"${exportKey ? ` (key: ${exportKey})` : ""} uses .cjs extension. ` +
                `JSR.io prefers ESM format (.mjs or .js with "type": "module") for better Deno compatibility.`,
            );
        }
    };

    // Validate each export
    for (const descriptor of exportDescriptors) {
        if (descriptor.ignored) {
            continue; // Skip ignored exports
        }

        const exportPath = descriptor.file;
        const normalizedExportPath = exportPath.startsWith("./") ? exportPath : `./${exportPath}`;
        const pathWithoutPrefix = normalizedExportPath.slice(2);
        const absolutePath = resolve(rootDir, pathWithoutPrefix);
        
        // Check if it's a dynamic pattern (glob)
        if (isDynamicPattern(normalizedExportPath)) {
            try {
                // Expand glob pattern
                const matchedFiles = globSync([absolutePath], {
                    cwd: rootDir,
                    dot: false,
                    ignore: [
                        "**/node_modules/**",
                        "**/.git/**",
                    ],
                });

                if (matchedFiles.length === 0) {
                    // No files match the pattern - validate if path pattern is valid
                    const basePath = pathWithoutPrefix.split("*")[0] || "";
                    if (basePath && !existsSync(resolve(rootDir, basePath))) {
                        invalidPaths.push({
                            exportKey: descriptor.exportKey,
                            path: normalizedExportPath,
                            reason: "Glob pattern path does not exist",
                        });
                    }
                } else {
                    // Check if any matched files are in built files (only if buildEntries are available)
                    if (hasBuildEntries) {
                        let hasMatch = false;
                        for (const file of matchedFiles) {
                            const relativeFile = relative(rootDir, file).replace(/\\/g, "/");
                            if (builtFiles.has(relativeFile)) {
                                hasMatch = true;
                                break;
                            }
                        }

                        if (!hasMatch) {
                            unmatchedExports.push({
                                exportKey: descriptor.exportKey,
                                path: normalizedExportPath,
                            });
                        } else {
                            matchedExports.add(normalizedExportPath);
                        }
                    } else {
                        // buildEntries not available - just validate that glob pattern matches files
                        matchedExports.add(normalizedExportPath);
                    }
                }
            } catch (error) {
                invalidPaths.push({
                    exportKey: descriptor.exportKey,
                    path: normalizedExportPath,
                    reason: `Error validating glob pattern: ${error instanceof Error ? error.message : "Unknown error"}`,
                });
            }
        } else {
            // Regular file path
            const relativePath = relative(rootDir, absolutePath).replace(/\\/g, "/");
            
            // Check if file exists
            if (!existsSync(absolutePath)) {
                invalidPaths.push({
                    exportKey: descriptor.exportKey,
                    path: normalizedExportPath,
                    reason: "File does not exist",
                });
                continue;
            }

            // Check if it's a built file (only if buildEntries are available)
            if (hasBuildEntries && builtFiles.has(relativePath)) {
                matchedExports.add(normalizedExportPath);
                checkCjsExtension(normalizedExportPath, descriptor.exportKey);
            } else {
                // File exists - check if it's a valid file (not a directory)
                // If buildEntries are not available, we can't check if it was built,
                // but we can still validate the path exists and is valid
                try {
                    const stats = await stat(absolutePath);
                    if (stats.isDirectory()) {
                        invalidPaths.push({
                            exportKey: descriptor.exportKey,
                            path: normalizedExportPath,
                            reason: "Path points to a directory, not a file",
                        });
                    } else {
                        // Valid export - file exists
                        // If buildEntries are available and file wasn't built, track as unmatched
                        // If buildEntries are not available, we just validate the path exists
                        if (hasBuildEntries && !builtFiles.has(relativePath)) {
                            // File exists but wasn't built - track as unmatched (will warn if not allow-extra mode)
                            unmatchedExports.push({
                                exportKey: descriptor.exportKey,
                                path: normalizedExportPath,
                            });
                        } else {
                            matchedExports.add(normalizedExportPath);
                        }
                        checkCjsExtension(normalizedExportPath, descriptor.exportKey);
                    }
                } catch (error) {
                    invalidPaths.push({
                        exportKey: descriptor.exportKey,
                        path: normalizedExportPath,
                        reason: `Cannot access file: ${error instanceof Error ? error.message : "Unknown error"}`,
                    });
                }
            }
        }
    }

    // Report warnings for unmatched exports (exports that don't match built files)
    // Only warn if buildEntries are available (after build)
    if (hasBuildEntries && unmatchedExports.length > 0 && !isAllowExtraMode) {
        for (const { path, exportKey } of unmatchedExports) {
            warn(
                context,
                `Export "${path}"${exportKey ? ` (key: ${exportKey})` : ""} does not match any built files. ` +
                `Consider removing it from package.json exports or ensuring the file is built.`,
            );
        }
    }

    // Report errors for invalid paths
    if (invalidPaths.length > 0) {
        for (const { path, exportKey, reason } of invalidPaths) {
            warn(
                context,
                `Invalid export path "${path}"${exportKey ? ` (key: ${exportKey})` : ""}: ${reason}`,
            );
        }
    }

    // Check for built files that aren't exported (optional validation in strict mode)
    // Only check if buildEntries are available (after build)
    if (hasBuildEntries && isStrictMode && builtFiles.size > 0) {
        // Pre-compute exported absolute paths for efficient lookup
        const exportedPaths = new Set<string>();
        for (const d of exportDescriptors) {
            if (!d.ignored) {
                const path = d.file.startsWith("./") ? d.file : `./${d.file}`;
                exportedPaths.add(resolve(rootDir, path.slice(2)));
            }
        }

        const unexportedFiles: string[] = [];
        for (const file of builtFiles) {
            const absoluteFile = resolve(rootDir, file);
            if (!exportedPaths.has(absoluteFile)) {
                unexportedFiles.push(file);
            }
        }

        if (unexportedFiles.length > 0) {
            const preview = unexportedFiles.slice(0, 5).join(", ");
            const suffix = unexportedFiles.length > 5 ? "..." : "";
            warn(
                context,
                `Found ${unexportedFiles.length} built file(s) that are not exported in package.json: ${preview}${suffix}`,
            );
        }
    }

    // JSR.io specific: Check if type definitions are properly exported when declaration files are generated
    if (context.options.declaration && isModuleType) {
        // Early exit optimization - check if any export has types
        let hasTypesExport = false;
        for (const d of exportDescriptors) {
            if (!d.ignored) {
                const path = d.file.toLowerCase();
                if (path.includes(".d.ts") || path.includes(".d.mts")) {
                    hasTypesExport = true;
                    break;
                }
            }
        }

        if (!hasTypesExport) {
            warn(
                context,
                "TypeScript declaration files are being generated, but no 'types' condition is found in exports. " +
                "JSR.io recommends exporting type definitions using the 'types' condition for better TypeScript support.",
            );
        }
    }
};

export default validateJsrExports;
