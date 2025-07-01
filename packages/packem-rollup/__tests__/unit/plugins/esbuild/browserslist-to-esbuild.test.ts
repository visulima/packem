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
});
