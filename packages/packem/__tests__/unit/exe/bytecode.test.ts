import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { arch as processArch, execPath as processExecPath, platform as processPlatform } from "node:process";
import vm from "node:vm";

import { join } from "@visulima/path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertBytecodeSupported, compileBytecode, createLoaderSource, getCompilerBinary, wrapSource } from "../../../src/exe/bytecode";
import { BYTECODE_ASSET_KEY } from "../../../src/exe/compress";
import { getHostArch, getHostPlatform } from "../../../src/exe/target";

const hostTarget = { arch: getHostArch(), nodeVersion: "25.7.0", platform: getHostPlatform() } as const;

describe("exe bytecode", () => {
    describe(wrapSource, () => {
        it("should wrap the bundle in the CommonJS free variables", () => {
            expect.assertions(2);

            const wrapped = wrapSource("module.exports = 1;");

            expect(wrapped.startsWith("(function (exports, require, module, __filename, __dirname) {")).toBe(true);
            expect(wrapped.endsWith("\n});")).toBe(true);
        });
    });

    describe(assertBytecodeSupported, () => {
        it("should accept a CommonJS entry for the host target", () => {
            expect.assertions(1);

            expect(() => {
                assertBytecodeSupported(hostTarget, "commonjs");
            }).not.toThrow();
        });

        it("should reject an ES module entry, since vm.Script compiles classic scripts", () => {
            expect.assertions(1);

            expect(() => {
                assertBytecodeSupported(hostTarget, "module");
            }).toThrow("only supports CommonJS output");
        });

        it("should reject a target this machine cannot execute", () => {
            expect.assertions(1);

            const foreign = { ...hostTarget, platform: getHostPlatform() === "linux" ? ("win" as const) : ("linux" as const) };

            expect(() => {
                assertBytecodeSupported(foreign, "commonjs");
            }).toThrow("cannot build the");
        });

        it("should explain how to work around a cross-platform target", () => {
            expect.assertions(1);

            const foreign = { ...hostTarget, arch: getHostArch() === "x64" ? ("arm64" as const) : ("x64" as const) };

            expect(() => {
                assertBytecodeSupported(foreign, "commonjs");
            }).toThrow("Build this target on a matching machine");
        });
    });

    describe(getCompilerBinary, () => {
        it("should use the running binary for a host build", () => {
            expect.assertions(1);

            expect(getCompilerBinary(hostTarget, undefined)).toBe(processExecPath);
        });

        it("should use the downloaded binary when one was fetched for the target", () => {
            expect.assertions(1);

            expect(getCompilerBinary(hostTarget, "/cache/node/v25.7.0/node")).toBe("/cache/node/v25.7.0/node");
        });
    });

    describe(createLoaderSource, () => {
        it("should reproduce the exact source length V8 validates against", () => {
            expect.assertions(1);

            expect(createLoaderSource(1234, "cli.cjs", undefined)).toContain('" ".repeat(1234)');
        });

        it("should set the eager-compilation flag the cache was produced with", () => {
            expect.assertions(1);

            expect(createLoaderSource(1, "cli.cjs", undefined)).toContain('v8.setFlagsFromString("--no-lazy")');
        });

        it("should fail loudly when V8 rejects the cache, rather than silently running nothing", () => {
            expect.assertions(1);

            expect(createLoaderSource(1, "cli.cjs", undefined)).toContain("script.cachedDataRejected");
        });

        it("should read the payload from the reserved asset key", () => {
            expect.assertions(1);

            expect(createLoaderSource(1, "cli.cjs", undefined)).toContain(JSON.stringify(BYTECODE_ASSET_KEY));
        });

        it.each([
            ["brotli", "brotliDecompressSync"],
            ["gzip", "gunzipSync"],
            ["zstd", "zstdDecompressSync"],
        ] as const)("should decompress a %s payload with %s", (compression, expected) => {
            expect.assertions(1);

            expect(createLoaderSource(1, "cli.cjs", compression)).toContain(expected);
        });

        it("should not pull in zlib when the payload is uncompressed", () => {
            expect.assertions(1);

            expect(createLoaderSource(1, "cli.cjs", undefined)).not.toContain("node:zlib");
        });
    });

    // The highest-risk behaviour in the feature: code that ships without its source has
    // to keep working, including paths that were never executed while compiling.
    describe("compile and run without source", () => {
        let directory: string;

        beforeAll(async () => {
            directory = await mkdtemp(join(tmpdir(), "packem-bytecode-test-"));
        });

        afterAll(async () => {
            await rm(directory, { force: true, recursive: true });
        });

        let entryCounter = 0;

        const runFromBytecode = async (bundle: string): Promise<Record<string, unknown>> => {
            entryCounter += 1;

            const entryPath = join(directory, `entry-${String(entryCounter)}.cjs`);

            await writeFile(entryPath, bundle);

            const compiled = await compileBytecode({
                compression: undefined,
                entryPath,
                nodePath: processExecPath,
                temporaryDirectory: directory,
            });

            const loaderSource = createLoaderSource(compiled.sourceLength, "entry.cjs", undefined);
            const realRequire = createRequire(import.meta.url);
            const { cachedData } = compiled;
            const shimRequire = (id: string): unknown =>
                id === "node:sea"
                    ? {
                          getRawAsset: () => cachedData.buffer.slice(cachedData.byteOffset, cachedData.byteOffset + cachedData.byteLength),
                      }
                    : realRequire(id);

            // The loader is the executable's CommonJS main, so give it the same free variables.
            // eslint-disable-next-line sonarjs/code-eval -- compiling the generated loader is exactly what this test verifies.
            const loader = new vm.Script(wrapSource(loaderSource), { filename: "loader.cjs" });
            const moduleShim = { exports: {} as Record<string, unknown> };

            (loader.runInThisContext() as (...arguments_: unknown[]) => void)(moduleShim.exports, shimRequire, moduleShim, "/app/loader.cjs", "/app");

            return moduleShim.exports;
        };

        it("should run a bundle whose source is never shipped", async () => {
            expect.assertions(1);

            const exported = await runFromBytecode('module.exports = { answer: 6 * 7, platform: require("node:os").platform() };');

            expect(exported.answer).toBe(42);
        });

        it("should run code paths that were never executed while compiling", async () => {
            expect.assertions(3);

            const exported = await runFromBytecode(
                [
                    "class Widget { #id; constructor(i){ this.#id = i; } get id(){ return this.#id; } *walk(){ yield* [1,2,3]; } }",
                    "function coldPath(n) { return n * 111; }",
                    "module.exports = { Widget, coldPath };",
                ].join("\n"),
            );

            const WidgetClass = exported.Widget as new (id: number) => { id: number; walk: () => Iterable<number> };
            const widget = new WidgetClass(9);

            expect((exported.coldPath as (n: number) => number)(3)).toBe(333);
            expect(widget.id).toBe(9);
            expect([...widget.walk()]).toStrictEqual([1, 2, 3]);
        });

        it("should keep async functions working", async () => {
            expect.assertions(1);

            const exported = await runFromBytecode("module.exports = { go: async (x) => { await null; return x + 1; } };");

            await expect((exported.go as (x: number) => Promise<number>)(1)).resolves.toBe(2);
        });

        it("should produce a cache far smaller than the source it replaces", async () => {
            expect.assertions(1);

            const entryPath = join(directory, "big.cjs");
            let bundle = "";

            for (let index = 0; index < 400; index += 1) {
                bundle += `function helper_${String(index)}(a, b) { return a * ${String(index)} + b; }\n`;
            }

            bundle += "module.exports = { helper_399 };";
            await writeFile(entryPath, bundle);

            const compiled = await compileBytecode({ compression: undefined, entryPath, nodePath: processExecPath, temporaryDirectory: directory });

            expect(compiled.cachedData.length).toBeLessThan(compiled.sourceBytes);
        });

        it("should not carry the bundle's source text in the cache", async () => {
            expect.assertions(2);

            const entryPath = join(directory, "leak.cjs");

            await writeFile(entryPath, "function veryDistinctive(n) { return n * 12345; }\nmodule.exports = { veryDistinctive };");

            const compiled = await compileBytecode({ compression: undefined, entryPath, nodePath: processExecPath, temporaryDirectory: directory });
            const blob = compiled.cachedData.toString("latin1");

            expect(blob).not.toContain("return n * 12345");
            expect(blob).not.toContain("module.exports = {");
        });

        it("should report the source length in UTF-16 units so V8's check lines up", async () => {
            expect.assertions(1);

            const entryPath = join(directory, "unicode.cjs");
            const bundle = 'module.exports = { emoji: "🎯🎯🎯" };';

            await writeFile(entryPath, bundle);

            const compiled = await compileBytecode({ compression: undefined, entryPath, nodePath: processExecPath, temporaryDirectory: directory });

            expect(compiled.sourceLength).toBe(wrapSource(bundle).length);
        });

        it("should surface a compile failure instead of emitting a broken cache", async () => {
            expect.assertions(1);

            const entryPath = join(directory, "broken.cjs");

            await writeFile(entryPath, "this is ( not valid javascript");

            await expect(compileBytecode({ compression: undefined, entryPath, nodePath: processExecPath, temporaryDirectory: directory })).rejects.toThrow(
                "Failed to compile",
            );
        });
    });

    describe("host detection sanity", () => {
        it("should agree with the running process", () => {
            expect.assertions(2);

            expect(getHostPlatform()).toBe(processPlatform === "win32" ? "win" : processPlatform);
            expect(getHostArch()).toBe(processArch);
        });
    });
});
