import type { ObjectHook, Plugin, TransformPluginContext } from "rollup";
import { describe, expect, it } from "vitest";

import { babelTransformPlugin } from "../../../../src/plugins/babel";
import { transformCode } from "../../../../src/plugins/babel/transform-code";

// A trivial Babel plugin (no external preset needed) that renames `foo` → `bar`.
const renameFooPlugin = () => {
    return {
        visitor: {
            Identifier(path: { node: { name: string } }) {
                if (path.node.name === "foo") {
                    // eslint-disable-next-line no-param-reassign
                    path.node.name = "bar";
                }
            },
        },
    };
};

type TransformHook = NonNullable<Plugin["transform"]>;
type TransformHandler = TransformHook extends ObjectHook<infer Handler> ? Handler : TransformHook;

const getTransformHandler = (plugin: Plugin): TransformHandler => {
    const hook = plugin.transform as TransformHook;

    if (typeof hook === "function") {
        return hook;
    }

    return hook.handler;
};

// Minimal `this` context for invoking the transform hook directly.
const transformContext = { meta: { watchMode: false } } as unknown as TransformPluginContext;

const runTransform = async (plugin: Plugin, code: string, id: string) =>
    getTransformHandler(plugin).call(transformContext, code, id);

describe("babel transform-code", () => {
    it("applies babel plugins and returns transformed code", async () => {
        expect.assertions(2);

        const result = await transformCode("const foo = 1;", "/virtual/x.ts", { plugins: [renameFooPlugin] });

        expect(result?.code).toContain("bar");
        expect(result?.code).not.toContain("foo");
    });

    it("parses TypeScript and JSX based on the file extension", async () => {
        expect.assertions(1);

        // Would throw on a TS type annotation without the auto-added `typescript` parser plugin.
        const result = await transformCode("const x: number = 1;\nexport { x };", "/virtual/x.tsx", {});

        expect(result?.code).toContain("const x");
    });

    it("drops the react-compiler plugin in annotation mode when the file has no \"use memo\"", async () => {
        expect.assertions(1);

        // babel-plugin-react-compiler is not installed; referencing it by name forces
        // babel to resolve (and fail) unless the annotation filter removes it first.
        const plugins = [["babel-plugin-react-compiler", { compilationMode: "annotation" }]] as never[];

        // No "use memo" directive → the compiler entry is filtered out → transform succeeds.
        const result = await transformCode("export const value = 1;", "/virtual/no-memo.tsx", { plugins });

        expect(result?.code).toContain("value");
    });
});

describe("babelTransformPlugin", () => {
    it("transforms files that pass the filter and skips the rest", async () => {
        expect.assertions(2);

        const plugin = babelTransformPlugin({ plugins: [renameFooPlugin] });

        const transformed = await runTransform(plugin, "const foo = 1;", "/virtual/included.ts");

        expect((transformed as { code: string } | undefined)?.code).toContain("bar");

        // node_modules is excluded by the default EXCLUDE_REGEXP.
        const skipped = await runTransform(plugin, "const foo = 1;", "/project/node_modules/pkg/index.js");

        expect(skipped).toBeUndefined();
    });

    it("falls back to in-process transforms when the worker script cannot be resolved", async () => {
        expect.assertions(1);

        // Running from source there is no built worker on disk, so even with parallel
        // enabled and the threshold crossed the plugin must transform in-process.
        const plugin = babelTransformPlugin({ parallel: true, parallelThreshold: 1, plugins: [renameFooPlugin] });

        const result = await runTransform(plugin, "const foo = 1;", "/virtual/big-build.ts");

        expect((result as { code: string } | undefined)?.code).toContain("bar");
    });
});
