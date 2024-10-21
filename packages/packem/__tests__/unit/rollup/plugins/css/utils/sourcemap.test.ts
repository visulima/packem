import { join } from "@visulima/path";
import { describe, expect, it } from "vitest";

import { getMap, mm, stripMap } from "../../../../../../src/rollup/plugins/css/utils/sourcemap";

const fixturePath = join(__dirname, "../../../../../../", "__fixtures__", "css");

describe("sourcemap", () => {
    it("inline map", async () => {
        expect.assertions(3);

        const code =
            '.foo {color: red;background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkBAMAAACCzIhnAAAAG1BMVEXMzMyWlpacnJy+vr6jo6PFxcW3t7eqqqqxsbHbm8QuAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAiklEQVRYhe3QMQ6EIBAF0C+GSInF9mYTs+1ewRsQbmBlayysKefYO2asXbbYxvxHQj6ECQMAEREREf2NQ/fCtp5Zky6vtRMkSJEzhyISynWJnzH6Z8oQlzS7lEc/fLmmQUSvc16OrCPqRl1JePxQYo1ZSWVj9nxrrOb5esw+eXdvzTWfTERERHRXH4tWFZGswQ2yAAAAAElFTkSuQmCC");}';
        await expect(getMap(code)).resolves.toBeUndefined();

        const withBlock = `${code}/*# sourceMappingURL=data:application/json;base64,e1RISVM6SVNBU09VUkNFTUFQU0lNVUxBVElPTn0= */`;
        await expect(getMap(withBlock)).resolves.toBe("{THIS:ISASOURCEMAPSIMULATION}");

        const withInline = `${code}//# sourceMappingURL=data:application/json;base64,e1RISVM6SVNBU09VUkNFTUFQU0lNVUxBVElPTn0=`;
        await expect(getMap(withInline)).resolves.toBe("{THIS:ISASOURCEMAPSIMULATION}");
    });

    it("file map", async () => {
        expect.assertions(3);

        const code = ".foo {color: red;}/*# sourceMappingURL=fixture.css.map */";

        await expect(getMap(code)).rejects.toThrowErrorMatchingSnapshot();
        await expect(getMap(code, "this/is/nonexistant/path.css")).resolves.toBeUndefined();
        await expect(getMap(code, join(fixturePath, "utils/pointless.css"))).resolves.toBe("{THIS:ISASOURCEMAPSIMULATION}");
    });

    it("strip map", () => {
        expect.assertions(2);

        const code = ".foo {color: red;}";
        const withBlock = `${code}/*# sourceMappingURL=fixture.css.map */`;

        expect(stripMap(withBlock)).toBe(".foo {color: red;}");

        const withInline = `${code}//# sourceMappingURL=fixture.css.map`;
        expect(stripMap(withInline)).toBe(".foo {color: red;}");
    });

    it("map modifier", () => {
        expect.assertions(2);

        const map = JSON.stringify({ sources: ["../a/b/../foo/bar.css", "../b/a/../bar/foo.css"] });
        const relativeSource = JSON.stringify(mm(map).relative().toObject()?.sources);

        expect(relativeSource).toBe(JSON.stringify(["../a/foo/bar.css", "../b/bar/foo.css"]));
        expect(mm("thisisnotjson").toString()).toBeUndefined();
    });
});
