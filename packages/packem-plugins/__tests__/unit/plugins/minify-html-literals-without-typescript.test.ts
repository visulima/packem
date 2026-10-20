import { describe, expect, it, vi } from "vitest";

import { minifyHTMLLiteralsPlugin } from "../../../src/plugins/minify-html-literals";

vi.mock("node:module", () => {
    const missingTypescript = (): never => {
        throw new Error("Cannot find module 'typescript'");
    };

    return {
        createRequire: () => missingTypescript,
    };
});

type TransformResult = { code: string; map?: unknown } | undefined;
type TransformFunction = (code: string, id: string) => Promise<TransformResult>;

describe("minify-html-literals without typescript", () => {
    it("loads and warns instead of crashing", async () => {
        expect.assertions(2);

        const warn = vi.fn<(message: unknown) => void>();
        const logger = {
            debug: vi.fn<() => void>(),
            error: vi.fn<() => void>(),
            info: vi.fn<() => void>(),
            warn,
        } as unknown as Console;
        const plugin = minifyHTMLLiteralsPlugin({ logger });
        const transform = plugin.transform as unknown as TransformFunction;

        const result = await transform("const template = html`<div>Hello</div>`;", "test.js");

        expect(result).toBeUndefined();
        expect(warn).toHaveBeenCalledExactlyOnceWith({
            message: "Cannot find module 'typescript'",
            prefix: "plugin:minify-html-literals",
        });
    });
});
