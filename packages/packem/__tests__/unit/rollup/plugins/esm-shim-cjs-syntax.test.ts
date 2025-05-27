import { describe, expect, it } from "vitest";

import { GLOBAL_REQUIRE_REGEX } from "../../../../src/rollup/plugins/esm-shim-cjs-syntax";

describe("esm-shim-cjs-syntax", () => {
    const match = (code: string) => GLOBAL_REQUIRE_REGEX.test(code);

    it.each([
        ["require(\"foo\")", true],
        ["require(\n\"foo\"\n)", true],
        ["require(`mod`)", true],
        ["require.resolve('mod')", true],
        ["foo.require(\"foo\")", false],
        ["\"require('module')\"", false],
        ["`require('module')`", false],
        [`require.resolve(impl)`, true],
        [`\nrequire.resolve(impl)`, true],
    ])("should match require regex with %s", (code, expected) => {
        expect.assertions(1);
        expect(match(code)).toBe(expected);
    });
});
