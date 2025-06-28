import { cwd } from "node:process";

import { join, relative } from "@visulima/path";
import { describe, expect, it } from "vitest";

import loadModule from "../../../../src/utils/load-module";

const fixturePath = join(__dirname, "../../../../__fixtures__/css");

describe("load-module", () => {
    it("should return undefined on wrong path", async () => {
        expect.assertions(1);

        await expect(await loadModule("totallyWRONGPATH/here", cwd())).toBeUndefined();
    });

    it("should return correct cjs module on cwd path", async () => {
        expect.assertions(1);

        await expect(await loadModule(relative(cwd(), join(fixturePath, "utils/fixture")), cwd())).toBe("this is fixture");
    });

    it("should return correct cjs module on absolute path", async () => {
        expect.assertions(1);

        await expect(await loadModule(join(fixturePath, "utils/fixture"), cwd())).toBe("this is fixture");
    });

    it("should return correct esm module on cwd path", async () => {
        expect.assertions(1);

        await expect(await loadModule(relative(cwd(), join(fixturePath, "utils-esm/fixture")), cwd())).toBe("this is fixture");
    });

    it("should return correct esm module on absolute path", async () => {
        expect.assertions(1);

        await expect(await loadModule(join(fixturePath, "utils-esm/fixture"), cwd())).toBe("this is fixture");
    });
});
