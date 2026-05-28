import { parseAst } from "rollup/parseAst";
import { describe, expect, it } from "vitest";

import { pureNewExpressionPlugin } from "../../../src/plugins/pure-new-expression-plugin";

type TransformHandler = (this: { parse: typeof parseAst }, code: string, id: string) => { code: string; map: unknown } | undefined;

const callTransform = (plugin: ReturnType<typeof pureNewExpressionPlugin>, code: string, id = "test.js") => {
    const { transform } = plugin;
    const handler = (typeof transform === "function" ? transform : transform?.handler) as TransformHandler | undefined;

    return handler?.call({ parse: parseAst }, code, id);
};

describe("pureNewExpressionPlugin", () => {
    it("should return a plugin named packem:pure-new-expression", () => {
        expect.assertions(2);

        const plugin = pureNewExpressionPlugin({ constructors: ["Foo"] });

        expect(plugin.name).toBe("packem:pure-new-expression");
        expect(plugin.transform).toBeDefined();
    });

    it("should annotate `new Foo()` with /* @__PURE__ */ for declared constructors", () => {
        expect.assertions(1);

        const plugin = pureNewExpressionPlugin({ constructors: ["Foo"] });
        const result = callTransform(plugin, "const x = new Foo();");

        expect(result?.code).toBe("const x = /* @__PURE__ */ new Foo();");
    });

    it("should annotate multiple new expressions for the same constructor", () => {
        expect.assertions(2);

        const plugin = pureNewExpressionPlugin({ constructors: ["Foo"] });
        const result = callTransform(plugin, "const x = new Foo(); const y = new Foo(1);");

        expect(result?.code).toContain("/* @__PURE__ */ new Foo();");
        expect(result?.code).toContain("/* @__PURE__ */ new Foo(1)");
    });

    it("should leave constructors not in the list untouched", () => {
        expect.assertions(1);

        const plugin = pureNewExpressionPlugin({ constructors: ["Foo"] });
        const result = callTransform(plugin, "const x = new Bar();");

        // No transform applied → handler returns undefined (code unchanged)
        expect(result).toBeUndefined();
    });

    it("should skip when constructors list is empty", () => {
        expect.assertions(1);

        const plugin = pureNewExpressionPlugin({ constructors: [] });
        const result = callTransform(plugin, "const x = new Foo();");

        expect(result).toBeUndefined();
    });

    it("should fast-path skip when code does not mention any constructor", () => {
        expect.assertions(1);

        const plugin = pureNewExpressionPlugin({ constructors: ["Foo", "Bar"] });
        const result = callTransform(plugin, "const x = 42;");

        expect(result).toBeUndefined();
    });

    it("should ignore namespaced constructors (containing a dot)", () => {
        expect.assertions(1);

        // `Foo.Bar` contains a dot → filtered out of the constructor set
        const plugin = pureNewExpressionPlugin({ constructors: ["Foo.Bar"] });
        const result = callTransform(plugin, "const x = new Foo();");

        expect(result).toBeUndefined();
    });

    it("should not annotate matching identifiers used outside `new` expressions", () => {
        expect.assertions(1);

        const plugin = pureNewExpressionPlugin({ constructors: ["Foo"] });
        const result = callTransform(plugin, "const x = Foo();");

        expect(result).toBeUndefined();
    });

    it("should return a sourcemap when sourcemap option is true", () => {
        expect.assertions(1);

        const plugin = pureNewExpressionPlugin({ constructors: ["Foo"], sourcemap: true });
        const result = callTransform(plugin, "const x = new Foo();");

        expect(result?.map).toBeDefined();
    });

    it("should omit sourcemap when sourcemap option is false", () => {
        expect.assertions(1);

        const plugin = pureNewExpressionPlugin({ constructors: ["Foo"], sourcemap: false });
        const result = callTransform(plugin, "const x = new Foo();");

        expect(result?.map).toBeUndefined();
    });

    it("should declare `post` transform order to run after TS transformers", () => {
        expect.assertions(1);

        const plugin = pureNewExpressionPlugin({ constructors: ["Foo"] });
        const transform = plugin.transform as { order?: string };

        expect(transform.order).toBe("post");
    });

    it("should swallow parse errors and return undefined", () => {
        expect.assertions(1);

        const plugin = pureNewExpressionPlugin({ constructors: ["Foo"] });
        // Invalid syntax that contains "Foo" so the fast-path doesn't bail out.
        const result = callTransform(plugin, "const x = new Foo(@@@");

        expect(result).toBeUndefined();
    });
});
