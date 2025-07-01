import { describe, expect, it } from "vitest";
import type { NormalizedOutputOptions, RenderedChunk } from "rollup";

import fixDynamicImportExtension from "../../../src/plugins/fix-dynamic-import-extension";

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
        const renderChunk = plugin.renderChunk as (
            code: string,
            chunk: RenderedChunk,
            options: NormalizedOutputOptions
        ) => ({ code: string; map: any } | undefined);

        it("should replace .ts with .mjs for es format", () => {
            expect.assertions(1);

            const code = "import('./module.ts')";
            const result = renderChunk(code, {} as RenderedChunk, { format: "es", sourcemap: false } as NormalizedOutputOptions);

            expect(result?.code).toBe("import('./module.mjs')");
        });

        it("should replace .ts with .cjs for cjs format", () => {
            expect.assertions(1);

            const code = "import('./module.ts')";
            const result = renderChunk(code, {} as RenderedChunk, { format: "cjs", sourcemap: false } as NormalizedOutputOptions);

            expect(result?.code).toBe("import('./module.cjs')");
        });

        it("should not modify code for other formats", () => {
            expect.assertions(1);

            const code = "import('./module.ts')";
            const result = renderChunk(code, {} as RenderedChunk, { format: "umd", sourcemap: false } as NormalizedOutputOptions);

            expect(result).toBeUndefined();
        });

        it("should handle different quote styles", () => {
            expect.assertions(3);

            const code1 = "import('./module.ts')";
            const code2 = "import(\"./module.ts\")";
            const code3 = "import(`./module.ts`)";
            const result1 = renderChunk(code1, {} as RenderedChunk, { format: "es", sourcemap: false } as NormalizedOutputOptions);
            const result2 = renderChunk(code2, {} as RenderedChunk, { format: "es", sourcemap: false } as NormalizedOutputOptions);
            const result3 = renderChunk(code3, {} as RenderedChunk, { format: "es", sourcemap: false } as NormalizedOutputOptions);

            expect(result1?.code).toBe("import('./module.mjs')");
            expect(result2?.code).toBe("import(\"./module.mjs\")");
            expect(result3?.code).toBe("import(`./module.mjs`)");
        });

        it("should handle multiple dynamic imports", () => {
            expect.assertions(1);

            const code = "import('./module1.ts'); import('./module2.ts');";
            const result = renderChunk(code, {} as RenderedChunk, { format: "es", sourcemap: false } as NormalizedOutputOptions);

            expect(result?.code).toBe("import('./module1.mjs'); import('./module2.mjs');");
        });

        it("should return undefined when no .ts extensions in dynamic imports", () => {
            expect.assertions(1);

            const code = "const path = './module.ts'; import(path);";
            const result = renderChunk(code, {} as RenderedChunk, { format: "es", sourcemap: false } as NormalizedOutputOptions);

            expect(result).toBeUndefined();
        });

        it("should return undefined when .ts is not in dynamic import contexts", () => {
            expect.assertions(2);

            const code = "const a = 'some/path/to/a/file.ts'; const b = { path: \"another.ts\" };";
            const result = renderChunk(code, {} as RenderedChunk, { format: "es", sourcemap: false } as NormalizedOutputOptions);

            expect(result).toBeUndefined();

            const code2 = `if ((input.endsWith(".ts") || input.endsWith(".cts") || input.endsWith(".mts")) && isAccessibleSync(input)) {`;
            const result2 = renderChunk(code2, {} as RenderedChunk, { format: "es", sourcemap: false } as NormalizedOutputOptions);

            expect(result2).toBeUndefined();
        });

        it("should not replace .d.ts extensions", () => {
            expect.assertions(3);

            const code1 = "import('./types.d.ts')";
            const result1 = renderChunk(code1, {} as RenderedChunk, { format: "es", sourcemap: false } as NormalizedOutputOptions);

            expect(result1).toBeUndefined();

            const code2 = "import('./types.d.ts')";
            const result2 = renderChunk(code2, {} as RenderedChunk, { format: "cjs", sourcemap: false } as NormalizedOutputOptions);

            expect(result2).toBeUndefined();

            const code3 = "import('./module.ts'); import('./types.d.ts'); import('./utils.ts');";
            const result3 = renderChunk(code3, {} as RenderedChunk, { format: "es", sourcemap: false } as NormalizedOutputOptions);

            expect(result3?.code).toBe("import('./module.mjs'); import('./types.d.ts'); import('./utils.mjs');");
        });

        it("should generate sourcemap when sourcemap is enabled", () => {
            expect.assertions(2);

            const code = "import('./module.ts')";
            const result = renderChunk(code, {} as RenderedChunk, { format: "es", sourcemap: true } as NormalizedOutputOptions);

            expect(result?.code).toBe("import('./module.mjs')");
            expect(result?.map).toBeDefined();
        });

        it("should not generate sourcemap when sourcemap is disabled", () => {
            expect.assertions(2);

            const code = "import('./module.ts')";
            const result = renderChunk(code, {} as RenderedChunk, { format: "es", sourcemap: false } as NormalizedOutputOptions);

            expect(result?.code).toBe("import('./module.mjs')");
            expect(result?.map).toBeUndefined();
        });

        it("should return undefined when no changes are made", () => {
            expect.assertions(1);

            const code = "import('./module.js')"; // No .ts extension
            const result = renderChunk(code, {} as RenderedChunk, { format: "es", sourcemap: true } as NormalizedOutputOptions);

            expect(result).toBeUndefined();
        });
    });
});
