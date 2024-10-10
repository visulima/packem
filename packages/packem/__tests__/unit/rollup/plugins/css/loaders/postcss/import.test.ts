import { join } from "@visulima/path";
import postcss from "postcss";
import { describe, expect,it } from "vitest";

import type { ImportOptions } from "../../../../../../../src/rollup/plugins/css/loaders/postcss/import";
import importer from "../../../../../../../src/rollup/plugins/css/loaders/postcss/import";

const fixturePath = join(__dirname, "../../../../../../..", "__fixtures__", "css");

const validateImport = async (css: string, options: ImportOptions = {}, from = "dummy"): Promise<string> => {
    const data = await postcss(importer(options)).process(css, { from });
    const [warning] = data.warnings();

    return (warning as postcss.Warning).text;
};

describe("importer", () => {
    it("warns about not being top level", async () => {
        expect.assertions(1);

        const warning = await validateImport('.foo{@import "smh.css"}');

        expect(warning).toMatchSnapshot("warning");
    });

    it("warns about lack of termination", async () => {
        expect.assertions(1);

        const warning = await validateImport('@import "smh.css"\n.foo{color:red}');

        expect(warning).toMatchSnapshot("warning");
    });

    it("warns about no url", async () => {
        expect.assertions(1);

        const warning = await validateImport("@import");

        expect(warning).toMatchSnapshot("warning");
    });

    it("warns about empty url", async () => {
        expect.assertions(1);

        const warning = await validateImport('@import " "');

        expect(warning).toMatchSnapshot("warning");
    });

    it("warns about invalid url function", async () => {
        expect.assertions(1);

        const warning = await validateImport('@import omg("smh.css")');

        expect(warning).toMatchSnapshot("warning");
    });

    it("warns about being unresolved", async () => {
        expect.assertions(1);

        const warning = await validateImport('@import "smh.css"');

        expect(warning).toMatchSnapshot("warning");
    });

    it("warns about incorrect resolving", async () => {
        expect.assertions(1);

        const warning = await validateImport('@import "smh.css"', {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-return
            resolve: () => "lol" as any,
        });

        expect(warning).toMatchSnapshot("warning");
    });

    it("warns about loop", async () => {
        expect.assertions(1);

        const warning = await validateImport('@import "./foo.css"', {}, join(fixturePath, "simple/foo.css"));

        expect(warning).toMatchSnapshot("warning");
    });
});
