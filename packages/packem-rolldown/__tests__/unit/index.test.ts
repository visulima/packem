import { describe, expect, it } from "vitest";

import * as rolldownBackend from "../../src/index";

describe("@visulima/packem-rolldown public barrel", () => {
    it("should export an empty namespace (no rolldown-only plugins exist yet)", () => {
        expect.assertions(1);

        // The barrel is a placeholder — when a rolldown-native plugin lands, it will be re-exported here.
        // This test pins the current contract so a future PR is forced to acknowledge an intentional change.
        expect(Object.keys(rolldownBackend)).toEqual([]);
    });
});
