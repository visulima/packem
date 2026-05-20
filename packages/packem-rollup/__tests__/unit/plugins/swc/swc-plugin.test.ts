import type { PluginContext } from "rollup";
import { describe, expect, it } from "vitest";

import swcPlugin from "../../../../src/plugins/swc/swc-plugin";
import type { SwcPluginConfig } from "../../../../src/plugins/swc/types";

const callTransform = async (plugin: ReturnType<typeof swcPlugin>, code: string, id: string) => {
    const transform = plugin.transform as (
        this: PluginContext,
        code: string,
        id: string,
    ) => Promise<{ code: string; map?: unknown } | undefined>;

    return transform.call({} as PluginContext, code, id);
};

const baseConfig = (overrides: Partial<SwcPluginConfig> = {}): SwcPluginConfig =>
    ({
        jsc: {
            parser: { syntax: "typescript" },
            target: "es2022",
        },
        ...overrides,
    }) as SwcPluginConfig;

describe("swcPlugin", () => {
    it("should be named packem:swc", () => {
        expect.assertions(1);

        expect(swcPlugin(baseConfig()).name).toBe("packem:swc");
    });

    it("should expose NAME=`swc` for the transformer registry", () => {
        expect.assertions(1);

        expect((swcPlugin as unknown as { NAME: string }).NAME).toBe("swc");
    });

    it("should strip TypeScript annotations via a real SWC transform", async () => {
        expect.assertions(2);

        const plugin = swcPlugin(baseConfig());
        const result = await callTransform(plugin, "const x: number = 1;\nexport { x };", "/foo.ts");

        expect(result?.code).toContain("const x = 1");
        expect(result?.code).not.toContain(": number");
    });

    it("should compile JSX with the tsx parser variant", async () => {
        expect.assertions(1);

        const plugin = swcPlugin(
            baseConfig({
                jsc: {
                    parser: { syntax: "typescript", tsx: true },
                    target: "es2022",
                    transform: { react: { runtime: "classic" } },
                },
            }),
        );
        const result = await callTransform(plugin, "const Foo = () => <div />;\nexport { Foo };", "/foo.tsx");

        expect(result?.code).toContain("React.createElement");
    });

    it("should skip ids excluded by the default filter (node_modules)", async () => {
        expect.assertions(1);

        const plugin = swcPlugin(baseConfig());
        const result = await callTransform(plugin, "const x: number = 1;\nexport { x };", "/node_modules/foo/index.ts");

        expect(result).toBeUndefined();
    });

    it("should honor a user-supplied include filter and skip unmatched ids", async () => {
        expect.assertions(2);

        const plugin = swcPlugin(baseConfig({ include: [/\.foo\.ts$/] }));

        expect(await callTransform(plugin, "const x: number = 1; export { x };", "/bar.ts")).toBeUndefined();
        expect((await callTransform(plugin, "const x: number = 1; export { x };", "/bar.foo.ts"))?.code).toContain("const x = 1");
    });
});
