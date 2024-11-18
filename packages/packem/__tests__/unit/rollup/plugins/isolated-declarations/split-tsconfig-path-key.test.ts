import { describe, expect, it } from "vitest";

import splitTsconfigPathKey from "../../../../../src/rollup/plugins/isolated-declarations/split-tsconfig-path-key";

describe("splitTsconfigPathKey", () => {
    it("should split a simple path", () => {
        expect.assertions(1);

        const result = splitTsconfigPathKey("src/utils/*");

        expect(result).toEqual(["src", "utils", "*"]);
    });

    it("should split a namespaced path", () => {
        expect.assertions(1);

        const result = splitTsconfigPathKey("@namespace:module/utils/*");

        expect(result).toEqual(["@namespace:module", "utils", "*"]);
    });

    it("should handle a wildcard-only path", () => {
        expect.assertions(1);

        const result = splitTsconfigPathKey("*");

        expect(result).toEqual(["*"]);
    });

    it("should handle a namespaced path without wildcard", () => {
        expect.assertions(1);

        const result = splitTsconfigPathKey("@namespace:module/utils");

        expect(result).toEqual(["@namespace:module", "utils"]);
    });

    it("should throw an error for invalid input", () => {
        expect.assertions(3);

        expect(() => splitTsconfigPathKey("")).toThrow("Invalid key: Key must be a non-empty string.");
        expect(() => splitTsconfigPathKey(null as any)).toThrow("Invalid key: Key must be a non-empty string.");
        expect(() => splitTsconfigPathKey(undefined as any)).toThrow("Invalid key: Key must be a non-empty string.");
    });
});
