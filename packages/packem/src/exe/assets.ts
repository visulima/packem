import { stat } from "node:fs/promises";

import { glob, isAccessible } from "@visulima/fs";
import { isAbsolute, join, normalize, relative, resolve, toNamespacedPath } from "@visulima/path";

import { BYTECODE_ASSET_KEY, MANIFEST_ASSET_KEY } from "./compress";
import { createDebug } from "./debug";
import { NATIVE_ASSET_PREFIX } from "./native-modules";
import type { ExeAssets } from "./options";

const debug = createDebug();

/** Node.js refuses to embed an asset larger than this, so fail with a useful message first. */
const MAX_ASSET_BYTES = 2 ** 31 - 1;

const BACKSLASH = /\\/g;

/**
 * Converts a path to the forward-slash form used as the asset key inside the executable,
 * so that a build on Windows and a build on Linux produce the same runtime keys.
 * @param value The path to normalize.
 * @returns The path with `\` replaced by `/`.
 */
const toPosix = (value: string): string => value.replaceAll(BACKSLASH, "/");

/**
 * Reports whether a resolved path escapes the project root.
 *
 * Assets outside the root would embed with keys like `../../secret.env`, which are both
 * unusable at runtime and a footgun, so they are rejected.
 * @param rootDir The absolute project root.
 * @param filePath The absolute candidate path.
 * @returns `true` when `filePath` is not inside `rootDir`.
 */

/**
 * Rejects asset keys packem reserves for its own payloads.
 *
 * The compression manifest, the bytecode cache and the embedded addons are merged into the
 * same map as the user's assets. A colliding key would either be silently replaced, or —
 * for the manifest — be read back as configuration and make every other asset fail to
 * decode, so it is refused up front instead.
 * @param key The normalized asset key.
 * @throws If the key is one packem reserves.
 */
const assertNotReserved = (key: string): void => {
    if (key === MANIFEST_ASSET_KEY || key === BYTECODE_ASSET_KEY || key.startsWith(NATIVE_ASSET_PREFIX)) {
        throw new Error(`The \`exe.assets\` key "${key}" is reserved by packem. Choose a key that does not start with "__packem_sea".`);
    }
};

const isOutsideRoot = (rootDir: string, filePath: string): boolean => {
    const relativePath = relative(rootDir, filePath);

    return relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath);
};

interface ResolvedAssets {
    /** SEA `assets` map: runtime key to absolute source path. */
    map: Record<string, string>;
    /** Combined byte size of every embedded asset. */
    totalBytes: number;
}

const assertReadable = async (sourcePath: string, describedBy: string): Promise<number> => {
    if (!(await isAccessible(sourcePath))) {
        throw new Error(`The \`exe.assets\` entry ${describedBy} points at "${sourcePath}", which does not exist or is not readable.`);
    }

    const stats = await stat(sourcePath);

    if (stats.isDirectory()) {
        throw new Error(
            `The \`exe.assets\` entry ${describedBy} points at the directory "${sourcePath}". Use a glob such as "${toPosix(sourcePath)}/**/*" to embed its files.`,
        );
    }

    if (stats.size > MAX_ASSET_BYTES) {
        throw new Error(
            `The asset ${describedBy} is ${String(stats.size)} bytes, which exceeds the ${String(MAX_ASSET_BYTES)} byte limit for embedded assets.`,
        );
    }

    return stats.size;
};

/**
 * Expands the user-facing `exe.assets` value into the `assets` map Node.js SEA expects.
 *
 * Three shapes are supported:
 *
 * - A glob string — `"templates/**\/*.hbs"`
 * - An array of globs, with `!`-prefixed entries acting as exclusions
 * - An explicit `Record&lt;runtimeKey, path>` map, which skips globbing entirely
 *
 * Globbed files are keyed by their path relative to `rootDir` (always forward-slashed),
 * which is the same string a developer would pass to `readFile`, so
 * `getAsset("templates/mail.hbs")` reads naturally.
 * @param assets The configured `exe.assets` value.
 * @param rootDir The absolute project root that keys are made relative to.
 * @returns The resolved asset map and its combined size.
 * @throws If a configured asset is missing, is a directory, or resolves outside `rootDir`.
 */
const resolveAssets = async (assets: ExeAssets | undefined, rootDir: string): Promise<ResolvedAssets> => {
    if (assets === undefined) {
        return { map: {}, totalBytes: 0 };
    }

    const map: Record<string, string> = {};
    let totalBytes = 0;

    if (typeof assets === "object" && !Array.isArray(assets)) {
        for (const [key, value] of Object.entries(assets)) {
            const sourcePath = isAbsolute(value) ? normalize(value) : resolve(rootDir, value);

            // eslint-disable-next-line no-await-in-loop -- surfacing the first broken asset with its own key is more useful than a merged rejection.
            totalBytes += await assertReadable(sourcePath, `"${key}"`);

            const normalizedKey = toPosix(key);

            assertNotReserved(normalizedKey);

            map[normalizedKey] = sourcePath;
        }

        debug("Resolved %d explicit assets", Object.keys(map).length);

        return { map, totalBytes };
    }

    const patterns = (typeof assets === "string" ? [assets] : [...assets]).map((pattern) => toPosix(pattern));

    if (patterns.length === 0) {
        return { map: {}, totalBytes: 0 };
    }

    debug("Globbing assets with patterns: %O (cwd: %s)", patterns, rootDir);

    const matches = await glob(patterns, {
        absolute: true,
        cwd: rootDir,
        dot: true,
        ignore: ["**/node_modules/**"],
        onlyFiles: true,
    });

    if (matches.length === 0) {
        throw new Error(`The \`exe.assets\` patterns ${JSON.stringify(patterns)} did not match any file under "${rootDir}".`);
    }

    // Globbing is unordered across platforms; sorting keeps the embedded asset list —
    // and therefore the executable — reproducible between machines.
    for (const match of matches.toSorted((left, right) => left.localeCompare(right, "en"))) {
        const sourcePath = normalize(match);

        if (isOutsideRoot(rootDir, sourcePath)) {
            throw new Error(`The asset "${sourcePath}" resolves outside the project root "${rootDir}". Assets must live inside the project.`);
        }

        const key = toPosix(relative(rootDir, sourcePath));

        assertNotReserved(key);

        // eslint-disable-next-line no-await-in-loop -- keeps the failing asset identifiable and the memory profile flat for large asset trees.
        totalBytes += await assertReadable(sourcePath, `"${key}"`);

        map[key] = sourcePath;
    }

    debug("Resolved %d globbed assets (%d bytes)", Object.keys(map).length, totalBytes);

    return { map, totalBytes };
};

/**
 * Builds the absolute on-disk path for an asset key, used when reporting resolved assets.
 * @param rootDir The absolute project root.
 * @param key Forward-slashed path of the asset, relative to `rootDir`.
 * @returns The platform-native absolute path.
 */
const assetKeyToPath = (rootDir: string, key: string): string => toNamespacedPath(join(rootDir, key));

export type { ResolvedAssets };
export { assetKeyToPath, resolveAssets, toPosix };
