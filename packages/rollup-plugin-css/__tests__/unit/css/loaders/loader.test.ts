import { describe, expect, it, vi } from "vitest";

import LoaderManager from "../../../../src/loaders/loader-manager";
import type { LoaderContext } from "../../../../src/loaders/types";

// Mock rollup logger that matches the RollupLogger interface
const mockRollupLogger = {
    debug: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
};

describe("loader", () => {
    it("should return the same input, when no loader was found", async () => {
        expect.assertions(1);

        const loaders = new LoaderManager({
            extensions: [],
            loaders: [],
            logger: mockRollupLogger,
            options: {
                emit: false,
                extensions: [],
                extract: "",
                inject: false,
                inline: false,
            },
        });

        await expect(
            loaders.process({ code: "" }, { id: "file.less" } as unknown as LoaderContext),
        ).resolves.toStrictEqual({ code: "" });
    });
});
