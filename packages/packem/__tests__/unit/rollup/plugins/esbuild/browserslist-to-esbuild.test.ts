import browserslist from "browserslist";
import { describe, expect, it } from "vitest";

import browserslistToEsbuild from "../../../../../src/rollup/plugins/esbuild/browserslist-to-esbuild";

describe("browserslist-to-esbuild", () => {
    it("works by passing browsers as array", () => {
        expect.assertions(1);

        const target = browserslistToEsbuild(browserslist([">0.2%", "not dead", "not op_mini all"]));

        expect(target).toStrictEqual(["chrome109", "edge130", "firefox115", "ios11", "opera114", "safari16.6"]);
    });

    it("works by passing browsers as string", () => {
        expect.assertions(1);

        const target = browserslistToEsbuild(browserslist("last 2 versions"));

        expect(target).toStrictEqual(["chrome130", "edge130", "firefox132", "ie10", "ios18.1", "opera113", "safari18.1"]);
    });

    it("should work with ios", () => {
        expect.assertions(1);

        const target = browserslistToEsbuild(browserslist("ios >= 9"));

        expect(target).toStrictEqual(["ios9"]);
    });

    it("should work with android and ios", () => {
        expect.assertions(1);

        const target = browserslistToEsbuild(browserslist("ios >= 11, android >= 5"));

        expect(target).toStrictEqual(["chrome131", "ios11"]);
    });

    it("should no support android 4", () => {
        expect.assertions(1);

        const target = browserslistToEsbuild(browserslist("android >= 4"));

        expect(target).toStrictEqual(["chrome131"]);
    });
});
