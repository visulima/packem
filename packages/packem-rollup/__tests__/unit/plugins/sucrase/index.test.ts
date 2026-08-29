import type { PluginContext } from "rollup";
import { describe, expect, it } from "vitest";

import type { SucrasePluginConfig } from "../../../../src/plugins/sucrase";
import { sucrasePlugin } from "../../../../src/plugins/sucrase";

const callTransform = (plugin: ReturnType<typeof sucrasePlugin>, code: string, id: string) => {
    const { transform } = plugin;
    const handler = (typeof transform === "function" ? transform : transform?.handler) as
        ((this: PluginContext, code: string, id: string) => { code: string; map?: unknown } | undefined) | undefined;

    return handler?.call({} as PluginContext, code, id);
};

const FOO_TS_REGEX = /\.foo\.ts$/;

const baseConfig = (overrides: Partial<SucrasePluginConfig> = {}): SucrasePluginConfig => {
    return { transforms: ["typescript"], ...overrides };
};

describe("sucrasePlugin", () => {
    it("should be named packem:sucrase", () => {
        expect.assertions(1);

        expect(sucrasePlugin(baseConfig()).name).toBe("packem:sucrase");
    });

    it("should expose NAME=`sucrase` so the transformer registry can key on it", () => {
        expect.assertions(1);

        expect((sucrasePlugin as unknown as { NAME: string }).NAME).toBe("sucrase");
    });

    it("should strip TypeScript annotations from a .ts file via real sucrase transform", () => {
        expect.assertions(2);

        const plugin = sucrasePlugin(baseConfig());
        const result = callTransform(plugin, "const x: number = 1;\nexport { x };", "/foo.ts");

        expect(result?.code).toContain("const x = 1");
        // sucrase always produces a sourcemap when sourceMapOptions is set.
        expect(result?.map).toBeDefined();
    });

    it("should compile JSX when the `jsx` transform is enabled", () => {
        expect.assertions(1);

        const plugin = sucrasePlugin(baseConfig({ transforms: ["typescript", "jsx"] }));
        const result = callTransform(plugin, "const Foo = () => <div />;\nexport { Foo };", "/foo.tsx");

        expect(result?.code).toContain("React.createElement");
    });

    it("should skip ids excluded by the default filter (node_modules)", () => {
        expect.assertions(1);

        const plugin = sucrasePlugin(baseConfig());
        const result = callTransform(plugin, "const x: number = 1;\nexport { x };", "/node_modules/foo/index.ts");

        expect(result).toBeUndefined();
    });

    it("should honor a user-supplied include filter and skip unmatched ids", () => {
        expect.assertions(2);

        const plugin = sucrasePlugin(baseConfig({ include: [FOO_TS_REGEX] }));

        expect(callTransform(plugin, "const x: number = 1; export { x };", "/bar.ts")).toBeUndefined();
        expect(callTransform(plugin, "const x: number = 1; export { x };", "/bar.foo.ts")?.code).toContain("const x = 1");
    });
});
