import { describe, expect, it } from "vitest";

import * as swcBarrel from "../../../../src/plugins/swc";

describe("@visulima/packem-rollup swc barrel", () => {
    it("should re-export swcPlugin", () => {
        expect.assertions(1);

        expect(swcBarrel.swcPlugin).toBeTypeOf("function");
    });

    it("should expose swcPlugin.NAME=`swc`", () => {
        expect.assertions(1);

        expect((swcBarrel.swcPlugin as unknown as { NAME: string }).NAME).toBe("swc");
    });
});
