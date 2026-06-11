import { describe, expect, it, vi } from "vitest";

import { ensurePCSSOption } from "../../../../src/utils/options";

// Mock RollupLogger
const mockLogger = {
    debug: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(log: { message: string }) => void>(),
};

describe("option", () => {
    it("wrong postcss option", async () => {
        expect.assertions(3);

        try {
            await ensurePCSSOption("pumpinizer", "plugin", __dirname, mockLogger);
        } catch (error: unknown) {
            // eslint-disable-next-line vitest/no-conditional-expect
            expect((error as Error).message).toBe("Unable to load PostCSS plugin `pumpinizer`");
        }

        // The module loader routes the resolution failure through the logger
        // rather than `console.debug`, and the message includes the tried paths
        // so the cause is no longer swallowed.
        expect(mockLogger.warn).toHaveBeenCalledTimes(1);

        const [warnArgument] = mockLogger.warn.mock.calls[0] as [{ message: string }];

        expect(warnArgument.message).toContain("Module loader could not resolve");
    });
});
