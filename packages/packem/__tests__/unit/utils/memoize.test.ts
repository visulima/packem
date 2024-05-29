import { describe, expect, it, vi } from "vitest";

import memoizeByKey from "../../../src/utils/memoize";

describe("memoize", () => {
    it("should memoize the function by default based on arg", () => {
        expect.assertions(5);

        const function_ = vi.fn((a: number, b: number) => a + b);
        const memoized = memoizeByKey(function_)();

        expect(memoized(1, 2)).toBe(3);
        expect(memoized(1, 2)).toBe(3);
        expect(function_).toHaveBeenCalledTimes(1);
        expect(memoized(1, 5)).toBe(6);
        expect(function_).toHaveBeenCalledTimes(2);
    });

    it("should memoize based on the string key resolver", () => {
        expect.assertions(4);

        const function_ = vi.fn((a: number, b: number) => a + b);
        const memoized = memoizeByKey(function_)("key");

        expect(memoized(1, 2)).toBe(3);
        expect(memoized(1, 2)).toBe(3);
        expect(memoized(1, 5)).toBe(3); // still cache since the key is the same
        expect(function_).toHaveBeenCalledTimes(1);
    });
});
