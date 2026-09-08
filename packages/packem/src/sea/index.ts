import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { cwd as processCwd, env as processEnv } from "node:process";

import type { SeaManifest } from "./decode";
import { decodeAsset } from "./decode";

/**
 * Runtime helpers for reading the assets embedded by packem's `exe` option.
 *
 * The same call works in both worlds: inside a single executable it reads the embedded
 * copy, and during `node dist/cli.js` development it falls back to the file on disk.
 * That means no `if (isSea())` branches in application code.
 * @example
 * ```ts
 * import { getAssetText } from "@visulima/packem/sea";
 *
 * const template = await getAssetText("templates/mail.hbs");
 * ```
 * @module
 */

interface NodeSeaModule {
    getAsset: ((key: string) => ArrayBuffer) & ((key: string, encoding: string) => string);
    getAssetAsBlob: (key: string, options?: { type?: string }) => Blob;
    getRawAsset: (key: string) => ArrayBuffer;
    isSea: () => boolean;
}

let seaModule: NodeSeaModule | undefined;
let seaLoaded = false;

/**
 * Loads `node:sea` once, tolerating runtimes that do not provide it.
 *
 * `require` is used rather than a dynamic `import` so the lookup stays synchronous and
 * the module is not pulled into a bundle graph.
 * @returns The `node:sea` module, or `undefined` on a runtime without it.
 */
const loadSea = (): NodeSeaModule | undefined => {
    if (seaLoaded) {
        return seaModule;
    }

    seaLoaded = true;

    try {
        seaModule = createRequire(import.meta.url)("node:sea") as NodeSeaModule;
    } catch {
        // Bun, Deno, and Node.js < 20.12 have no `node:sea`; development fallbacks still work.
        seaModule = undefined;
    }

    return seaModule;
};

/**
 * Reports whether the current process is running from a single executable built by packem.
 * @returns `true` inside a single executable, `false` during ordinary `node` execution.
 */
const isSea = (): boolean => loadSea()?.isSea() ?? false;

/** Asset key holding the manifest packem writes when the payload is encoded. */
const MANIFEST_ASSET_KEY = "__packem_sea_manifest__";

let manifest: SeaManifest | undefined;

/**
 * Reads the manifest packem embeds alongside the assets, once.
 *
 * An executable built without compression has no manifest, so a miss is the normal case
 * and simply means the assets are stored verbatim.
 * @returns The manifest, or an empty object when there is none.
 */
const getManifest = (): SeaManifest => {
    if (manifest !== undefined) {
        return manifest;
    }

    const sea = loadSea();

    try {
        manifest = JSON.parse(sea?.getAsset(MANIFEST_ASSET_KEY, "utf8") ?? "{}") as SeaManifest;
    } catch {
        manifest = {};
    }

    return manifest;
};

/**
 * Reverses the compression packem applied to an embedded asset.
 * @param data The bytes as embedded.
 * @returns The original bytes, or `data` unchanged when the payload is not compressed.
 */
const decode = async (data: ArrayBuffer): Promise<ArrayBuffer> => await decodeAsset(data, getManifest().compression);

let assetRoot: string | undefined;

/**
 * Sets the directory that asset keys resolve against when *not* running inside an executable.
 *
 * Defaults to `PACKEM_SEA_ASSET_ROOT` if set, otherwise the current working directory —
 * which matches how `exe.assets` keys are generated (relative to the project root).
 * @param root An absolute directory path.
 */
const setAssetRoot = (root: string): void => {
    assetRoot = root;
};

/**
 * Returns the directory that asset keys resolve against outside an executable.
 * @returns The configured root, the `PACKEM_SEA_ASSET_ROOT` environment variable, or `process.cwd()`.
 */
const getAssetRoot = (): string => assetRoot ?? processEnv.PACKEM_SEA_ASSET_ROOT ?? processCwd();

const toDiskPath = (key: string): URL => new URL(key, `file://${getAssetRoot().replaceAll("\\", "/")}/`);

/**
 * Reads an embedded asset as raw bytes.
 * @param key The asset key, i.e. the file's path relative to the project root.
 * @returns The asset's contents.
 * @throws If the key was never embedded and no file exists at the fallback location.
 */
const getAsset = async (key: string): Promise<ArrayBuffer> => {
    const sea = loadSea();

    if (sea?.isSea()) {
        return await decode(sea.getAsset(key));
    }

    const { readFile } = await import("node:fs/promises");
    const buffer = await readFile(toDiskPath(key));

    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
};

/**
 * Reads an embedded asset and decodes it as text.
 * @param key The asset key, i.e. the file's path relative to the project root.
 * @param encoding The text encoding to decode with.
 * @returns The asset's contents as a string.
 * @throws If the key was never embedded and no file exists at the fallback location.
 */
const getAssetText = async (key: string, encoding: BufferEncoding = "utf8"): Promise<string> => {
    const sea = loadSea();

    if (sea?.isSea()) {
        // Decoding goes through the byte path so a compressed asset is decompressed
        // before it is interpreted as text.
        return Buffer.from(await decode(sea.getAsset(key))).toString(encoding);
    }

    const { readFile } = await import("node:fs/promises");

    return await readFile(toDiskPath(key), encoding);
};

/**
 * Reads an embedded asset and parses it as JSON.
 * @param key The asset key, i.e. the file's path relative to the project root.
 * @returns The parsed value.
 * @throws If the asset is missing or is not valid JSON.
 */
const getAssetJson = async <T = unknown>(key: string): Promise<T> => JSON.parse(await getAssetText(key)) as T;

/**
 * Reads an embedded asset as a {@link Blob}, useful for passing to `fetch` or `Response`.
 * @param key The asset key, i.e. the file's path relative to the project root.
 * @param options Passed straight to the `Blob` constructor.
 * @param options.type MIME media type reported by the returned blob, e.g. `"application/json"`.
 * @returns The asset wrapped in a `Blob`.
 * @throws If the asset is missing.
 */
const getAssetBlob = async (key: string, options?: { type?: string }): Promise<Blob> => {
    const sea = loadSea();

    if (sea?.isSea() && getManifest().compression === undefined) {
        return sea.getAssetAsBlob(key, options);
    }

    return new Blob([await getAsset(key)], options);
};

/**
 * Reads an embedded asset as a Node.js {@link Buffer}.
 * @param key The asset key, i.e. the file's path relative to the project root.
 * @returns The asset's contents.
 * @throws If the asset is missing.
 */
const getAssetBuffer = async (key: string): Promise<Buffer> => Buffer.from(await getAsset(key));

export type { NodeSeaModule };
export { getAsset, getAssetBlob, getAssetBuffer, getAssetJson, getAssetRoot, getAssetText, isSea, setAssetRoot };

export { type SeaCompression, type SeaManifest } from "./decode";
