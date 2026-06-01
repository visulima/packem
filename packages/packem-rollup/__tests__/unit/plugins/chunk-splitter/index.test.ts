import type { ModuleInfo, PluginContext } from "rollup";
import { parseAst } from "rollup/parseAst";
import { describe, expect, it, vi } from "vitest";

import chunkSplitter from "../../../../src/plugins/chunk-splitter";

const callModuleParsed = (plugin: ReturnType<typeof chunkSplitter>, info: Partial<ModuleInfo>, context_: Record<string, unknown>) => {
    const { moduleParsed } = plugin;
    const handler = (typeof moduleParsed === "function" ? moduleParsed : moduleParsed?.handler) as (
        this: PluginContext,
        info: ModuleInfo,
    ) => Promise<void> | undefined;
    const context = { emitFile: vi.fn(), load: vi.fn(), parse: parseAst, resolve: vi.fn(), ...context_ } as unknown as PluginContext;

    return handler.call(context, info as ModuleInfo);
};

describe("chunkSplitter", () => {
    it("should return a plugin named packem:chunk-splitter", () => {
        expect.assertions(1);

        expect(chunkSplitter().name).toBe("packem:chunk-splitter");
    });

    it("should declare moduleParsed as `post` order", () => {
        expect.assertions(1);

        const plugin = chunkSplitter();
        const moduleParsed = plugin.moduleParsed as { order?: string };

        expect(moduleParsed.order).toBe("post");
    });

    it("should skip non-entry modules without touching emitFile", async () => {
        expect.assertions(1);

        const emitFile = vi.fn();

        await callModuleParsed(chunkSplitter(), { code: "export const a = 1;", id: "/a.js", isEntry: false }, { emitFile });

        expect(emitFile).not.toHaveBeenCalled();
    });

    it("should emit a chunk per named self-export from the entry module", async () => {
        expect.assertions(2);

        const emitFile = vi.fn();
        // The plugin compares `exported.id === info.id` and skips when equal.
        // For NamedSelfExport, `id` is set to `module_.id` → so SELF-exports of an entry are skipped.
        // To assert emitFile is called, we need re-exports from a *different* module.
        const resolve = vi.fn((source: string) => {
            return { external: false, id: `/resolved${source}` };
        });
        const load = vi.fn(() => {
            return {
                code: "export const foo = 1; export const bar = 2;",
                id: "/resolved/y.js",
            };
        });

        await callModuleParsed(chunkSplitter(), { code: "export { foo, bar } from './y.js';", id: "/a.js", isEntry: true }, { emitFile, load, resolve });

        expect(emitFile).toHaveBeenCalledTimes(2);
        expect(emitFile).toHaveBeenCalledWith(expect.objectContaining({ preserveSignature: "exports-only", type: "chunk" }));
    });

    it("should skip self-exports from the entry module (avoid re-emitting the entry as its own chunk)", async () => {
        expect.assertions(1);

        const emitFile = vi.fn();

        await callModuleParsed(chunkSplitter(), { code: "export const foo = 1; export const bar = 2;", id: "/a.js", isEntry: true }, { emitFile });

        expect(emitFile).not.toHaveBeenCalled();
    });
});
