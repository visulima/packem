import { parseAst } from "rollup/parseAst";
import { describe, expect, it, vi } from "vitest";

import { jsxRemoveAttributes } from "../../../src/plugins/jsx-remove-attributes";

const createLogger = () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn(), warn: vi.fn() }) as unknown as Console;

const NON_EMPTY_ARRAY_REGEX = /non-empty array/;

type TransformContext = {
    parse: typeof parseAst;
    warn: (warning: { code: string; message: string }) => void;
};

type TransformHandler = (this: TransformContext, code: string, id: string) => { code: string; map: unknown } | undefined;

const callTransform = (plugin: ReturnType<typeof jsxRemoveAttributes>, code: string, id: string, context_?: Partial<TransformContext>) => {
    const { transform } = plugin;
    const handler = (typeof transform === "function" ? transform : transform?.handler) as TransformHandler | undefined;
    const context: TransformContext = { parse: parseAst, warn: vi.fn(), ...context_ };

    return handler?.call(context, code, id);
};

type RenderChunkContext = {
    parse: typeof parseAst;
    warn: (warning: { code: string; message: string }) => void;
};

const callRenderChunk = (
    plugin: ReturnType<typeof jsxRemoveAttributes>,
    code: string,
    context_?: Partial<RenderChunkContext>,
) => {
    const { renderChunk } = plugin;
    const handler = (typeof renderChunk === "function" ? renderChunk : renderChunk?.handler) as
        | ((this: RenderChunkContext, code: string, chunk: { fileName: string }, options: { sourcemap: boolean }) => { code: string; map: unknown } | undefined)
        | undefined;
    // Track parse calls so "skip parse" tests can assert the parse never ran.
    const parseSpy = vi.fn(parseAst);
    const context: RenderChunkContext = { parse: parseSpy, warn: vi.fn(), ...context_ };

    return { parseSpy, result: handler?.call(context, code, { fileName: "chunk.js" }, { sourcemap: false }) };
};

describe("jsxRemoveAttributes", () => {
    it("should throw if attributes is missing or empty", () => {
        expect.assertions(2);

        // @ts-expect-error testing runtime guard
        expect(() => jsxRemoveAttributes({ logger: createLogger() })).toThrow(NON_EMPTY_ARRAY_REGEX);
        expect(() => jsxRemoveAttributes({ attributes: [], logger: createLogger() })).toThrow(NON_EMPTY_ARRAY_REGEX);
    });

    it("should return a plugin named packem:jsx-remove-attributes", () => {
        expect.assertions(1);

        const plugin = jsxRemoveAttributes({ attributes: ["data-test"], logger: createLogger() });

        expect(plugin.name).toBe("packem:jsx-remove-attributes");
    });

    it("should remove a matched attribute from a jsx() call expression", () => {
        expect.assertions(2);

        const plugin = jsxRemoveAttributes({ attributes: ["data-test"], logger: createLogger() });
        // Mimic the output of a JSX transform: jsx(Comp, { "data-test": "x", id: "real" })
        const code = `jsx(Component, { "data-test": "ignored", "id": "real" });`;
        const result = callTransform(plugin, code, "/path/file.tsx");

        expect(result?.code).not.toContain("data-test");
        expect(result?.code).toContain("\"id\": \"real\"");
    });

    it("should remove multiple matched attributes", () => {
        expect.assertions(2);

        const plugin = jsxRemoveAttributes({ attributes: ["data-test", "data-foo"], logger: createLogger() });
        const code = `jsx(Component, { "data-test": "a", "data-foo": "b", "id": "real" });`;
        const result = callTransform(plugin, code, "/path/file.tsx");

        expect(result?.code).not.toContain("data-test");
        expect(result?.code).not.toContain("data-foo");
    });

    it("should leave code unchanged when no attribute matches", () => {
        expect.assertions(1);

        const plugin = jsxRemoveAttributes({ attributes: ["data-test"], logger: createLogger() });
        const code = `jsx(Component, { "id": "real" });`;
        const result = callTransform(plugin, code, "/path/file.tsx");

        expect(result).toBeUndefined();
    });

    it("should warn and return undefined on parse errors", () => {
        expect.assertions(2);

        const logger = createLogger();
        const plugin = jsxRemoveAttributes({ attributes: ["data-test"], logger });
        const warn = vi.fn();
        // Invalid JS so parseAst throws inside the handler
        const result = callTransform(plugin, "jsx(@@@", "/path/file.tsx", { warn });

        expect(result).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(expect.objectContaining({ code: "PARSE_ERROR" }));
    });

    describe("renderChunk mode", () => {
        it("should expose a renderChunk hook (not a transform hook)", () => {
            expect.assertions(2);

            const plugin = jsxRemoveAttributes({ attributes: ["data-test"], logger: createLogger(), mode: "renderChunk" });

            expect(plugin.renderChunk).toBeDefined();
            expect(plugin.transform).toBeUndefined();
        });

        it("should skip the parse for a chunk with no jsx call", () => {
            expect.assertions(2);

            const plugin = jsxRemoveAttributes({ attributes: ["data-test"], logger: createLogger(), mode: "renderChunk" });
            const { parseSpy, result } = callRenderChunk(plugin, "const data-test = 1; export const x = 2;\n");

            expect(result).toBeUndefined();
            expect(parseSpy).not.toHaveBeenCalled();
        });

        it("should skip the parse for a jsx chunk that lacks any configured attribute", () => {
            expect.assertions(2);

            const plugin = jsxRemoveAttributes({ attributes: ["data-test"], logger: createLogger(), mode: "renderChunk" });
            const { parseSpy, result } = callRenderChunk(plugin, `jsx(Component, {\n  "id": "real",\n});\n`);

            expect(result).toBeUndefined();
            expect(parseSpy).not.toHaveBeenCalled();
        });

        it("should strip a first-position attribute (multi-line trailing comma)", () => {
            expect.assertions(2);

            const plugin = jsxRemoveAttributes({ attributes: ["data-test"], logger: createLogger(), mode: "renderChunk" });
            const code = `jsx(Component, {\n  "data-test": "a",\n  "id": "real",\n});\n`;
            const { result } = callRenderChunk(plugin, code);

            expect(result?.code).not.toContain("data-test");
            expect(result?.code).toContain(`"id": "real"`);
        });

        it("should strip a middle-position attribute (multi-line trailing comma)", () => {
            expect.assertions(2);

            const plugin = jsxRemoveAttributes({ attributes: ["data-test"], logger: createLogger(), mode: "renderChunk" });
            const code = `jsxs(Component, {\n  "a": 1,\n  "data-test": "x",\n  "b": 2,\n});\n`;
            const { result } = callRenderChunk(plugin, code);

            expect(result?.code).not.toContain("data-test");
            expect(result?.code).toContain(`"b": 2`);
        });

        it("should strip a last-position attribute (multi-line trailing comma)", () => {
            expect.assertions(2);

            const plugin = jsxRemoveAttributes({ attributes: ["data-test"], logger: createLogger(), mode: "renderChunk" });
            const code = `jsxDEV(Component, {\n  "id": "real",\n  "data-test": "x",\n});\n`;
            const { result } = callRenderChunk(plugin, code);

            expect(result?.code).not.toContain("data-test");
            expect(result?.code).toContain(`"id": "real"`);
        });
    });
});
