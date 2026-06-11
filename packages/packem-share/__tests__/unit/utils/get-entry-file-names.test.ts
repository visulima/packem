import type { PreRenderedAsset } from "rollup";
import { describe, expect, it } from "vitest";

import getEntryFileNames from "../../../src/utils/get-entry-file-names";

const asset = (names: string[]): PreRenderedAsset =>
    ({
        names,
    }) as unknown as PreRenderedAsset;

describe(getEntryFileNames, () => {
    it("should return the default pattern when there is no node_modules entry", () => {
        expect.assertions(1);

        expect(getEntryFileNames(asset(["index"]), "mjs")).toBe("[name].mjs");
    });

    it("should detect the pnpm store with forward-slash separators", () => {
        expect.assertions(1);

        const name = "node_modules/.pnpm/lodash@4/node_modules/lodash/index";

        expect(getEntryFileNames(asset([name]), "mjs")).toBe("external/lodash@4/lodash/index.mjs");
    });

    it("should detect the pnpm store with backslash separators (Windows-style names)", () => {
        expect.assertions(1);

        const name = String.raw`node_modules\.pnpm\lodash@4\node_modules\lodash\index`;

        expect(getEntryFileNames(asset([name]), "mjs")).toBe(String.raw`external\lodash@4\lodash\index.mjs`);
    });

    it("should map plain node_modules entries to external", () => {
        expect.assertions(1);

        expect(getEntryFileNames(asset(["node_modules/lodash/index"]), "cjs")).toBe("external/lodash/index.cjs");
    });
});
