import postcss from "postcss";
import { describe, expect,it } from "vitest";

import type { UrlOptions } from "../../../../../../../src/rollup/plugins/css/loaders/postcss/url";
import urlResolver from "../../../../../../../src/rollup/plugins/css/loaders/postcss/url";

const validateUrl = async (css: string, options: UrlOptions = {}, from = "dummy"): Promise<string> => {
    const data = await postcss(urlResolver(options)).process(css, { from });
    const [warning] = data.warnings();

    return (warning as postcss.Warning).text;
};

describe("url resolver", () => {
    it("warns about being empty", async () => {
        expect.assertions(1);

        const warning = await validateUrl(".foo{background:url()}");

        expect(warning).toMatchSnapshot("warning");
    });

    it("warns about being unresolved", async () => {
        expect.assertions(1);

        const warning = await validateUrl(".foo{background:url(bg.png)}");

        expect(warning).toMatchSnapshot("warning");
    });

    it("warns about incorrect resolving", async () => {
        expect.assertions(1);

        const warning = await validateUrl(".foo{background:url(bg.png)}", {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-return
            resolve: () => "lol" as any,
        });

        expect(warning).toMatchSnapshot("warning");
    });
});
