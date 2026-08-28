import { describe, expect, it } from "vitest";

import { JsonPlugin } from "../../../src/plugins/json";

type TransformHandler = (this: unknown, code: string, id: string) => string | { code?: string } | null | undefined;

const MODULE_EXPORTS_REGEX = /^module\.exports = /;

const callTransform = (plugin: ReturnType<typeof JsonPlugin>, code: string, id: string) => {
    const { transform } = plugin;
    const handler = (typeof transform === "function" ? transform : transform?.handler) as TransformHandler | undefined;

    return handler?.call({}, code, id);
};

describe("jsonPlugin", () => {
    it("should return a plugin named packem:json", () => {
        expect.assertions(1);

        const plugin = JsonPlugin({});

        expect(plugin.name).toBe("packem:json");
    });

    it("should rewrite `export default` from JSON parse to `module.exports = ` when namedExports is disabled", () => {
        expect.assertions(2);

        const plugin = JsonPlugin({ namedExports: false });
        const result = callTransform(plugin, JSON.stringify({ foo: 1 }), "/path/to/file.json");

        expect(result).toBeTypeOf("object");
        expect((result as { code: string }).code).toMatch(MODULE_EXPORTS_REGEX);
    });

    it("should not rewrite when emitted code does not start with `export default ` (named exports mode)", () => {
        expect.assertions(2);

        const plugin = JsonPlugin({ namedExports: true });
        const result = callTransform(plugin, JSON.stringify({ foo: 1 }), "/path/to/file.json");

        expect((result as { code: string }).code).toContain("export var foo");
        // unchanged — does not begin with `module.exports =`
        expect((result as { code: string }).code).not.toMatch(MODULE_EXPORTS_REGEX);
    });

    it("should declare a regex-based filter on the .json extension", () => {
        expect.assertions(1);

        const plugin = JsonPlugin({});
        const transform = plugin.transform as { filter?: { id?: RegExp } } | undefined;

        expect(transform?.filter?.id).toBeInstanceOf(RegExp);
    });
});
