import { describe, expect, it, vi } from "vitest";

import { minifyHTMLLiteralsPlugin } from "../../../src/plugins/minify-html-literals";

type TransformResult = { code: string; map?: unknown } | undefined;
type TransformFunction = (code: string, id: string) => Promise<TransformResult>;

const HTML_JS_RE = /\.html\.js$/;

const createMockLogger = (): Console =>
    ({
        debug: vi.fn<() => void>(),
        error: vi.fn<() => void>(),
        info: vi.fn<() => void>(),
        warn: vi.fn<() => void>(),
    }) as unknown as Console;

describe(minifyHTMLLiteralsPlugin, () => {
    it("should return a plugin object", () => {
        expect.assertions(3);

        const logger = createMockLogger();

        const plugin = minifyHTMLLiteralsPlugin({ logger });

        expect(plugin).toBeInstanceOf(Object);
        expect(plugin.name).toBe("packem:minify-html-literals");
        expect(plugin.transform).toBeInstanceOf(Function);
    });

    describe("transform", () => {
        const logger = createMockLogger();

        const plugin = minifyHTMLLiteralsPlugin({ logger });
        const transform = plugin.transform as unknown as TransformFunction;

        it("should minify HTML in tagged template literals", async () => {
            expect.assertions(2);

            const code = `
                import { html } from 'lit';
                const template = html\`<div class="container">
                    <h1>Hello World</h1>
                    <p>This is a test</p>
                </div>\`;
            `;

            const result = await transform(code, "test.js");

            expect(result).toBeDefined();
            expect(result?.code).toContain('<div class="container"><h1>Hello World</h1><p>This is a test</p></div>');
        });

        it("should minify CSS in tagged template literals", async () => {
            expect.assertions(2);

            const code = `
                const css = css\`
                    .container {
                        display: flex;
                        justify-content: center;
                    }
                \`;
            `;

            const result = await transform(code, "test.js");

            expect(result).toBeDefined();
            expect(result?.code).toContain(".container{display:flex;justify-content:center}");
        });

        it("should handle files that don't match the filter", async () => {
            expect.assertions(1);

            const pluginWithFilter = minifyHTMLLiteralsPlugin({
                include: HTML_JS_RE,
                logger,
            });
            const transformWithFilter = pluginWithFilter.transform as unknown as TransformFunction;

            const code = "const template = html`<div>Hello</div>`;";
            const result = await transformWithFilter(code, "test.js");

            expect(result).toBeUndefined();
        });
    });
});
