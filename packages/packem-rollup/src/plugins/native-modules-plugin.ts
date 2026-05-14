import { copyFile } from "node:fs/promises";

import { ensureDir, isAccessible } from "@visulima/fs";
import { basename, dirname, extname, join, resolve } from "@visulima/path";
import type { NormalizedOutputOptions, Plugin } from "rollup";

// Counter-based virtual ID prefix — rolldown 1.0 treats `\0name:path`-style IDs
// as relative paths and prepends cwd, breaking the round-trip. A counter avoids
// embedding any path segments inside the virtual ID, so the bundler keeps the
// ID opaque under both rollup and rolldown.
const PREFIX = "\0packem-natives/";

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
    // Map<virtual_id, { source_path, output_name }>
    const virtualEntries = new Map<string, { outputName: string; sourcePath: string }>();
    let counter = 0;
    let distributionDirectory: string | undefined;

    return {
        buildStart() {
            virtualEntries.clear();
            counter = 0;
        },

        generateBundle: async (options: NormalizedOutputOptions) => {
            if (virtualEntries.size === 0) {
                return;
            }

            // generateBundle runs once per output. Compute the dir from THIS
            // output's options so multi-output configs (CJS + ESM) each get
            // their `.node` files copied next to their own bundle.
            let outputDirectory: string | undefined;

            if (options.dir) {
                outputDirectory = options.dir;
            } else if (options.file) {
                outputDirectory = dirname(options.file);
            }

            if (!outputDirectory) {
                throw new Error("Output directory not detected. Please ensure Rollup output options are configured.");
            }

            const nativeLibsDirectory = join(outputDirectory, nativesDirectory);

            await ensureDir(nativeLibsDirectory);

            // Deduplicate by source path — multiple imports of the same file share an outputName.
            const seenSources = new Set<string>();
            const copies: Array<Promise<void>> = [];

            for (const { outputName, sourcePath } of virtualEntries.values()) {
                if (seenSources.has(sourcePath)) {
                    continue;
                }

                seenSources.add(sourcePath);

                copies.push(copyFile(sourcePath, join(nativeLibsDirectory, outputName)));
            }

            await Promise.all(copies);
        },

        load(id) {
            const entry = virtualEntries.get(id);

            if (!entry) {
                return undefined;
            }

            const { outputName } = entry;

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

        resolveId: {
            filter: {
                id: /\.node$/,
            },
            async handler(source, importer) {
                if (source.startsWith(PREFIX)) {
                    return undefined;
                }

                // Rolldown re-runs resolveId for the `./natives/<file>.node` reference
                // emitted by our load hook. The importer is our virtual ID, so relative
                // resolution produces a nonsense path. Mark it external so the
                // require() / createRequire() call passes through to runtime.
                if (importer?.startsWith(PREFIX)) {
                    // eslint-disable-next-line unicorn/no-null
                    return { external: true, id: source };
                }

                const resolvedPath = importer ? resolve(dirname(importer), source) : resolve(source);

                if (!await isAccessible(resolvedPath)) {
                    this.warn(`Native module not found: ${resolvedPath}`);

                    return undefined;
                }

                // Reuse a virtual ID if we've already staged this exact source path.
                for (const [existingId, entry] of virtualEntries) {
                    if (entry.sourcePath === resolvedPath) {
                        return existingId;
                    }
                }

                const resolvedPathBasename = basename(resolvedPath);
                let outputName = resolvedPathBasename;
                let suffix = 1;

                // Handle name collisions by checking already staged output names.
                const stagedOutputNames = new Set(Array.from(virtualEntries.values(), (e) => e.outputName));

                while (stagedOutputNames.has(outputName)) {
                    const extension = extname(resolvedPathBasename);
                    const name = basename(resolvedPathBasename, extension);

                    outputName = `${name}_${suffix}${extension}`;
                    suffix += 1;
                }

                const virtualId = `${PREFIX}${counter}`;

                counter += 1;
                virtualEntries.set(virtualId, { outputName, sourcePath: resolvedPath });

                return virtualId;
            },
        },
    };
};
