import { afterAll, describe, expect, it, vi } from "vitest";

import { ensurePCSSOption } from "../../../../src/utils/options";

// Mock RollupLogger
const mockLogger = {
    debug: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
};

describe("option", () => {
    const consoleDebugMock = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    afterAll(() => {
        consoleDebugMock.mockReset();
    });

    it("wrong postcss option", async () => {
        expect.assertions(3);

        try {
            await ensurePCSSOption("pumpinizer", "plugin", __dirname, mockLogger);
        } catch (error: unknown) {
            // eslint-disable-next-line vitest/no-conditional-expect
            expect((error as Error).message).toBe("Unable to load PostCSS plugin `pumpinizer`");
        }

        expect(consoleDebugMock).toHaveBeenCalledWith("Cannot find module 'pumpinizer'", {
            context: [
                {
                    basedir: __dirname,
                    caller: "Module loader",
                    extensions: [".js", ".mjs", ".cjs", ".json"],
                    id: "pumpinizer",
                },
            ],
        });
        expect(consoleDebugMock).toHaveBeenCalledWith("Cannot find module './pumpinizer'", {
            context: [
                {
                    basedir: __dirname,
                    caller: "Module loader",
                    extensions: [".js", ".mjs", ".cjs", ".json"],
                    id: "./pumpinizer",
                },
            ],
        });
    });
});
