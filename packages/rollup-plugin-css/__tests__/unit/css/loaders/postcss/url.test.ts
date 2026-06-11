import postcss from "postcss";
import { describe, expect, it } from "vitest";

import type { UrlOptions } from "../../../../../src/loaders/postcss/url";
import urlResolver from "../../../../../src/loaders/postcss/url";

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
        expect.assertions(2);

        const warning = await validateUrl(".foo{background:url(bg.png)}");

        // The stable prefix is asserted directly; the appended resolver cause
        // contains absolute, machine-specific paths so it is not snapshotted.
        expect(warning).toContain("Unresolved URL `bg.png` in `background:url(bg.png)`");
        expect(warning).toContain("URL resolver could not resolve");
    });

    it("warns about incorrect resolving", async () => {
        expect.assertions(1);

        const warning = await validateUrl(".foo{background:url(bg.png)}", {
            resolve: () => "lol" as unknown as ReturnType<NonNullable<UrlOptions["resolve"]>>,
        });

        expect(warning).toMatchSnapshot("warning");
    });
});
