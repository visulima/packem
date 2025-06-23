import { describe, expect, it } from "vitest";

import fixDynamicImportExtension from "../../../../src/rollup/plugins/fix-dynamic-import-extension";

describe(fixDynamicImportExtension, () => {
    it("should return a plugin object", () => {
        expect.assertions(3);

        const plugin = fixDynamicImportExtension();

        expect(plugin).toBeInstanceOf(Object);
        expect(plugin.name).toBe("packem:fix-dynamic-import-extension");
        expect(plugin.renderChunk).toBeInstanceOf(Function);
    });

    describe("renderChunk", () => {
        const plugin = fixDynamicImportExtension();
        const renderChunk = plugin.renderChunk as (code: string, chunk: unknown, options: { format: string }) => ({ code: string; map: undefined } | undefined);

        it("should replace .ts with .mjs for es format", () => {
            expect.assertions(1);

            const code = "import('./module.ts')";
            const result = renderChunk(code, {}, { format: "es" });

            expect(result?.code).toBe("import('./module.mjs')");
        });

        it("should replace .ts with .cjs for cjs format", () => {
            expect.assertions(1);

            const code = "import('./module.ts')";
            const result = renderChunk(code, {}, { format: "cjs" });

            expect(result?.code).toBe("import('./module.cjs')");
        });

        it("should not modify code for other formats", () => {
            expect.assertions(1);

            const code = "import('./module.ts')";
            const result = renderChunk(code, {}, { format: "umd" });

            expect(result).toBeUndefined();
        });

        it("should handle different quote styles", () => {
            expect.assertions(3);

            const code1 = "import('./module.ts')";
            const code2 = "import(\"./module.ts\")";
            const code3 = "import(`./module.ts`)";
            const result1 = renderChunk(code1, {}, { format: "es" });
            const result2 = renderChunk(code2, {}, { format: "es" });
            const result3 = renderChunk(code3, {}, { format: "es" });

            expect(result1?.code).toBe("import('./module.mjs')");
            expect(result2?.code).toBe("import(\"./module.mjs\")");
            expect(result3?.code).toBe("import(`./module.mjs`)");
        });

        it("should handle multiple dynamic imports", () => {
            expect.assertions(1);

            const code = "import('./module1.ts'); import('./module2.ts');";
            const result = renderChunk(code, {}, { format: "es" });

            expect(result?.code).toBe("import('./module1.mjs'); import('./module2.mjs');");
        });

        it("should not replace .ts in other contexts", () => {
            expect.assertions(1);

            const code = "const path = './module.ts'; import(path);";
            const result = renderChunk(code, {}, { format: "es" });

            expect(result?.code).toBe("const path = './module.ts'; import(path);");
        });

        it("should not replace .ts in non-import contexts", () => {
            expect.assertions(2);

            const code = "const a = 'some/path/to/a/file.ts'; const b = { path: \"another.ts\" };";
            const result = renderChunk(code, {}, { format: "es" });

            expect(result?.code).toBe("const a = 'some/path/to/a/file.ts'; const b = { path: \"another.ts\" };");

            const code2 = `if ((input.endsWith(".ts") || input.endsWith(".cts") || input.endsWith(".mts")) && isAccessibleSync(input)) {`;
            const result2 = renderChunk(code2, {}, { format: "es" });

            expect(result2?.code).toBe(code2);
        });

        it("should not replace .d.ts extensions", () => {
            expect.assertions(3);

            const code1 = "import('./types.d.ts')";
            const result1 = renderChunk(code1, {}, { format: "es" });

            expect(result1?.code).toBe("import('./types.d.ts')");

            const code2 = "import('./types.d.ts')";
            const result2 = renderChunk(code2, {}, { format: "cjs" });

            expect(result2?.code).toBe("import('./types.d.ts')");

            const code3 = "import('./module.ts'); import('./types.d.ts'); import('./utils.ts');";
            const result3 = renderChunk(code3, {}, { format: "es" });

            expect(result3?.code).toBe("import('./module.mjs'); import('./types.d.ts'); import('./utils.mjs');");
        });
    });
});
