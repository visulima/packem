import { copyFile } from "node:fs/promises";

import { ensureDir, isAccessible } from "@visulima/fs";
import { basename, dirname, extname, join, resolve } from "@visulima/path";
import type { Plugin } from "rollup";

const PREFIX = "\0natives:";

export interface NativeModulesOptions {
    /**
     * Custom subdirectory name for native modules within the output directory
     * @default 'natives'
     */
    nativesDirectory?: string;
}

/**
 * Handles native Node.js addons (.node files)
 * - Stage 1 (resolve/load): Identifies .node files and generates runtime code.
 * - Stage 2 (generateBundle): Copies the identified .node files to the output dir.
 */
export const nativeModulesPlugin = (config: NativeModulesOptions = {}): Plugin => {
    const { nativesDirectory = "natives" } = config;
    // Map<original_path, final_destination_path>
    const modulesToCopy = new Map<string, string>();
    let distributionDirectory: string | undefined;

    return {
        buildStart() {
            modulesToCopy.clear();
        },

        generateBundle: async (options) => {
            // Try to get output directory from generateBundle options if not set yet
            if (!distributionDirectory) {
                const output = Array.isArray(options) ? options[0] : options;

                if (output && output.dir) {
                    distributionDirectory = output.dir;
                } else if (output && output.file) {
                    distributionDirectory = dirname(output.file);
                }
            }

            if (modulesToCopy.size === 0) {
                return;
            }

            if (!distributionDirectory) {
                this.error("Output directory not detected. Please ensure Rollup output options are configured.");

                return undefined;
            }

            const nativeLibsDirectory = join(distributionDirectory, nativesDirectory);

            await ensureDir(nativeLibsDirectory);

            // Copy all staged files in parallel.
            await Promise.all(
                [...modulesToCopy.entries()].map(([source, outputName]) => {
                    const destination = join(nativeLibsDirectory, outputName);

                    return copyFile(source, destination);
                }),
            );
        },

        load(id) {
            if (!id.startsWith(PREFIX)) {
                return undefined;
            }

            const originalPath = id.slice(PREFIX.length);
            const outputName = modulesToCopy.get(originalPath);

            if (!outputName) {
                // Should not happen if resolveId ran correctly
                this.error(`Could not find staged native module for: ${originalPath}`);
            }

            // If distributionDirectory is not set yet, try to get it from this context
            if (!distributionDirectory) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rollupContext = this as any;

                if (rollupContext && rollupContext.meta && rollupContext.meta.rollupVersion) {
                    // We're in a rollup context, but output dir might not be available yet
                    // Return a placeholder that will be resolved later
                    return `export default require("./${nativesDirectory}/${outputName}");`;
                }

                this.error("Output directory not detected. Please ensure Rollup output options are configured.");
            }

            // Generate the require path relative to the final bundle directory
            const relativePath = `./${nativesDirectory}/${outputName}`;

            return `export default require("${relativePath.replaceAll("\\", "/")}");`;
        },

        name: "native-modules",

        options(options) {
            // Extract output directory from Rollup options
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const options_ = options as any;

            if (options_.output) {
                const output = Array.isArray(options_.output) ? options_.output[0] : options_.output;

                if (output.dir) {
                    distributionDirectory = output.dir;
                } else if (output.file) {
                    distributionDirectory = dirname(output.file);
                }
            }

            return options;
        },

        async resolveId(source, importer) {
            if (source.startsWith(PREFIX) || !source.endsWith(".node")) {
                return undefined;
            }

            const resolvedPath = importer ? resolve(dirname(importer), source) : resolve(source);

            if (!await isAccessible(resolvedPath)) {
                this.warn(`Native module not found: ${resolvedPath}`);

                return undefined;
            }

            const resolvedPathBasename = basename(resolvedPath);
            let outputName = resolvedPathBasename;
            let counter = 1;

            // Handle name collisions by checking already staged values
            const stagedBasenames = new Set([...modulesToCopy.values()].map((p) => basename(p)));

            while (stagedBasenames.has(outputName)) {
                const extension = extname(resolvedPathBasename);
                const name = basename(resolvedPathBasename, extension);

                outputName = `${name}_${counter}${extension}`;
                counter += 1;
            }

            // We'll set the destination path in generateBundle when we have the distDirectory
            modulesToCopy.set(resolvedPath, outputName);

            // Return a virtual module ID containing the original path
            return PREFIX + resolvedPath;
        },
    };
};
