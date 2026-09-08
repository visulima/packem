import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { execPath as processExecPath, platform as processPlatform } from "node:process";
import vm from "node:vm";

import { dirname, join } from "@visulima/path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compressBuffer } from "../../../src/exe/compress";
import type { NativeModule } from "../../../src/exe/native-modules";
import {
    assertNativeModulesSupported,
    computeNativeBuildId,
    createNativePreludeSource,
    findNativeModules,
    NATIVE_ASSET_PREFIX,
} from "../../../src/exe/native-modules";

const ADDON_SOURCE = `#include <node_api.h>
static napi_value Answer(napi_env env, napi_callback_info info) {
    napi_value result;
    napi_create_int32(env, 4242, &result);
    return result;
}
NAPI_MODULE_INIT() {
    napi_value fn;
    napi_create_function(env, "answer", NAPI_AUTO_LENGTH, Answer, NULL, &fn);
    napi_set_named_property(env, exports, "answer", fn);
    return exports;
}
`;

/**
 * Compiles a tiny N-API addon so the prelude can be exercised against a real shared
 * library rather than a stand-in file the dynamic linker would refuse.
 * @param directory Where to write the sources and the built addon.
 * @returns The addon's path, or `undefined` when no toolchain is available.
 */
const buildAddon = (directory: string): string | undefined => {
    const sourcePath = join(directory, "addon.c");
    const addonPath = join(directory, "addon.node");
    const includeDirectory = join(dirname(processExecPath), "../include/node");

    if (processPlatform === "win32" || !existsSync(join(includeDirectory, "node_api.h"))) {
        return undefined;
    }

    try {
        // eslint-disable-next-line sonarjs/no-os-command-from-path -- resolving the toolchain from PATH is what a developer machine and CI both provide.
        execFileSync("cc", ["-shared", "-fPIC", "-I", includeDirectory, sourcePath, "-o", addonPath], { stdio: "ignore" });
    } catch {
        return undefined;
    }

    return addonPath;
};

// Built at module scope so the addon-loading suite can be skipped declaratively on a
// machine with no C toolchain or Node.js headers, rather than asserting nothing inside it.
const addonDirectory = mkdtempSync(join(tmpdir(), "packem-natives-addon-"));

writeFileSync(join(addonDirectory, "addon.c"), ADDON_SOURCE);

const addonPath = buildAddon(addonDirectory);

afterAll(() => {
    rmSync(addonDirectory, { force: true, recursive: true });
});

describe("exe native modules", () => {
    let directory: string;

    beforeAll(async () => {
        directory = await mkdtemp(join(tmpdir(), "packem-natives-test-"));
    });

    afterAll(async () => {
        await rm(directory, { force: true, recursive: true });
    });

    describe(findNativeModules, () => {
        it("should return nothing when the output has no natives directory", async () => {
            expect.assertions(1);

            await expect(findNativeModules(directory)).resolves.toStrictEqual([]);
        });

        it("should find addons and key them under the reserved prefix", async () => {
            expect.assertions(2);

            const outDirectory = await mkdtemp(join(tmpdir(), "packem-out-"));

            await mkdir(join(outDirectory, "natives"), { recursive: true });
            await writeFile(join(outDirectory, "natives/addon.node"), "binary");

            const found = await findNativeModules(outDirectory);

            expect(found).toHaveLength(1);
            expect(found[0]?.assetKey).toBe(`${NATIVE_ASSET_PREFIX}addon.node`);

            await rm(outDirectory, { force: true, recursive: true });
        });

        it("should honour a custom natives directory", async () => {
            expect.assertions(1);

            const outDirectory = await mkdtemp(join(tmpdir(), "packem-out-"));

            await mkdir(join(outDirectory, "addons"), { recursive: true });
            await writeFile(join(outDirectory, "addons/a.node"), "binary");

            await expect(findNativeModules(outDirectory, "addons")).resolves.toHaveLength(1);

            await rm(outDirectory, { force: true, recursive: true });
        });

        it("should return a stable order regardless of how the filesystem lists them", async () => {
            expect.assertions(1);

            const outDirectory = await mkdtemp(join(tmpdir(), "packem-out-"));

            await mkdir(join(outDirectory, "natives"), { recursive: true });
            await Promise.all(["z.node", "a.node", "m.node"].map(async (name) => writeFile(join(outDirectory, "natives", name), name)));

            const found = await findNativeModules(outDirectory);

            expect(found.map((native) => native.name)).toStrictEqual(["a.node", "m.node", "z.node"]);

            await rm(outDirectory, { force: true, recursive: true });
        });
    });

    describe(computeNativeBuildId, () => {
        it("should be stable for identical content", async () => {
            expect.assertions(1);

            const path = join(directory, "stable.node");

            await writeFile(path, "same-bytes");

            const modules: NativeModule[] = [{ assetKey: "k", filePath: path, name: "stable.node" }];

            await expect(computeNativeBuildId(modules)).resolves.toBe(await computeNativeBuildId(modules));
        });

        it("should change when an addon is rebuilt, so a stale copy is never reused", async () => {
            expect.assertions(1);

            const path = join(directory, "changing.node");

            await writeFile(path, "version-one");

            const modules: NativeModule[] = [{ assetKey: "k", filePath: path, name: "changing.node" }];
            const first = await computeNativeBuildId(modules);

            await writeFile(path, "version-two");

            await expect(computeNativeBuildId(modules)).resolves.not.toBe(first);
        });
    });

    describe(assertNativeModulesSupported, () => {
        const modules: NativeModule[] = [{ assetKey: "k", filePath: "/nonexistent/a.node", name: "a.node" }];

        it("should allow addons for the host target", () => {
            expect.assertions(1);

            expect(() => {
                assertNativeModulesSupported(modules, true);
            }).not.toThrow();
        });

        it("should reject addons for a cross target, which cannot load them", () => {
            expect.assertions(1);

            expect(() => {
                assertNativeModulesSupported(modules, false);
            }).toThrow("cannot be embedded into an executable for a different target");
        });

        it("should not complain about a cross target when there are no addons", () => {
            expect.assertions(1);

            expect(() => {
                assertNativeModulesSupported([], false);
            }).not.toThrow();
        });
    });

    describe(createNativePreludeSource, () => {
        const modules: NativeModule[] = [{ assetKey: `${NATIVE_ASSET_PREFIX}a.node`, filePath: "/nonexistent/a.node", name: "a.node" }];

        it("should replace the builtins-only require in a CommonJS entry", () => {
            expect.assertions(1);

            const prelude = createNativePreludeSource({ buildId: "abc", compression: undefined, mainFormat: "commonjs", modules });

            expect(prelude).toContain("require = __packemNodeRequire;");
        });

        it("should build its own require in an ES module entry, which has none to replace", () => {
            expect.assertions(2);

            const prelude = createNativePreludeSource({ buildId: "abc", compression: undefined, mainFormat: "module", modules });

            expect(prelude).toContain('import { createRequire as __packemCreateRequire } from "node:module";');
            expect(prelude).not.toContain("require = __packemNodeRequire;");
        });

        it.each([
            ["patch the resolver every real require goes through", "Module._resolveFilename"],
            ["allow the extraction directory to be overridden at runtime", "PACKEM_SEA_NATIVES_DIR"],
            ["write the addon out before handing back a path", "writeFileSync"],
        ])("should %s", (_label, expected) => {
            expect.assertions(1);

            expect(createNativePreludeSource({ buildId: "abc", compression: undefined, mainFormat: "commonjs", modules })).toContain(expected);
        });

        it.each([
            ["brotli", "brotliDecompressSync"],
            ["gzip", "gunzipSync"],
            ["zstd", "zstdDecompressSync"],
        ] as const)("should decompress a %s payload with %s", (compression, expected) => {
            expect.assertions(1);

            expect(createNativePreludeSource({ buildId: "abc", compression, mainFormat: "commonjs", modules })).toContain(expected);
        });
    });

    // The behaviour that actually matters: a compiled addon, embedded as an asset, has to
    // end up loadable by the dynamic linker inside the executable.
    describe("loading a real addon from an embedded asset", () => {
        const runPrelude = async (compression: "brotli" | undefined): Promise<Record<string, unknown>> => {
            const modules: NativeModule[] = [{ assetKey: `${NATIVE_ASSET_PREFIX}addon.node`, filePath: addonPath as string, name: "addon.node" }];
            const buildId = await computeNativeBuildId(modules);
            const extractionDirectory = join(directory, `extract-${String(compression)}`);

            const bytes = readFileSync(addonPath as string);
            const payload = compression === undefined ? bytes : await compressBuffer(bytes, compression);
            const prelude = createNativePreludeSource({ buildId, compression, mainFormat: "commonjs", modules });

            // Exactly what packem's native-modules plugin emits into a bundle today.
            const bundle = 'module.exports = { answer: require("./natives/addon.node").answer() };';
            const realRequire = createRequire(import.meta.url);
            // The require a real executable injects: built-in modules only.
            const seaRequire = (id: string): unknown => {
                if (id === "node:sea") {
                    return { getRawAsset: () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) };
                }

                if (id.startsWith("node:")) {
                    return realRequire(id);
                }

                throw new Error(`Cannot find module '${id}'`);
            };

            process.env.PACKEM_SEA_NATIVES_DIR = extractionDirectory;

            try {
                // eslint-disable-next-line sonarjs/code-eval -- running the generated prelude is what this test verifies.
                const script = new vm.Script(`(function (exports, require, module, __filename, __dirname) {${prelude}\n${bundle}\n});`, {
                    filename: "main.cjs",
                });
                const moduleShim = { exports: {} as Record<string, unknown> };

                // __filename is process.execPath inside a real single executable.
                (script.runInThisContext() as (...arguments_: unknown[]) => void)(
                    moduleShim.exports,
                    seaRequire,
                    moduleShim,
                    processExecPath,
                    dirname(processExecPath),
                );

                return moduleShim.exports;
            } finally {
                delete process.env.PACKEM_SEA_NATIVES_DIR;
            }
        };

        it.runIf(addonPath !== undefined)("should load an addon that was never on disk as a resolvable path", async () => {
            expect.assertions(1);

            const exported = await runPrelude(undefined);

            expect(exported.answer).toBe(4242);
        });

        it.runIf(addonPath !== undefined)("should load a compressed addon", async () => {
            expect.assertions(1);

            const exported = await runPrelude("brotli");

            expect(exported.answer).toBe(4242);
        });
    });
});
