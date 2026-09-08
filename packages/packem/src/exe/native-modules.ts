import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { glob } from "@visulima/fs";
import { basename } from "@visulima/path";

import type { CompressionAlgorithm } from "./compress";
/** Environment variable that overrides where addons are written at runtime. */
const NATIVES_DIR_ENVIRONMENT = "PACKEM_SEA_NATIVES_DIR";

/** Prefix for the reserved asset keys holding embedded `.node` addons. */
const NATIVE_ASSET_PREFIX = "__packem_sea_native__/";

/** The synchronous `node:zlib` function the prelude uses to undo each compression algorithm. */
const DECOMPRESSORS: Record<CompressionAlgorithm, string> = {
    brotli: "brotliDecompressSync",
    gzip: "gunzipSync",
    zstd: "zstdDecompressSync",
};

interface NativeModule {
    /** Reserved asset key the addon is embedded under. */
    assetKey: string;
    /** Absolute path of the `.node` file in the build output. */
    filePath: string;
    /** File name the bundle requires it by, e.g. `addon.node`. */
    name: string;
}

/**
 * Finds the native addons packem's `native-modules` plugin copied into the build output.
 *
 * The plugin rewrites `import addon from "./addon.node"` into a
 * `require("./natives/addon.node")` and copies the file to `&lt;outDir>/natives/`. Inside an
 * executable that path does not exist, so the addons have to be embedded and re-materialized
 * at runtime instead.
 * @param outDirectory Absolute path of the bundler's output directory.
 * @param nativesDirectory Subdirectory the plugin copies addons into.
 * @returns One entry per addon found, sorted for reproducible builds.
 */
const findNativeModules = async (outDirectory: string, nativesDirectory = "natives"): Promise<NativeModule[]> => {
    const matches = await glob(`${nativesDirectory}/**/*.node`, { absolute: true, cwd: outDirectory, onlyFiles: true });

    const modules = matches
        .map((filePath) => {
            const name = basename(filePath);

            return { assetKey: `${NATIVE_ASSET_PREFIX}${name}`, filePath, name };
        })
        .toSorted((left, right) => left.name.localeCompare(right.name, "en"));

    // The glob is recursive, but both the asset map and the runtime resolver are keyed by
    // base name, so two addons called the same thing in different directories would
    // silently collapse into one and the executable would load whichever survived.
    const seen = new Map<string, string>();

    for (const module of modules) {
        const previous = seen.get(module.name);

        if (previous !== undefined) {
            throw new Error(
                `Two native addons in the build output are both named "${module.name}":\n`
                    + `  ${previous}\n  ${module.filePath}\n`
                    + "An executable resolves an addon by its file name, so these cannot both be embedded. "
                    + "Rename one of them, or set `exe.nativeModules: false` to ship them beside the executable instead.",
            );
        }

        seen.set(module.name, module.filePath);
    }

    return modules;
};

/**
 * Derives a stable directory name for the extracted addons.
 *
 * The hash covers the addons' contents, so two builds of the same binary reuse one
 * directory while a rebuilt addon extracts to a fresh one instead of racing an old copy.
 * @param modules The addons being embedded.
 * @returns A short hex digest.
 */
const computeNativeBuildId = async (modules: ReadonlyArray<NativeModule>): Promise<string> => {
    const hash = createHash("sha256");

    for (const module of modules) {
        hash.update(module.name);
        // eslint-disable-next-line no-await-in-loop -- hashing is order-sensitive, so the reads cannot be interleaved.
        hash.update(await readFile(module.filePath));
    }

    return hash.digest("hex").slice(0, 16);
};

interface NativePreludeOptions {
    /** Identifier for the extraction directory, from {@link computeNativeBuildId}. */
    buildId: string;
    /** Algorithm the embedded addons were compressed with, if any. */
    compression: CompressionAlgorithm | undefined;
    /** Module format of the bundle the prelude is prepended to. */
    mainFormat: "commonjs" | "module";
    modules: ReadonlyArray<NativeModule>;
}

/**
 * Generates the code prepended to the bundle so `.node` requires resolve inside the executable.
 *
 * A native addon is loaded by the dynamic linker, which needs a real path on disk, so an
 * embedded copy cannot be loaded in place. The prelude writes each addon out on first use
 * and redirects the bundle's `require("./natives/x.node")` at it by patching
 * `Module._resolveFilename` — the resolver every real `require` goes through.
 *
 * In a CommonJS entry the prelude also replaces the injected `require`, which by itself can
 * only load built-in modules, with one created by `module.createRequire()`. That is the
 * approach Node.js documents for single executable applications.
 * @param options The addons, how they were encoded, and the entry's module format.
 * @returns Source to prepend to the bundle.
 */
const createNativePreludeSource = (options: NativePreludeOptions): string => {
    const { buildId, compression, mainFormat, modules } = options;

    const assetMap = JSON.stringify(Object.fromEntries(modules.map((module) => [module.name, module.assetKey])));
    const decode = compression === undefined ? "raw" : `__packemNodeRequire("node:zlib").${DECOMPRESSORS[compression]}(raw)`;

    // ESM cannot reassign `require`, and has no `require` to begin with, so it builds its
    // own from `createRequire`. CommonJS replaces the injected one in place, so that code
    // further down the bundle inherits a working resolver.
    // `node:sea` is read through the require the executable injected, which is the one the
    // SEA runtime wires its own API into; everything else needs the filesystem-capable
    // require built from `createRequire`.
    const header =
        mainFormat === "module"
            ? `import { createRequire as __packemCreateRequire } from "node:module";\n`
              + `const __packemNodeRequire = __packemCreateRequire(process.execPath);\n`
              + `const __packemSeaRequire = __packemNodeRequire;`
            : `const __packemSeaRequire = require;\n`
              + `const __packemNodeRequire = require("node:module").createRequire(__filename);\n`
              + `require = __packemNodeRequire;`;

    return String.raw`${header}
// Generated by packem: materializes embedded native addons so the dynamic linker can load them.
const __packemNativeAssets = ${assetMap};
// The build id is a digest of addons that ship inside this executable, so anyone holding
// the binary can compute the extraction path. In a shared temporary directory another
// user can therefore pre-create it and have the dynamic linker load their library, so the
// owner is part of the path and every component is checked before anything is loaded.
const __packemNativeOwner = typeof process.getuid === "function" ? String(process.getuid()) : "user";
const __packemNativeRoots = (() => {
    const override = process.env[${JSON.stringify(NATIVES_DIR_ENVIRONMENT)}];

    if (override) {
        return [override];
    }

    const { join } = __packemNodeRequire("node:path");
    const { tmpdir } = __packemNodeRequire("node:os");
    const base = join(tmpdir(), "packem-natives-" + __packemNativeOwner);

    return [base, join(base, ${JSON.stringify(buildId)})];
})();
const __packemNativeDirectory = __packemNativeRoots[__packemNativeRoots.length - 1];
const __packemNativeCache = new Map();

// Rejects anything we do not exclusively control. \`lstat\` deliberately does not follow
// links, so a symlink planted at either path fails both type checks below.
const __packemAssertPrivate = (fs, path, wantDirectory) => {
    const stats = fs.lstatSync(path);

    if (wantDirectory ? !stats.isDirectory() : !stats.isFile()) {
        throw new Error(path + " is not a " + (wantDirectory ? "directory" : "regular file") + ".");
    }

    if (typeof process.getuid === "function") {
        if (stats.uid !== process.getuid()) {
            throw new Error(path + " is owned by another user.");
        }

        if ((stats.mode & 0o022) !== 0) {
            throw new Error(path + " is writable by other users.");
        }
    }
};

const __packemExtractNative = (name) => {
    const cached = __packemNativeCache.get(name);

    if (cached !== undefined) {
        return cached;
    }

    const fs = __packemNodeRequire("node:fs");
    const { join } = __packemNodeRequire("node:path");
    const sea = __packemSeaRequire("node:sea");
    const target = join(__packemNativeDirectory, name);

    // Every level, not just the leaf: owning the parent is enough to swap the directory
    // the addon is read from.
    for (const directory of __packemNativeRoots) {
        fs.mkdirSync(directory, { mode: 0o700, recursive: true });
        __packemAssertPrivate(fs, directory, true);
    }

    if (fs.existsSync(target)) {
        __packemAssertPrivate(fs, target, false);
    } else {
        const raw = Buffer.from(sea.getRawAsset(__packemNativeAssets[name]));
        const bytes = ${decode};
        // Write to a unique name and rename, so two processes starting at once cannot
        // observe a half-written addon.
        const staging = target + "." + process.pid + "." + Date.now() + ".tmp";

        fs.writeFileSync(staging, bytes, { mode: 0o700 });

        try {
            fs.renameSync(staging, target);
        } catch (error) {
            // Another process won the race; its copy is equivalent, so keep it.
            if (!fs.existsSync(target)) {
                throw error;
            }

            try {
                fs.unlinkSync(staging);
            } catch {}
        }

        __packemAssertPrivate(fs, target, false);
    }

    __packemNativeCache.set(name, target);

    return target;
};

{
    const Module = __packemNodeRequire("node:module");
    const { basename } = __packemNodeRequire("node:path");
    const __packemResolveFilename = Module._resolveFilename;

    Module._resolveFilename = function (request, ...rest) {
        if (typeof request === "string" && request.endsWith(".node")) {
            const name = basename(request);

            if (Object.prototype.hasOwnProperty.call(__packemNativeAssets, name)) {
                try {
                    return __packemExtractNative(name);
                } catch (error) {
                    throw new Error(
                        "Failed to unpack the native addon \"" + name + "\" to " + __packemNativeDirectory + ".\n" +
                            "Set PACKEM_SEA_NATIVES_DIR to a writable, non-noexec directory if the default temporary directory is unusable.\n" +
                            String(error && error.message ? error.message : error),
                    );
                }
            }
        }

        return __packemResolveFilename.call(this, request, ...rest);
    };
}
`;
};

/**
 * Reports whether embedding native addons is possible for a target.
 *
 * An addon is a compiled shared library for one platform and architecture, so a build for
 * a different target would embed one the executable can never load.
 * @param modules The addons found in the output.
 * @param isHost Whether the target is the machine running the build.
 * @throws When addons would be embedded into an executable that cannot load them.
 */
const assertNativeModulesSupported = (modules: ReadonlyArray<NativeModule>, isHost: boolean): void => {
    if (modules.length === 0 || isHost) {
        return;
    }

    const names = modules.map((module) => `- ${module.name}`).join("\n");

    throw new Error(
        `This build produced native addons, which are compiled for one platform and architecture and cannot be embedded into an executable for a different target:\n${names}\n`
            + "Build each target on a matching machine (a CI matrix job, for example), restrict `exe.targets` to the host, or set `exe.nativeModules: false` to ship the addons beside the executable instead.",
    );
};

export type { NativeModule, NativePreludeOptions };
export { assertNativeModulesSupported, computeNativeBuildId, createNativePreludeSource, findNativeModules, NATIVE_ASSET_PREFIX, NATIVES_DIR_ENVIRONMENT };
