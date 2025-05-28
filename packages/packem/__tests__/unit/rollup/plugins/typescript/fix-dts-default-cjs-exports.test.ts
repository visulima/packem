import type { NormalizedOutputOptions, PluginContext, RenderedChunk } from "rollup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fixDtsDefaultCjsExportsPlugin } from "../../../../../src/rollup/plugins/typescript/fix-dts-default-cjs-exports";

const mockWarn = vi.fn();

const getCode = (result: any): string | undefined => {
    if (typeof result === "string") {
        return result;
    }

    if (typeof result === "object" && typeof result.code === "string") {
        return result.code;
    }

    return undefined;
};

describe(fixDtsDefaultCjsExportsPlugin, () => {
    it("should return a plugin object", () => {
        expect.assertions(3);

        const plugin = fixDtsDefaultCjsExportsPlugin();

        expect(plugin).toBeInstanceOf(Object);
        expect(plugin.name).toBe("packem:fix-dts-default-cjs-exports-plugin");
        expect(typeof plugin.renderChunk).toBe("function");
    });

    describe("renderChunk", () => {
        let renderChunk: (
            code: string,
            chunk: Partial<RenderedChunk>,
            options: NormalizedOutputOptions,
            meta: any
        ) => string | { code: string; map?: unknown } | null | undefined;

        beforeEach(() => {
            const plugin = fixDtsDefaultCjsExportsPlugin();
            const rollupContext = { warn: mockWarn } as unknown as PluginContext;

            renderChunk = plugin.renderChunk.bind(rollupContext);
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

            expect(renderChunk(code, chunkInfoJs, {} as NormalizedOutputOptions, {})).toBeUndefined();
            expect(renderChunk(code, chunkInfoTs, {} as NormalizedOutputOptions, {})).toBeUndefined();
            expect(renderChunk(code, chunkInfoOther, {} as NormalizedOutputOptions, {})).toBeUndefined();
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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});

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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});

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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});
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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});
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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});
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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});
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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});
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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});
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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});
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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});
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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});
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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});
            const expectedCode = `import _default from 'some-module';\n// @ts-ignore\nexport = _default;\nexport { namedExport } from 'some-module'`;

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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});

            expect(mockWarn).toHaveBeenCalledWith(
                `Cannot parse default export name from some-module import at test.d.ts!.`,
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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});

            // Should include a namespace and type exports
            expect(getCode(result)).toBe("export type { Foo, Bar }");
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
            const result = plugin.renderChunk?.(code, chunkInfo as any);

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
            const result = plugin.renderChunk?.(code, chunkInfo as any);

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
            const result = renderChunk(code, chunkInfo, {} as NormalizedOutputOptions, {});
            const output = getCode(result);

            expect(output).toContain("export { test2 }");
            expect(output).toContain("export = test");
        });
    });
});
