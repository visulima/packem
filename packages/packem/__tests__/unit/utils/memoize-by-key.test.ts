import { describe, expect, it, vi } from "vitest";

import memoizeByKey from "../../../src/utils/memoize-by-key";

describe("memoize", () => {
    it("should memoize the function by default based on arg", () => {
        expect.assertions(5);

        const mockedFunction = vi.fn((a: number, b: number) => a + b);
        const memoized = memoizeByKey(mockedFunction)();

        expect(memoized(1, 2)).toBe(3);
        expect(memoized(1, 2)).toBe(3);
        expect(mockedFunction).toHaveBeenCalledTimes(1);
        expect(memoized(1, 5)).toBe(6);
        expect(mockedFunction).toHaveBeenCalledTimes(2);
    });

    it("should memoize based on the string key resolver", () => {
        expect.assertions(4);

        const mockedFunction = vi.fn((a: number, b: number) => a + b);
        const memoized = memoizeByKey(mockedFunction)("key");

        expect(memoized(1, 2)).toBe(3);
        expect(memoized(1, 2)).toBe(3);
        expect(memoized(1, 5)).toBe(3); // still cache since the key is the same
        expect(mockedFunction).toHaveBeenCalledTimes(1);
    });
});
