import type { ModuleInfo, PluginContext } from "rollup";
import { parseAst } from "rollup/parseAst";
import { describe, expect, it } from "vitest";

import parseExports from "../../../../src/plugins/chunk-splitter/parse";

const buildContext = (): PluginContext => ({ parse: parseAst }) as unknown as PluginContext;

const buildModule = (id: string, code: string): ModuleInfo => ({ code, id }) as unknown as ModuleInfo;

describe("chunk-splitter parseExports", () => {
    it("should yield named self-exports for `export const`", () => {
        expect.assertions(1);

        const exported = [...parseExports(buildContext(), buildModule("/a.js", "export const foo = 1; export const bar = 2;"))];

        expect(exported).toEqual([
            { exportedName: "foo", from: "self", type: "named" },
            { exportedName: "bar", from: "self", type: "named" },
        ]);
    });

    it("should yield named self-exports for `export function` / `export class`", () => {
        expect.assertions(1);

        const exported = [...parseExports(buildContext(), buildModule("/a.js", "export function foo() {} export class Bar {}"))];

        expect(exported).toEqual([
            { exportedName: "foo", from: "self", type: "named" },
            { exportedName: "Bar", from: "self", type: "named" },
        ]);
    });

    it("should yield a default self-export for `export default ...`", () => {
        expect.assertions(1);

        const exported = [...parseExports(buildContext(), buildModule("/a.js", "export default 42;"))];

        expect(exported).toEqual([{ exportedName: "default", from: "self", type: "named" }]);
    });

    it("should yield named re-exports with bindings for `export { x } from './y'`", () => {
        expect.assertions(1);

        const exported = [...parseExports(buildContext(), buildModule("/a.js", "export { foo, bar as baz } from './y.js';"))];

        expect(exported).toEqual([
            {
                bindings: [
                    { exportedName: "foo", importedName: "foo" },
                    { exportedName: "baz", importedName: "bar" },
                ],
                from: "other",
                source: "./y.js",
                type: "named",
            },
        ]);
    });

    it("should yield a barrel re-export for `export * from './y'`", () => {
        expect.assertions(1);

        const exported = [...parseExports(buildContext(), buildModule("/a.js", "export * from './y.js';"))];

        expect(exported).toEqual([{ from: "other", source: "./y.js", type: "barrel" }]);
    });

    it("should yield a named self-export for `export * as ns from './y'`", () => {
        expect.assertions(1);

        const exported = [...parseExports(buildContext(), buildModule("/a.js", "export * as ns from './y.js';"))];

        expect(exported).toEqual([{ exportedName: "ns", from: "self", type: "named" }]);
    });

    it("should yield re-bindings for `export { x } as alias` without a source", () => {
        expect.assertions(1);

        const exported = [...parseExports(buildContext(), buildModule("/a.js", "const x = 1; export { x as renamed };"))];

        expect(exported).toEqual([{ exportedName: "renamed", from: "self", type: "named" }]);
    });

    it("should skip non-export statements", () => {
        expect.assertions(1);

        const exported = [
            ...parseExports(buildContext(), buildModule("/a.js", "const x = 1; function y() {} export const z = 3;")),
        ];

        expect(exported).toEqual([{ exportedName: "z", from: "self", type: "named" }]);
    });

    it("should throw when module.code is null", () => {
        expect.assertions(1);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const module_ = ({ code: null, id: "/a.js" }) as any;

        expect(() => [...parseExports(buildContext(), module_)]).toThrow(/doesn't have associated code/);
    });
});
