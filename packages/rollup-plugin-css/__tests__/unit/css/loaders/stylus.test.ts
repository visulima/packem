import { dirname, join, resolve } from "@visulima/path";
import { fileURLToPath } from "mlly";
import { describe, expect, it, vi } from "vitest";

import stylusLoader from "../../../../src/loaders/stylus";
import type { StylusLoaderContext, StylusLoaderOptions } from "../../../../src/loaders/stylus/types";
import type { LoaderContext } from "../../../../src/loaders/types";

const mockRollupLogger = {
    debug: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
};

const FIXTURE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "__fixtures__", "css", "stylus-import", "src");

const RED_COLOR_REGEX = /red|#f00|#ff0000/i;
const LINENOS_REGEX = /line \d+/;

const createContext = (id: string, options: StylusLoaderOptions = {}): LoaderContext<StylusLoaderOptions> => {
    return {
        assets: new Map(),
        autoModules: false,
        browserTargets: [],
        cwd: dirname(id),
        deps: new Set<string>(),
        dts: false,
        emit: false,
        environment: "development",
        extensions: [".styl"],
        extract: false,
        id,
        inject: false,
        inline: false,
        logger: mockRollupLogger,
        namedExports: false,
        options,
        plugin: {} as never,
        sourceMap: false,
        useSourcemap: false,
    };
};

const run = async (id: string, code: string, options: StylusLoaderOptions = {}) => {
    const context = createContext(id, options);

    const result = await stylusLoader.process.call(context, { code });

    return { context, ...result };
};

describe("stylus loader", () => {
    it("should compile stylus to CSS", async () => {
        expect.assertions(2);

        const { code } = await run(join(FIXTURE_ROOT, "inline.styl"), ".btn\n  color red\n");

        expect(code).toContain(".btn");
        // Stylus compresses `red` to its hex form by default in modern versions
        expect(code).toMatch(RED_COLOR_REGEX);
    });

    it("should prepend additionalData string", async () => {
        expect.assertions(1);

        const { code } = await run(join(FIXTURE_ROOT, "inline.styl"), ".btn\n  color primary-color\n", {
            additionalData: "primary-color = #bada55",
        });

        expect(code).toContain("#bada55");
    });

    it("should call additionalData function with context", async () => {
        expect.assertions(3);

        const additionalData = vi.fn<(content: string, context: StylusLoaderContext) => string>((content: string) => `primary-color = #abcdef\n${content}`);

        const { code } = await run(join(FIXTURE_ROOT, "inline.styl"), ".btn\n  color primary-color\n", { additionalData });

        expect(additionalData).toHaveBeenCalledTimes(1);
        expect(additionalData.mock.calls[0]?.[1]).toMatchObject({
            environment: "development",
            resourcePath: join(FIXTURE_ROOT, "inline.styl"),
        });
        expect(code).toContain("#abcdef");
    });

    it("should pre-define variables via define option (object form)", async () => {
        expect.assertions(1);

        const { code } = await run(join(FIXTURE_ROOT, "inline.styl"), ".btn\n  color primary-color\n", {
            define: { "primary-color": "#112233" },
        });

        expect(code).toContain("#112233");
    });

    it("should pre-define variables via define option (tuple array form)", async () => {
        expect.assertions(1);

        const { code } = await run(join(FIXTURE_ROOT, "inline.styl"), ".btn\n  color primary-color\n", {
            define: [["primary-color", "#445566"]],
        });

        expect(code).toContain("#445566");
    });

    it("should apply inline plugin via use option", async () => {
        expect.assertions(1);

        const plugin = (renderer: { define: (name: string, value: unknown) => void }) => {
            renderer.define("plugin-color", "#778899");
        };

        const { code } = await run(join(FIXTURE_ROOT, "inline.styl"), ".btn\n  color plugin-color\n", { use: [plugin] } as StylusLoaderOptions);

        expect(code).toContain("#778899");
    });

    it("should enable linenos when lineNumbers is true", async () => {
        expect.assertions(1);

        // linenos requires the source file to exist on disk (stylus stats it)
        const { code } = await run(join(FIXTURE_ROOT, "inline.styl"), ".btn\n  color red\n", { lineNumbers: true });

        expect(code).toMatch(LINENOS_REGEX);
    });

    it("should track dependencies for imported files", async () => {
        expect.assertions(1);

        const { context } = await run(join(FIXTURE_ROOT, "style.styl"), '.style\n  @import "foo.styl"\n');

        expect([...context.deps].some((dependency) => dependency.endsWith("foo.styl"))).toBe(true);
    });
});
