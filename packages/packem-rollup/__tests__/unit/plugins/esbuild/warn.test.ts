import type { Message } from "esbuild";
import type { PluginContext } from "rollup";
import { describe, expect, it, vi } from "vitest";

import warn from "../../../../src/plugins/esbuild/utils/warn";

const makePluginContext = () => ({ warn: vi.fn() }) as unknown as PluginContext;

describe("esbuild warn util", () => {
    it("should be a no-op when there are no messages", async () => {
        expect.assertions(1);

        const ctx = makePluginContext();

        await warn(ctx, []);

        expect(ctx.warn).not.toHaveBeenCalled();
    });

    it("should call pluginContext.warn once per esbuild message", async () => {
        expect.assertions(1);

        const ctx = makePluginContext();
        const messages = [
            { id: "", location: null, notes: [], pluginName: "", text: "first warning" },
            { id: "", location: null, notes: [], pluginName: "", text: "second warning" },
        ] as unknown as Message[];

        await warn(ctx, messages);

        expect(ctx.warn).toHaveBeenCalledTimes(2);
    });
});
