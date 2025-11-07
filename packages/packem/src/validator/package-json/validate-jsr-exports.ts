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

    // JSR.io specific: Warn if package type is not "module" (JSR.io prefers ESM)
    if (pkg.type !== "module" && pkg.type !== undefined) {
        warn(
            context,
            "JSR.io prefers packages with 'type': 'module' for better Deno compatibility. Consider using ESM format.",
        );
    }

    // Extract all export file paths from package.json
    const packageType = pkg.type === "module" ? "esm" : "cjs";
    const exportDescriptors = extractExportFilenames(
        pkg.exports,
        packageType,
        context.options.declaration,
        [],
        context.options.ignoreExportKeys || [],
    );

    // Get all built file paths (excluding chunks)
    // Build entries paths are already relative to outDir, so we need to construct the full path
    const builtFiles = new Set(
        context.buildEntries
            .filter((entry) => !entry.chunk && entry.type !== "chunk")
            .map((entry) => {
                // Entry path is relative to outDir, construct full path and get relative to rootDir
                const fullPath = resolve(context.options.rootDir, context.options.outDir, entry.path);
                const relPath = relative(context.options.rootDir, fullPath);
                // Normalize to use forward slashes for consistency
                return relPath.replace(/\\/g, "/");
            })
    );

    // Track which exports have been matched
    const matchedExports = new Set<string>();
    const unmatchedExports: Array<{ path: string; exportKey?: string }> = [];
    const invalidPaths: Array<{ path: string; exportKey?: string; reason: string }> = [];

    // Validate each export
    for (const descriptor of exportDescriptors) {
        if (descriptor.ignored) {
            continue; // Skip ignored exports
        }

        const exportPath = descriptor.file;
        const normalizedExportPath = exportPath.startsWith("./") ? exportPath : `./${exportPath}`;
        
        // Check if it's a dynamic pattern (glob)
        if (isDynamicPattern(normalizedExportPath)) {
            try {
                // Expand glob pattern
                const absolutePattern = resolve(context.options.rootDir, normalizedExportPath.slice(2));
                const matchedFiles = globSync([absolutePattern], {
                    cwd: context.options.rootDir,
                    dot: false,
                    ignore: [
                        "**/node_modules/**",
                        "**/.git/**",
                    ],
                });

                if (matchedFiles.length === 0) {
                    // No files match the pattern - validate if path pattern is valid
                    const pathExists = existsSync(resolve(context.options.rootDir, normalizedExportPath.slice(2).split("*")[0] || ""));
                    if (!pathExists) {
                        invalidPaths.push({
                            exportKey: descriptor.exportKey,
                            path: normalizedExportPath,
                            reason: "Glob pattern path does not exist",
                        });
                    }
                } else {
                    // Check if any matched files are in built files
                    const hasMatch = matchedFiles.some((file) => {
                        const relativeFile = relative(context.options.rootDir, file).replace(/\\/g, "/");
                        return builtFiles.has(relativeFile);
                    });

                    if (!hasMatch) {
                        unmatchedExports.push({
                            exportKey: descriptor.exportKey,
                            path: normalizedExportPath,
                        });
                    } else {
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
            const absolutePath = resolve(context.options.rootDir, normalizedExportPath.slice(2));
            const relativePath = relative(context.options.rootDir, absolutePath).replace(/\\/g, "/");
            
            // Check if file exists
            if (!existsSync(absolutePath)) {
                invalidPaths.push({
                    exportKey: descriptor.exportKey,
                    path: normalizedExportPath,
                    reason: "File does not exist",
                });
                continue;
            }

            // Check if it's a built file
            if (builtFiles.has(relativePath)) {
                matchedExports.add(normalizedExportPath);
                
                // JSR.io specific: Warn if using .cjs extension (JSR.io prefers ESM)
                if (normalizedExportPath.endsWith(".cjs") && pkg.type === "module") {
                    warn(
                        context,
                        `Export "${normalizedExportPath}"${descriptor.exportKey ? ` (key: ${descriptor.exportKey})` : ""} uses .cjs extension. ` +
                        `JSR.io prefers ESM format (.mjs or .js with "type": "module") for better Deno compatibility.`,
                    );
                }
            } else {
                // File exists but wasn't built - this is allowed if it's a valid path
                // Check if it's a valid file (not a directory)
                try {
                    const stats = await stat(absolutePath);
                    if (stats.isDirectory()) {
                        invalidPaths.push({
                            exportKey: descriptor.exportKey,
                            path: normalizedExportPath,
                            reason: "Path points to a directory, not a file",
                        });
                    } else {
                        // Valid extra export - file exists but wasn't built
                        // This is allowed per requirements
                        matchedExports.add(normalizedExportPath);
                        
                        // JSR.io specific: Warn if using .cjs extension
                        if (normalizedExportPath.endsWith(".cjs") && pkg.type === "module") {
                            warn(
                                context,
                                `Export "${normalizedExportPath}"${descriptor.exportKey ? ` (key: ${descriptor.exportKey})` : ""} uses .cjs extension. ` +
                                `JSR.io prefers ESM format for better Deno compatibility.`,
                            );
                        }
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
    if (unmatchedExports.length > 0 && validation.packageJson?.jsrExports !== "allow-extra") {
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

    // Check for built files that aren't exported (optional validation)
    if (validation.packageJson?.jsrExports === "strict") {
        const exportedPaths = new Set(
            exportDescriptors
                .filter((d) => !d.ignored)
                .map((d) => {
                    const path = d.file.startsWith("./") ? d.file : `./${d.file}`;
                    return resolve(context.options.rootDir, path.slice(2));
                })
        );

        const unexportedFiles = Array.from(builtFiles).filter((file) => {
            const absoluteFile = resolve(context.options.rootDir, file);
            return !exportedPaths.has(absoluteFile);
        });

        if (unexportedFiles.length > 0) {
            warn(
                context,
                `Found ${unexportedFiles.length} built file(s) that are not exported in package.json: ${unexportedFiles.slice(0, 5).join(", ")}${unexportedFiles.length > 5 ? "..." : ""}`,
            );
        }
    }

    // JSR.io specific: Check if type definitions are properly exported when declaration files are generated
    if (context.options.declaration && pkg.type === "module") {
        const hasTypesExport = exportDescriptors.some((d) => {
            if (d.ignored) {
                return false;
            }
            const path = d.file.toLowerCase();
            return path.includes(".d.ts") || path.includes(".d.mts");
        });

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
