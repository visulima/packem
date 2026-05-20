import { describe, expect, it } from "vitest";

import * as esbuildBarrel from "../../../../src/plugins/esbuild/index";

describe("@visulima/packem-rollup esbuild barrel", () => {
    it("should re-export browserslistToEsbuild and esbuildPlugin", () => {
        expect.assertions(2);

        expect(esbuildBarrel.browserslistToEsbuild).toBeTypeOf("function");
        expect(esbuildBarrel.esbuildPlugin).toBeTypeOf("function");
    });

    it("should expose esbuildPlugin.NAME as `esbuild` (used by the transformer registry)", () => {
        expect.assertions(1);

        expect((esbuildBarrel.esbuildPlugin as unknown as { NAME: string }).NAME).toBe("esbuild");
    });
});
