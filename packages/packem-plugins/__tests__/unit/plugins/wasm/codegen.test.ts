import { describe, expect, it } from "vitest";

import { generateWasmModule } from "../../../../src/plugins/wasm/codegen";
import { parseWasmModuleShape } from "../../../../src/plugins/wasm/parse";

/** `(module (func (export "add") (param i32 i32) (result i32) (i32.add (local.get 0) (local.get 1))))` */
const ADD = Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x61,
    0x64, 0x64, 0x00, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b,
]);

const inline = (bytes: Uint8Array) => ({ base64: Buffer.from(bytes).toString("base64"), kind: "inline" }) as const;

/**
 * Evaluates a generated wrapper as a real ES module. The generated code is the plugin's
 * actual product, so asserting on its behaviour catches breakage that a snapshot of the
 * source would not.
 */
const evaluate = async (code: string): Promise<Record<string, unknown>> =>
    (await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`)) as Record<string, unknown>;

describe(generateWasmModule, () => {
    const shape = parseWasmModuleShape(ADD);

    describe("instance form", () => {
        it("should expose each WebAssembly export as a named export", async () => {
            expect.assertions(1);

            const module = await evaluate(generateWasmModule({ await: false, delivery: inline(ADD), form: "instance", shape }));

            expect((module.add as (a: number, b: number) => number)(2, 3)).toBe(5);
        });

        it("should keep the @rollup/plugin-wasm default export working", async () => {
            expect.assertions(2);

            const module = await evaluate(generateWasmModule({ await: false, delivery: inline(ADD), form: "instance", shape }));
            const instance = await (module.default as () => Promise<WebAssembly.Instance>)();

            expect(instance).toBeInstanceOf(WebAssembly.Instance);
            expect((instance.exports.add as (a: number, b: number) => number)(7, 7)).toBe(14);
        });

        it("should instantiate through top-level await when asked to", async () => {
            expect.assertions(2);

            const code = generateWasmModule({ await: true, delivery: inline(ADD), form: "instance", shape });

            expect(code).toContain("await WebAssembly.instantiate");

            const module = await evaluate(code);

            expect((module.add as (a: number, b: number) => number)(4, 5)).toBe(9);
        });

        it("should not emit top-level await when instantiating synchronously", () => {
            expect.assertions(2);

            const code = generateWasmModule({ await: false, delivery: inline(ADD), form: "instance", shape });

            expect(code).not.toContain("await ");
            expect(code).toContain("new WebAssembly.Instance");
        });

        it("should alias exports whose names are not valid identifiers", () => {
            expect.assertions(2);

            const code = generateWasmModule({
                await: false,
                delivery: inline(ADD),
                form: "instance",
                shape: {
                    exports: [
                        { kind: "function", name: "add" },
                        { kind: "function", name: "with-dash" },
                    ],
                    imports: [],
                },
            });

            // `with-dash` cannot be a binding name, so it goes through a string alias.
            expect(code).toContain(`export { __packem_wasm_export_1 as "with-dash" };`);
            expect(code).not.toContain("export const with-dash");
        });

        it("should alias an export whose name is a reserved word", () => {
            expect.assertions(1);

            const code = generateWasmModule({
                await: false,
                delivery: inline(ADD),
                form: "instance",
                shape: { exports: [{ kind: "function", name: "delete" }], imports: [] },
            });

            expect(code).not.toContain("export const delete ");
        });

        it("should import each WebAssembly import's module specifier as an ES module", () => {
            expect.assertions(3);

            const code = generateWasmModule({
                await: false,
                delivery: inline(ADD),
                form: "instance",
                shape: {
                    exports: [],
                    imports: [
                        { kind: "function", module: "./util.js", name: "log" },
                        // A second field on the same specifier must not import it twice.
                        { kind: "function", module: "./util.js", name: "warn" },
                        { kind: "memory", module: "./mem.js", name: "memory" },
                    ],
                },
            });

            expect(code).toContain(`import * as __packem_wasm_import_0 from "./util.js";`);
            expect(code).toContain(`import * as __packem_wasm_import_1 from "./mem.js";`);
            expect(code.match(/from "\.\/util\.js"/g)).toHaveLength(1);
        });
    });

    describe("source form", () => {
        it("should default-export a compiled, uninstantiated module", async () => {
            expect.assertions(2);

            const module = await evaluate(generateWasmModule({ await: false, delivery: inline(ADD), form: "source", shape }));

            expect(module.default).toBeInstanceOf(WebAssembly.Module);
            // The source phase must not instantiate: no exports are bound.
            expect(module.add).toBeUndefined();
        });

        it("should compile through top-level await when asked to", async () => {
            expect.assertions(1);

            const module = await evaluate(generateWasmModule({ await: true, delivery: inline(ADD), form: "source", shape }));

            expect(module.default).toBeInstanceOf(WebAssembly.Module);
        });
    });

    describe("asset delivery", () => {
        it("should fetch the emitted file relative to the chunk under top-level await", () => {
            expect.assertions(2);

            const code = generateWasmModule({ await: true, delivery: { kind: "asset", url: "./add-1234abcd.wasm" }, form: "instance", shape });

            expect(code).toContain(`await fetch(new URL("./add-1234abcd.wasm", import.meta.url))`);
            expect(code).not.toContain("node:fs");
        });

        it("should read the emitted file with node:fs when synchronous", () => {
            expect.assertions(2);

            const code = generateWasmModule({ await: false, delivery: { kind: "asset", url: "./add-1234abcd.wasm" }, form: "instance", shape });

            expect(code).toContain(`import { readFileSync as __packem_wasm_read } from "node:fs";`);
            expect(code).not.toContain("fetch(");
        });
    });
});
