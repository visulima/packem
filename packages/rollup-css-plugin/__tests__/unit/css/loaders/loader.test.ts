/* eslint-disable vitest/require-mock-type-parameters */
import { describe, expect, it, vi } from "vitest";

import LoaderManager from "../../../../src/loaders/loader-manager";

// Mock rollup logger that matches the RollupLogger interface
const mockRollupLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
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
            },
        });

        await expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            loaders.process({ code: "" }, { id: "file.less" } as any),
        ).resolves.toStrictEqual({ code: "" });
    });
});
