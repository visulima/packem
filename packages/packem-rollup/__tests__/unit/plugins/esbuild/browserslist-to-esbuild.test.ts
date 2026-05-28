import browserslist from "browserslist";
import { describe, expect, it } from "vitest";

import browserslistToEsbuild from "../../../../src/plugins/esbuild/browserslist-to-esbuild";

describe("browserslist-to-esbuild", () => {
    it("works by passing browsers as array", () => {
        expect.assertions(1);

        const target = browserslistToEsbuild(browserslist([">0.2%", "not dead", "not op_mini all"]));

        expect(target).toMatchSnapshot();
    });

    it("works by passing browsers as string", () => {
        expect.assertions(1);

        const target = browserslistToEsbuild(browserslist("last 2 versions"));

        expect(target).toMatchSnapshot();
    });

    it("should work with ios", () => {
        expect.assertions(1);

        const target = browserslistToEsbuild(browserslist("ios >= 9"));

        expect(target).toMatchSnapshot();
    });

    it("should work with android and ios", () => {
        expect.assertions(1);

        const target = browserslistToEsbuild(browserslist("ios >= 11, android >= 5"));

        expect(target).toMatchSnapshot();
    });

    it("should no support android 4", () => {
        expect.assertions(1);

        const target = browserslistToEsbuild(browserslist("android >= 4"));

        expect(target).toMatchSnapshot();
    });

    it("should map ios_saf to ios", () => {
        expect.assertions(1);

        // ios_saf is browserslist's name; esbuild only knows `ios`.
        expect(browserslistToEsbuild(["ios_saf 15.0"])).toEqual(["ios15"]);
    });

    it("should map android to chrome", () => {
        expect.assertions(1);

        expect(browserslistToEsbuild(["android 100"])).toEqual(["chrome100"]);
    });

    it("should collapse a range like `11.0-12.0` to its lower bound `11`", () => {
        expect.assertions(1);

        expect(browserslistToEsbuild(["safari 11.0-12.0"])).toEqual(["safari11"]);
    });

    it("should strip a trailing `.0` so `12.0` becomes `12`", () => {
        expect.assertions(1);

        expect(browserslistToEsbuild(["safari 12.0"])).toEqual(["safari12"]);
    });

    it("should drop entries whose version fails the digit/dot regex", () => {
        expect.assertions(1);

        // `TP` (technology preview) and `all` are not numeric versions.
        expect(browserslistToEsbuild(["safari TP", "ie all"])).toEqual([]);
    });

    it("should drop browsers that esbuild does not support", () => {
        expect.assertions(1);

        // kaios isn't in the SUPPORTED_ESBUILD_TARGETS set.
        expect(browserslistToEsbuild(["kaios 2.5", "samsung 15.0"])).toEqual([]);
    });

    it("should drop unsupported entries like `android 4` while keeping supported entries on the same input", () => {
        expect.assertions(1);

        expect(browserslistToEsbuild(["android 4", "chrome 100"])).toEqual(["chrome100"]);
    });
});
