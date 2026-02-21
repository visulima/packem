import type { NormalizedOutputOptions, PluginContext, RenderedChunk } from "rollup";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { fixDtsDefaultCjsExportsPlugin } from "../../../src/plugins/fix-dts-default-cjs-exports";

const mockWarn = vi.fn();

const getCode = (result: string | { code: string } | null | undefined): string | undefined => {
    if (typeof result === "string") {
        return result;
    }

    if (result && typeof result === "object" && typeof result.code === "string") {
        return result.code;
    }

    return undefined;
};

// TODO: Refactor this test to use the new fixDtsDefaultCJSExports function, when work starts on packem v2
describe(fixDtsDefaultCjsExportsPlugin, () => {
    it("should return a plugin object", () => {
        expect.assertions(2);

        const plugin = fixDtsDefaultCjsExportsPlugin();

        expect(plugin).toBeInstanceOf(Object);
        expect(plugin.name).toBe("packem:fix-dts-default-cjs-exports-plugin");

        expectTypeOf(plugin.renderChunk).toBeFunction();
    });

    describe("renderChunk", () => {
        let renderChunk: (
            code: string,
            chunk: Partial<RenderedChunk>,
            options: NormalizedOutputOptions,
            meta: { chunks: Record<string, RenderedChunk> },
        ) => string | { code: string; map?: unknown } | null | undefined;

        beforeEach(() => {
            const pluginInstance = fixDtsDefaultCjsExportsPlugin();
            const rollupContext = { warn: mockWarn } as unknown as PluginContext;

            const directRenderChunk = pluginInstance.renderChunk as unknown as (
                this: PluginContext,
                code: string,
                chunk: RenderedChunk,
                options: NormalizedOutputOptions,
                meta: { chunks: Record<string, RenderedChunk> },
            ) => string | { code: string; map?: unknown } | null | undefined;

            if (typeof directRenderChunk !== "function") {
                throw new TypeError("fixDtsDefaultCjsExportsPlugin.renderChunk is not a function");
            }

            renderChunk = (code, chunk, options, meta) => directRenderChunk.call(rollupContext, code, chunk as RenderedChunk, options, meta);
        });

        afterEach(() => {
            mockWarn.mockClear();
        });

        it("should not transform if not a .d.ts, .d.mts or .d.cts file", () => {
            expect.assertions(4);

            const code = "export { MyClass as default };";
            const chunkInfoJs: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.js",
                isEntry: true,
                type: "chunk",
            };
            const chunkInfoTs: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.ts",
                isEntry: true,
                type: "chunk",
            };
            const chunkInfoOther: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.tsx",
                isEntry: true,
                type: "chunk",
            };

            expect(renderChunk(code, chunkInfoJs, {} as NormalizedOutputOptions, { chunks: {} })).toBeUndefined();
            expect(renderChunk(code, chunkInfoTs, {} as NormalizedOutputOptions, { chunks: {} })).toBeUndefined();
            expect(renderChunk(code, chunkInfoOther, {} as NormalizedOutputOptions, { chunks: {} })).toBeUndefined();
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should not transform if not an entry chunk", () => {
            expect.assertions(2);

            const code = "export { MyClass as default };";
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                isEntry: false,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });

            expect(result).toBeUndefined();
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should not transform if no default export in chunk.exports", () => {
            expect.assertions(2);

            const code = "export class MyClass {}";
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["MyClass"],
                fileName: "test.d.ts",
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });

            expect(result).toBeUndefined();
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should transform a simple default export: export { MyClass as default }", () => {
            expect.assertions(2);

            const code = `declare class MyClass {\n    constructor();\n}\nexport { MyClass as default };`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                imports: [],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const expectedCode = `declare class MyClass {\n    constructor();\n}\nexport = MyClass;`;

            expect(getCode(result)?.trim().replaceAll("\r\n", "\n")).toBe(expectedCode.trim().replaceAll("\r\n", "\n"));
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should transform default export and named type export: export { MyClass as default, type AnotherType }", () => {
            expect.assertions(2);

            const code = `declare class MyClass { constructor(); }\ndeclare interface AnotherType { prop: string; }\nexport { MyClass as default, type AnotherType };`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default", "AnotherType"],
                fileName: "test.d.ts",
                imports: [],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const expectedCode = `// @ts-ignore\nMyClass;\nexport type { AnotherType };\ndeclare namespace MyClass {\n    export class MyClass { constructor(); }\n    import _default = MyClass;\n    export { _default as default };\n}\nexport = MyClass;`;

            expect(getCode(result)?.trim().replaceAll("\r\n", "\n")).toBe(expectedCode.trim().replaceAll("\r\n", "\n"));
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should transform 'export { default } from some-module' for .d.ts", () => {
            expect.assertions(2);

            const code = "export { default } from 'some-module';";
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                imports: [],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const expectedCode = `import _default from 'some-module';\nexport = _default;`;

            expect(getCode(result)?.trim().replaceAll("\r\n", "\n")).toBe(expectedCode.trim().replaceAll("\r\n", "\n"));
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should transform 'export { default } from some-module' for .d.cts", () => {
            expect.assertions(2);

            const code = "export { default } from 'some-module';";
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.cts",
                imports: [],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const expectedCode = `import _default from 'some-module';\nexport = _default;`;

            expect(getCode(result)?.trim().replaceAll("\r\n", "\n")).toBe(expectedCode.trim().replaceAll("\r\n", "\n"));
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should transform 'export { name as default } from some-module'", () => {
            expect.assertions(2);

            const code = "export { originalName as default } from 'some-module';";
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                imports: [],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const expectedCode = `import { originalName } from 'some-module';\nexport = originalName;`;

            expect(getCode(result)?.trim().replaceAll("\r\n", "\n")).toBe(expectedCode.trim().replaceAll("\r\n", "\n"));
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should handle 'export default from some-module;' (mlly quirk)", () => {
            expect.assertions(2);

            const code = `export default from 'some-module';`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                imports: [],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const expectedCode = `import _default from 'some-module';\nexport = _default;`;

            expect(getCode(result)?.trim().replaceAll("\r\n", "\n")).toBe(expectedCode.trim().replaceAll("\r\n", "\n"));
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should transform 'import Name from module; export { Name as default };'", () => {
            expect.assertions(2);

            const code = `import MyDefaultImport from 'some-module';\nexport { MyDefaultImport as default };`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                imports: ["some-module"],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const expectedCode = `import MyDefaultImport from 'some-module';\nexport = MyDefaultImport;`;

            expect(getCode(result)?.trim().replaceAll("\r\n", "\n")).toBe(expectedCode.trim().replaceAll("\r\n", "\n"));
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should transform 'import { Named } from module; export { Named as default };'", () => {
            expect.assertions(2);

            const code = `import { NamedImport } from 'some-module';\nexport { NamedImport as default };`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                imports: ["some-module"],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const expectedCode = `import { NamedImport } from 'some-module';\nexport = NamedImport;`;

            expect(getCode(result)?.trim().replaceAll("\r\n", "\n")).toBe(expectedCode.trim().replaceAll("\r\n", "\n"));
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should create namespace for: export { MyClass as default, type AnotherType, anotherVar }", () => {
            expect.assertions(2);

            const code = `declare class MyClass { constructor(); }\ndeclare interface AnotherType { prop: string; }\ndeclare const anotherVar: number;\nexport { MyClass as default, type AnotherType, anotherVar };`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default", "AnotherType", "anotherVar"],
                fileName: "test.d.ts",
                imports: [],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const expectedCode = `// @ts-ignore\nMyClass;\nexport type { AnotherType };\nexport { anotherVar };\ndeclare namespace MyClass {\n    export class MyClass { constructor(); }\n    export const anotherVar: number;\n    import _default = MyClass;\n    export { _default as default };\n}\nexport = MyClass;`;

            expect(getCode(result)?.trim().replaceAll("\r\n", "\n")).toBe(expectedCode.trim().replaceAll("\r\n", "\n"));
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should correctly handle exports from a re-exported module with default and named: export { default, named } from './other'", () => {
            expect.assertions(2);

            const code = "export { default, namedExport } from 'some-module';";
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default", "namedExport"],
                fileName: "test.d.ts",
                imports: ["some-module"],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const expectedCode = `import _default from 'some-module';\n// @ts-ignore\nexport = _default;\nexport { namedExport } from 'some-module';`;

            expect(getCode(result)?.trim().replaceAll("\r\n", "\n")).toBe(expectedCode.trim().replaceAll("\r\n", "\n"));
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should warn and not transform if default export name cannot be parsed from import", () => {
            expect.assertions(2);

            const code = "export { default as default } from 'some-module';";
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });

            expect(mockWarn).toHaveBeenCalledExactlyOnceWith(
                `Cannot parse default export name from some-module import at test.d.ts!. The module might not have a default export, or it's aliased as 'default'.`,
            );
            expect(result).toBeUndefined();
        });

        it("should handle type-only exports and call createCjsNamespace", () => {
            expect.assertions(1);

            const code = `declare type Foo = string;\ndeclare type Bar = number;\nexport { type Foo, type Bar };`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["Foo", "Bar"],
                fileName: "test.d.ts",
                imports: [],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });

            // The plugin should identify this as a pure type export case and return just the type exports.
            // It internally calls createCjsNamespace which should return the preamble directly.
            expect(getCode(result)?.trim()).toBe("export type { Foo, Bar };");
        });

        it("should return undefined if matcher returns false (not a .d.ts file)", () => {
            expect.assertions(1);

            const code = `declare class MyClass {}`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.js",
                imports: [],
                isEntry: true,
                type: "chunk",
            };
            const plugin = fixDtsDefaultCjsExportsPlugin();
            const mockContext = { warn: vi.fn() } as unknown as PluginContext;

            const result =
                typeof plugin.renderChunk === "function"
                    ? plugin.renderChunk.call(
                          mockContext,
                          code,
                          chunkInfo as RenderedChunk,
                          {} as NormalizedOutputOptions,
                          { chunks: {} } as { chunks: Record<string, RenderedChunk> },
                      )
                    : undefined;

            expect(result).toBeUndefined();
        });

        it("should return undefined if info.isEntry is false", () => {
            expect.assertions(1);

            const code = `declare class MyClass {}`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                imports: [],
                isEntry: false,
                type: "chunk",
            };
            const plugin = fixDtsDefaultCjsExportsPlugin();
            const mockContext = { warn: vi.fn() } as unknown as PluginContext;

            const result =
                typeof plugin.renderChunk === "function"
                    ? plugin.renderChunk.call(
                          mockContext,
                          code,
                          chunkInfo as RenderedChunk,
                          {} as NormalizedOutputOptions,
                          { chunks: {} } as { chunks: Record<string, RenderedChunk> },
                      )
                    : undefined;

            expect(result).toBeUndefined();
        });

        it("should handle value exports alongside default export (namespace and CJS)", () => {
            expect.assertions(2);

            const code = `declare const test: () => string;\ndeclare const test2 = "this should be in final bundle, test2 string";\nexport { test as default, test2 };`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default", "test2"],
                fileName: "test.d.ts",
                imports: [],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const output = getCode(result);

            expect(output).toContain("export { test2 }");
            expect(output).toContain("export = test");
        });

        it("should transform 'import { a } from \"utils/a\"; export default a;'", () => {
            expect.assertions(2);

            const code = `import { a } from "utils/a";\nexport default a;`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                imports: ["utils/a"],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const expectedCode = `import { a } from "utils/a";\nexport = a;`;

            expect(getCode(result)?.trim().replaceAll("\r\n", "\n")).toBe(expectedCode.trim().replaceAll("\r\n", "\n"));
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should handle TSModuleDeclaration and TSImportEqualsDeclaration processed by createCjsNamespace (L272-273, L280-281 coverage)", () => {
            expect.assertions(2);

            const code = `declare module "my-module" {}\nimport fs = require("fs");\ndeclare const anotherVal: number;\nexport { fs as default, anotherVal };`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default", "anotherVal"],
                fileName: "test.d.ts",
                imports: [],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const resultOutput = getCode(result)?.trim().replaceAll("\r\n", "\n");

            const expectedPreamble = `// @ts-ignore\nfs;\nexport { anotherVal };`;

            expect(resultOutput).toBe(expectedPreamble.trim());
            expect(mockWarn).toHaveBeenCalledExactlyOnceWith("Cannot infer default export from the file: test.d.ts. Declaration for 'fs' not found.");
        });

        it("should return transformedCode if no defaultExport and transformedCode does not start with 'export type' (L325-328)", () => {
            expect.assertions(2);

            const code = `export {}; // Empty export, no default`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                isEntry: true,
                type: "chunk",
            };

            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });

            expect(result).toBeUndefined();
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should warn if defaultLocalExport is not found (L327-330)", () => {
            expect.assertions(1);

            const codeWithMissingDeclAndType = `declare interface AnotherType {}; export { MissingVar as default, type AnotherType };`;
            const chunkInfoWithMissingDeclAndType: Partial<RenderedChunk> = {
                exports: ["default", "AnotherType"],
                fileName: "test.d.ts",
                isEntry: true,
                type: "chunk",
            };

            renderChunk(codeWithMissingDeclAndType, chunkInfoWithMissingDeclAndType, {} as NormalizedOutputOptions, { chunks: {} });

            expect(mockWarn).toHaveBeenCalledExactlyOnceWith(
                expect.stringContaining("Cannot infer default export from the file: test.d.ts. Declaration for 'MissingVar' not found."),
            );
        });

        it("should correctly create namespace with multiple declarations (L340-359)", () => {
            expect.assertions(2);

            const code = `declare class MyClass { constructor(); }\ndeclare function myFunction(): void;\nexport { MyClass as default, myFunction };`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default", "myFunction"],
                fileName: "test.d.ts",
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const output = getCode(result)?.trim().replaceAll("\r\n", "\n");
            const expectedNamespace = `\n// @ts-ignore\nMyClass;\nexport { myFunction };\ndeclare namespace MyClass {\n    export class MyClass { constructor(); }\n    export function myFunction(): void;\n    import _default = MyClass;\n    export { _default as default };\n}\nexport = MyClass;`;

            expect(output).toBe(expectedNamespace.trim());
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("should handle decl.declare true/false for namespacing (L352-355)", () => {
            expect.assertions(2);

            const code = `declare class MyClass { constructor(); }\nconst myVar = 42;\nexport { MyClass as default, myVar };`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default", "myVar"],
                fileName: "test.d.ts",
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const output = getCode(result)?.trim().replaceAll("\r\n", "\n");
            const expectedNamespace = `\n// @ts-ignore\nMyClass;\nexport { myVar };\ndeclare namespace MyClass {\n    export class MyClass { constructor(); }\n    export const myVar = 42;\n    import _default = MyClass;\n    export { _default as default };\n}\nexport = MyClass;`;

            expect(output).toBe(expectedNamespace.trim());
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("handleDefaultCJSExportAsDefault: should prepend import if no existing imports (L388-406)", () => {
            expect.assertions(2);

            const code = `export { default } from 'some-module';`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                imports: [],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const expected = `import _default from 'some-module';\nexport = _default;`;

            expect(getCode(result)?.trim().replaceAll("\r\n", "\n")).toBe(expected.trim());
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("handleDefaultCJSExportAsDefault: should append import if existing imports (L388-406)", () => {
            expect.assertions(2);

            const code = `import "./another";\nexport { default } from 'some-module';`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                imports: ["./another"],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const expected = `import "./another";\nimport _default from 'some-module';\nexport = _default;`;

            expect(getCode(result)?.trim().replaceAll("\r\n", "\n")).toBe(expected.trim());
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("handleDefaultCJSExportAsDefault: should create namespace if exportList has items (L393, L403)", () => {
            expect.assertions(2);

            const code = `import "./another";\nexport { default, anotherExport } from 'some-module';`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default", "anotherExport"],
                fileName: "test.d.ts",
                imports: ["./another", "some-module"],
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const output = getCode(result)?.trim().replaceAll("\r\n", "\n");
            const expectedOutput = `import "./another";\nimport _default from 'some-module';\n// @ts-ignore\nexport = _default;\nexport { anotherExport } from 'some-module';`;

            expect(output).toBe(expectedOutput.trim());
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("handleNoSpecifierDefaultCJSExport: should create namespace for local default and named value export", () => {
            expect.assertions(2);

            const code = `import { MyNamedImport } from 'some-module';
declare class MyNamedImport { constructor(); }
declare const anotherValue: number;
export { MyNamedImport as default, anotherValue };`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default", "anotherValue"],
                fileName: "test.d.ts",
                imports: ["some-module"], // This import is in the code, but the export is local (no 'from')
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const output = getCode(result)?.trim().replaceAll("\r\n", "\n");
            // This test, despite its old name, currently tests handleNoSpecifierDefaultCJSExport
            // due to its input code `export { MyNamedImport as default, anotherValue };` (no 'from ...')
            const expected = `// @ts-ignore
MyNamedImport;
export { anotherValue };
declare namespace MyNamedImport {
    export class MyNamedImport { constructor(); }
    export const anotherValue: number;
    import _default = MyNamedImport;
    export { _default as default };
}
export = MyNamedImport;`;

            expect(output).toBe(expected.trim());
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("handleDefaultNamedCJSExport: should warn if import exists but does not provide alias", () => {
            expect.assertions(2);

            const code = `import { SomethingElse } from 'some-module';
export { MyNamedImport as default } from 'some-module';`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                imports: ["some-module"], // Crucial: import exists
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });

            expect(result).toBeUndefined();
            expect(mockWarn).toHaveBeenCalledExactlyOnceWith(`Cannot parse "MyNamedImport" named export from some-module import at test.d.ts!.`);
        });

        it("handleDefaultNamedCJSExport: re-export with alias and others, existing import provides alias", () => {
            expect.assertions(2);

            const code = `import { N, X } from 'mod'; // N is aliased default, X is other member of mod
declare class N { constructor(val: number); }
declare const X: number;
declare const Y: string; // Y will be re-exported by name from mod
export { N as default, Y } from 'mod';`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default", "Y"],
                fileName: "test.d.ts",
                imports: ["mod"], // Crucial: import from 'mod' exists
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const output = getCode(result)?.trim().replaceAll("\r\n", "\n");
            const expected = `import { N, X } from 'mod'; // N is aliased default, X is other member of mod
declare class N { constructor(val: number); }
declare const X: number;
declare const Y: string; // Y will be re-exported by name from mod
export { Y } from 'mod';
declare namespace N {
    export class N { constructor(val: number); }
    export const X: number;
    export const Y: string;
    import _default = N;
    export { _default as default };
}
export = N;`;

            expect(output).toBe(expected.trim());
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("handleDefaultNamedCJSExport: re-export with alias and others, NO existing import for module", () => {
            expect.assertions(2);

            const code = `declare class N { constructor(val: number); }
declare const Y: string;
export { N as default, Y } from 'mod';`; // N and Y re-exported, no import from 'mod'
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default", "Y"],
                fileName: "test.d.ts",
                imports: [], // Crucial: no import from 'mod' initially
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const output = getCode(result)?.trim().replaceAll("\r\n", "\n");
            const expected = `import { N } from 'mod';
declare class N { constructor(val: number); }
declare const Y: string;
export { Y } from 'mod';
declare namespace N {
    export class N { constructor(val: number); }
    export const Y: string;
    import _default = N;
    export { _default as default };
}
export = N;`;

            expect(output).toBe(expected.trim());
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("handleDefaultCJSExportAsDefault: existing import, no other exports in list", () => {
            expect.assertions(2);

            const code = `import ActualDefaultName from 'some-module';
export { default } from 'some-module';`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default"],
                fileName: "test.d.ts",
                imports: ["some-module"], // Indicates an import from 'some-module' exists
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const output = getCode(result)?.trim().replaceAll("\r\n", "\n");
            const expected = `import ActualDefaultName from 'some-module';
export = ActualDefaultName;`;

            expect(output).toBe(expected.trim());
            expect(mockWarn).not.toHaveBeenCalled();
        });

        it("handleDefaultCJSExportAsDefault: existing import, with other exports in list", () => {
            expect.assertions(2);

            const code = `import ActualDefaultName from 'some-module';
export { default, namedItem } from 'some-module';`;
            const chunkInfo: Partial<RenderedChunk> = {
                exports: ["default", "namedItem"],
                fileName: "test.d.ts",
                imports: ["some-module"], // Indicates an import from 'some-module' exists
                isEntry: true,
                type: "chunk",
            };
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, { chunks: {} });
            const output = getCode(result)?.trim().replaceAll("\r\n", "\n");
            const expected = `import ActualDefaultName from 'some-module';
// @ts-ignore
export = ActualDefaultName;
export { namedItem } from 'some-module';`;

            expect(output).toBe(expected.trim());
            expect(mockWarn).not.toHaveBeenCalled();
        });
    });
});
