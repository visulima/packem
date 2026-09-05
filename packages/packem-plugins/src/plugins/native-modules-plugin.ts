import { copyFile } from "node:fs/promises";

import { ensureDir, isAccessible } from "@visulima/fs";
import { basename, dirname, extname, join, resolve } from "@visulima/path";
import type { NormalizedOutputOptions, Plugin } from "rollup";

const NODE_EXT_RE = /\.node$/;

// Virtual ID prefix. rolldown 1.0 treats `\0name:path`-style IDs as relative paths and
// prepends cwd, breaking the round-trip, so the source path is base64url-encoded into the
// ID: that alphabet contains no `/` or `.`, leaving the ID as opaque to the bundler as a
// counter was under both rollup and rolldown.
//
// Encoding it (rather than holding it in a Map keyed by a counter) is what makes a
// rebuild work. `resolveId` does not re-run for modules restored from rollup's build
// cache, but `load` does — so an ID that only means something to the process that minted
// it names a module the next build cannot load.
const PREFIX = "\0packem-natives/";

const encodeNativeId = (sourcePath: string): string => `${PREFIX}${Buffer.from(sourcePath, "utf8").toString("base64url")}`;

const decodeNativeId = (id: string): string | undefined =>
    id.startsWith(PREFIX) ? Buffer.from(id.slice(PREFIX.length), "base64url").toString("utf8") : undefined;

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
    // Map<source_path, output_name>, populated by `load` (which runs on every build,
    // cached or not) and consumed by `generateBundle` to copy the files.
    const stagedNatives = new Map<string, string>();

    /**
     * Picks the name a `.node` file is copied out under, keeping the plain basename and
     * falling back to a numeric suffix when two different sources share one.
     */
    const stageNative = (sourcePath: string): string => {
        const existing = stagedNatives.get(sourcePath);

        if (existing !== undefined) {
            return existing;
        }

        const resolvedPathBasename = basename(sourcePath);
        const taken = new Set(stagedNatives.values());
        let outputName = resolvedPathBasename;
        let suffix = 1;

        while (taken.has(outputName)) {
            const extension = extname(resolvedPathBasename);
            const name = basename(resolvedPathBasename, extension);

            outputName = `${name}_${String(suffix)}${extension}`;
            suffix += 1;
        }

        stagedNatives.set(sourcePath, outputName);

        return outputName;
    };

    return {
        buildStart() {
            stagedNatives.clear();
        },

        generateBundle: async (options: NormalizedOutputOptions) => {
            if (stagedNatives.size === 0) {
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

            // Keyed by source path, so repeated imports of the same file copy once.
            const copies = Array.from(stagedNatives, ([sourcePath, outputName]) =>
                copyFile(sourcePath, join(nativeLibsDirectory, outputName)));

            await Promise.all(copies);
        },

        load(id) {
            const sourcePath = decodeNativeId(id);

            if (sourcePath === undefined) {
                return undefined;
            }

            const outputName = stageNative(sourcePath);

            // The require path is always relative to the final bundle directory; the
            // `.node` file is copied into `<output>/<nativesDirectory>/` during
            // generateBundle, so this resolves correctly at runtime regardless of
            // when the output directory becomes known.
            const relativePath = `./${nativesDirectory}/${outputName}`;

            return `export default require("${relativePath.replaceAll("\\", "/")}");`;
        },

        name: "native-modules",

        resolveId: {
            filter: {
                id: NODE_EXT_RE,
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
                    return { external: true, id: source };
                }

                const resolvedPath = importer ? resolve(dirname(importer), source) : resolve(source);

                if (!(await isAccessible(resolvedPath))) {
                    this.warn(`Native module not found: ${resolvedPath}`);

                    return undefined;
                }

                // The ID is a pure function of the source path, so the same file always
                // resolves to the same module and a rebuild recovers it without this hook.
                return encodeNativeId(resolvedPath);
            },
        },
    };
};
