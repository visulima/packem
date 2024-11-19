import { describe, expect, it } from "vitest";

import extendString from "../../../../../../src/rollup/plugins/isolated-declarations/utils/extend-string";

describe("extendString", () => {
    it.each([
        ["./rollup/plugins/esm-shim-cjs-syntax", "rollup/plugins/esm-shim-cjs-syntax.ts", "./rollup/plugins/esm-shim-cjs-syntax.ts"],
        ["./rollup/plugins/esm-shim-cjs-syntax.ts", "rollup/plugins/esm-shim-cjs-syntax.ts", "./rollup/plugins/esm-shim-cjs-syntax.ts"],
        ["./rollup/plugins/isolated-declarations", "rollup/plugins/isolated-declarations/index.ts", "./rollup/plugins/isolated-declarations/index.ts"],
        ["./types", "types.ts", "./types.ts"],
        ["../types", "types.ts", "../types.ts"],
        ["../../types", "types.ts", "../../types.ts"],
        ["../../../types", "types.ts", "../../../types.ts"],
        ["../../types.ts", "types.ts", "../../types.ts"],
        ["../../types.cts", "types.ts", "../../types.ts"],
        ["../../types.mts", "types.ts", "../../types.ts"],
        ["../../types.js", "types.ts", "../../types.ts"],
        ["./types.d.ts", "types.d.cts", "./types.d.cts"],
        ["utils:a", "utils/a.ts", "./utils/a.ts"],
    ])(
        "should append the additional parts of referenceString to baseString '%s' when they have common leading parts",
        (baseString, referenceString, expectedString) => {
            expect.assertions(1);

            expect(extendString(baseString, referenceString)).toBe(expectedString);
        },
    );
});
