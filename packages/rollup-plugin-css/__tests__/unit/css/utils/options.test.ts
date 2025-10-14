import { afterAll, describe, expect, it, vi } from "vitest";

import { ensurePCSSOption } from "../../../../src/utils/options";

// Mock RollupLogger
const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            // eslint-disable-next-line vitest/no-conditional-expect
            expect(error.message).toBe("Unable to load PostCSS plugin `pumpinizer`");
        }

        expect(consoleDebugMock).toHaveBeenCalledExactlyOnceWith("Cannot find module 'pumpinizer'", {
            context: [
                {
                    basedir: __dirname,
                    caller: "Module loader",
                    extensions: [".js", ".mjs", ".cjs", ".json"],
                    id: "pumpinizer",
                },
            ],
        });
        expect(consoleDebugMock).toHaveBeenCalledExactlyOnceWith("Cannot find module './pumpinizer'", {
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
