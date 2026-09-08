import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "@visulima/path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getAssetJson, getAssetText, isSea, setAssetRoot } from "../../../src/sea";

// Outside an executable the helper reads from disk. Those reads have to agree with the
// embedded lookup, which is a plain map lookup on the key, so a key is a path and never
// a URL — `#`, `?` and `%` are ordinary characters in a file name.
describe("sea asset keys on the development fallback", () => {
    let root: string;

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), "packem-sea-keys-"));

        await mkdir(join(root, "docs"), { recursive: true });
        await mkdir(join(root, "a b"), { recursive: true });

        await writeFile(join(root, "docs/notes#1.md"), "fragment");
        await writeFile(join(root, "docs/query?x.md"), "query");
        await writeFile(join(root, "docs/100%.md"), "percent");
        await writeFile(join(root, "a b/c.json"), '{"spaced":true}');
        await writeFile(join(root, "plain.txt"), "plain");

        setAssetRoot(root);
    });

    afterAll(async () => {
        await rm(root, { force: true, recursive: true });
    });

    it("should report that it is not running inside an executable", () => {
        expect.assertions(1);

        expect(isSea()).toBe(false);
    });

    it("should read a plain key", async () => {
        expect.assertions(1);

        await expect(getAssetText("plain.txt")).resolves.toBe("plain");
    });

    it.each([
        ["docs/notes#1.md", "fragment"],
        ["docs/query?x.md", "query"],
        ["docs/100%.md", "percent"],
    ])("should treat %s as a file name rather than URL syntax", async (key, expected) => {
        expect.assertions(1);

        await expect(getAssetText(key)).resolves.toBe(expected);
    });

    it("should read a key containing a space", async () => {
        expect.assertions(1);

        await expect(getAssetJson<{ spaced: boolean }>("a b/c.json")).resolves.toStrictEqual({ spaced: true });
    });

    it("should fail clearly for a key that does not exist", async () => {
        expect.assertions(1);

        await expect(getAssetText("missing.txt")).rejects.toThrow("ENOENT");
    });
});
