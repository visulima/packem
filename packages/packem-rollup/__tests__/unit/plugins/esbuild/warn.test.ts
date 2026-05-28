import type { Message } from "esbuild";
import type { PluginContext } from "rollup";
import { describe, expect, it, vi } from "vitest";

import warn from "../../../../src/plugins/esbuild/utils/warn";

const makePluginContext = () => ({ warn: vi.fn() }) as unknown as PluginContext;

describe("esbuild warn util", () => {
    it("should be a no-op when there are no messages", async () => {
        expect.assertions(1);

        const context = makePluginContext();

        await warn(context, []);

        expect(context.warn).not.toHaveBeenCalled();
    });

    it("should call pluginContext.warn once per esbuild message", async () => {
        expect.assertions(1);

        const context = makePluginContext();
        const messages = [
            { id: "", location: undefined, notes: [], pluginName: "", text: "first warning" },
            { id: "", location: undefined, notes: [], pluginName: "", text: "second warning" },
        ] as unknown as Message[];

        await warn(context, messages);

        expect(context.warn).toHaveBeenCalledTimes(2);
    });
});
