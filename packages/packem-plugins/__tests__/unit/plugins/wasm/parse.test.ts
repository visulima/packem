import { describe, expect, it } from "vitest";

import { parseWasmModuleShape, WasmParseError } from "../../../../src/plugins/wasm/parse";

/**
 * Hand-assembled binaries rather than fixtures on disk: every byte is accounted for in
 * the test, and each one is checked against the engine's own `WebAssembly.Module`
 * reflection below, so a drift between this reader and the real format shows up here.
 */

/** `(module (func (export "add") (param i32 i32) (result i32) (i32.add (local.get 0) (local.get 1))))` */
const ADD = Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x61,
    0x64, 0x64, 0x00, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b,
]);

/**
 * Imports `log` from the module specifier `./util.js` and exports both a function and a
 * memory, so the reader is exercised on the import section and on a non-function export.
 */
const WITH_IMPORT = Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x01, 0x7f, 0x00, 0x02, 0x11, 0x01, 0x09, 0x2e, 0x2f, 0x75, 0x74, 0x69, 0x6c, 0x2e,
    0x6a, 0x73, 0x03, 0x6c, 0x6f, 0x67, 0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x05, 0x03, 0x01, 0x00, 0x01, 0x07, 0x12, 0x02, 0x05, 0x6c, 0x6f, 0x67, 0x49, 0x74,
    0x00, 0x01, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00, 0x0a, 0x08, 0x01, 0x06, 0x00, 0x20, 0x00, 0x10, 0x00, 0x0b,
]);

describe(parseWasmModuleShape, () => {
    it("should read the export section of a module with no imports", () => {
        expect.assertions(1);

        expect(parseWasmModuleShape(ADD)).toStrictEqual({
            exports: [{ kind: "function", name: "add" }],
            imports: [],
        });
    });

    it("should read imports and non-function exports", () => {
        expect.assertions(1);

        expect(parseWasmModuleShape(WITH_IMPORT)).toStrictEqual({
            exports: [
                { kind: "function", name: "logIt" },
                { kind: "memory", name: "memory" },
            ],
            imports: [{ kind: "function", module: "./util.js", name: "log" }],
        });
    });

    it.each([
        ["add", ADD],
        ["with-import", WITH_IMPORT],
    ])("should agree with the engine's own reflection for %s", (_name, bytes) => {
        expect.assertions(2);

        const compiled = new WebAssembly.Module(bytes);
        const shape = parseWasmModuleShape(bytes);

        expect(
            shape.exports.map(({ kind, name }) => {
                return { kind, name };
            }),
        ).toStrictEqual(
            WebAssembly.Module.exports(compiled).map(({ kind, name }) => {
                return { kind, name };
            }),
        );
        expect(
            shape.imports.map(({ kind, module, name }) => {
                return { kind, module, name };
            }),
        ).toStrictEqual(
            WebAssembly.Module.imports(compiled).map(({ kind, module, name }) => {
                return { kind, module, name };
            }),
        );
    });

    it("should skip custom sections instead of failing on them", () => {
        expect.assertions(2);

        // Section id 0 (custom) with a 5-byte payload: the length-prefixed name "pack".
        const custom = Uint8Array.from([0x00, 0x05, 0x04, 0x70, 0x61, 0x63, 0x6b]);
        const withCustom = Uint8Array.from([...ADD.subarray(0, 8), ...custom, ...ADD.subarray(8)]);

        // The engine accepts the same bytes, so the section really is well-formed and
        // the reader is skipping it rather than tolerating a mistake in the fixture.
        expect(() => new WebAssembly.Module(withCustom)).not.toThrow();
        expect(parseWasmModuleShape(withCustom).exports).toStrictEqual([{ kind: "function", name: "add" }]);
    });

    it("should reject a file that is not a WebAssembly binary", () => {
        expect.assertions(1);

        expect(() => parseWasmModuleShape(Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]))).toThrow(WasmParseError);
    });

    it("should reject a file shorter than the header", () => {
        expect.assertions(1);

        expect(() => parseWasmModuleShape(Uint8Array.from([0x00, 0x61, 0x73]))).toThrow("too short");
    });

    it("should reject an unsupported binary version", () => {
        expect.assertions(1);

        const future = Uint8Array.from(ADD);

        future[4] = 0x09;

        expect(() => parseWasmModuleShape(future)).toThrow("unsupported WebAssembly binary version 9");
    });

    it("should reject a section that runs past the end of the binary", () => {
        expect.assertions(1);

        const truncated = Uint8Array.from(ADD.subarray(0, 12));

        expect(() => parseWasmModuleShape(truncated)).toThrow(WasmParseError);
    });

    it("should reject a malformed LEB128 integer rather than scanning to the end", () => {
        expect.assertions(1);

        // A section length whose continuation bit is set on every byte.
        const malformed = Uint8Array.from([...ADD.subarray(0, 8), 0x07, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

        expect(() => parseWasmModuleShape(malformed)).toThrow("malformed LEB128 integer");
    });
});
