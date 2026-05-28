import { describe, expect, it } from "vitest";

import { browserslistToEsbuild, esbuildPlugin } from "../../../../src/plugins/esbuild/index";

describe("@visulima/packem-rollup esbuild barrel", () => {
    it("should re-export browserslistToEsbuild and esbuildPlugin", () => {
        expect.assertions(2);

        expect(browserslistToEsbuild).toBeTypeOf("function");
        expect(esbuildPlugin).toBeTypeOf("function");
    });

    it("should expose esbuildPlugin.NAME as `esbuild` (used by the transformer registry)", () => {
        expect.assertions(1);

        expect((esbuildPlugin as unknown as { NAME: string }).NAME).toBe("esbuild");
    });
});
