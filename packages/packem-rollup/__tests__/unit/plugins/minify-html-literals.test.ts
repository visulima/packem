import type { Pail } from "@visulima/pail";
import { describe, expect, it, vi } from "vitest";

import { minifyHTMLLiteralsPlugin } from "../../../src/plugins/minify-html-literals";

describe(minifyHTMLLiteralsPlugin, () => {
    it("should return a plugin object", () => {
        expect.assertions(3);

        const logger = {
            debug: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
        } as unknown as Pail;

        const plugin = minifyHTMLLiteralsPlugin({ logger });

        expect(plugin).toBeInstanceOf(Object);
        expect(plugin.name).toBe("packem:minify-html-literals");
        expect(plugin.transform).toBeInstanceOf(Function);
    });

    describe("transform", () => {
        const logger = {
            debug: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
        } as unknown as Pail;

        const plugin = minifyHTMLLiteralsPlugin({ logger });
        const transform = plugin.transform as (code: string, id: string) => Promise<{ code: string; map?: any } | undefined>;

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
            expect(result!.code).toContain("<div class=\"container\"><h1>Hello World</h1><p>This is a test</p></div>");
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
            expect(result!.code).toContain(".container{display:flex;justify-content:center}");
        });

        it("should handle files that don't match the filter", async () => {
            expect.assertions(1);

            const pluginWithFilter = minifyHTMLLiteralsPlugin({
                include: /\.html\.js$/,
                logger,
            });
            const transformWithFilter = pluginWithFilter.transform as (code: string, id: string) => Promise<{ code: string; map?: any } | undefined>;

            const code = "const template = html`<div>Hello</div>`;";
            const result = await transformWithFilter(code, "test.js");

            expect(result).toBeUndefined();
        });
    });
});
