import { describe, expect, it } from "vitest";

import { ensurePCSSOption } from "../../../../../../src/rollup/plugins/css/utils/options";

describe("option", () => {
    it("wrong postcss option", () => {
        expect.assertions(1);

        expect(() => ensurePCSSOption("pumpinizer", "plugin")).toThrowErrorMatchingSnapshot();
    });
});
