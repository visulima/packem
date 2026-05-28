import type { ModuleInfo, PluginContext } from "rollup";
import { parseAst } from "rollup/parseAst";
import { describe, expect, it, vi } from "vitest";

import gatherExports from "../../../../src/plugins/chunk-splitter/gather";

const CANT_RESOLVE_REGEX = /can't resolve/;

const buildContext = (overrides: Record<string, unknown> = {}): PluginContext =>
    ({
        load: vi.fn(),
        parse: parseAst,
        resolve: vi.fn(),
        ...overrides,
    }) as unknown as PluginContext;

const buildModule = (id: string, code: string): ModuleInfo => ({ code, id }) as ModuleInfo;

const drain = async <T>(iterable: AsyncGenerator<T>): Promise<T[]> => {
    const out: T[] = [];

    for await (const item of iterable) {
        out.push(item);
    }

    return out;
};

describe("chunk-splitter gatherExports", () => {
    it("should yield ExportInfo for each named self-export with id pinned to the source module", async () => {
        expect.assertions(1);

        const context = buildContext();
        const moduleInfo = buildModule("/a.js", "export const foo = 1; export const bar = 2;");

        const exported = await drain(gatherExports(context, moduleInfo));

        expect(exported).toEqual([
            { exportedName: "foo", id: "/a.js", sourceName: "foo" },
            { exportedName: "bar", id: "/a.js", sourceName: "bar" },
        ]);
    });

    it("should follow `export { x } from './y'` re-exports and rebind exported names to the binding alias", async () => {
        expect.assertions(3);

        const resolve = vi.fn((source: string) => {
            return { external: false, id: `/resolved${source}` };
        });
        const load = vi.fn(() => buildModule("/resolved/y.js", "export const foo = 1; export const bar = 2;"));

        const context = buildContext({ load, resolve });

        const moduleInfo = buildModule("/a.js", "export { foo, bar as baz } from './y.js';");

        const exported = await drain(gatherExports(context, moduleInfo));

        expect(exported).toEqual([
            { exportedName: "foo", id: "/resolved/y.js", sourceName: "foo" },
            { exportedName: "baz", id: "/resolved/y.js", sourceName: "bar" },
        ]);
        expect(resolve).toHaveBeenCalledWith("./y.js", "/a.js");
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("should follow `export *` barrel re-exports and yield every export from the source module", async () => {
        expect.assertions(1);

        const resolve = vi.fn((source: string) => {
            return { external: false, id: `/resolved${source}` };
        });
        const load = vi.fn(() => buildModule("/resolved/y.js", "export const foo = 1; export const bar = 2;"));

        const context = buildContext({ load, resolve });
        const moduleInfo = buildModule("/a.js", "export * from './y.js';");

        const exported = await drain(gatherExports(context, moduleInfo));

        expect(exported).toEqual([
            { exportedName: "foo", id: "/resolved/y.js", sourceName: "foo" },
            { exportedName: "bar", id: "/resolved/y.js", sourceName: "bar" },
        ]);
    });

    it("should drop bindings on a named re-export whose imported name does not exist in the source module", async () => {
        expect.assertions(1);

        const resolve = vi.fn((source: string) => {
            return { external: false, id: `/resolved${source}` };
        });
        const load = vi.fn(() => buildModule("/resolved/y.js", "export const foo = 1;"));

        const context = buildContext({ load, resolve });

        const moduleInfo = buildModule("/a.js", "export { missing as x } from './y.js';");

        const exported = await drain(gatherExports(context, moduleInfo));

        expect(exported).toEqual([]);
    });

    it("should skip external re-exports and yield nothing for that source", async () => {
        expect.assertions(2);

        const resolve = vi.fn(() => {
            return { external: true, id: "react" };
        });
        const load = vi.fn();

        const context = buildContext({ load, resolve });

        const moduleInfo = buildModule("/a.js", "export * from 'react';");

        const exported = await drain(gatherExports(context, moduleInfo));

        expect(exported).toEqual([]);
        expect(load).not.toHaveBeenCalled();
    });

    it("should skip external named re-exports without trying to load the source module", async () => {
        expect.assertions(2);

        const resolve = vi.fn(() => {
            return { external: true, id: "react" };
        });
        const load = vi.fn();

        const context = buildContext({ load, resolve });

        const moduleInfo = buildModule("/a.js", "export { useState } from 'react';");

        const exported = await drain(gatherExports(context, moduleInfo));

        expect(exported).toEqual([]);
        expect(load).not.toHaveBeenCalled();
    });

    it("should throw an assertion error when resolve returns nothing", async () => {
        expect.assertions(1);

        const resolve = vi.fn(() => undefined);
        const load = vi.fn();

        const context = buildContext({ load, resolve });

        const moduleInfo = buildModule("/a.js", "export * from './missing.js';");

        await expect(drain(gatherExports(context, moduleInfo))).rejects.toThrow(CANT_RESOLVE_REGEX);
    });
});
