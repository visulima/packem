import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "@visulima/path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveAssets } from "../../../src/exe/assets";

describe(resolveAssets, () => {
    let rootDir: string;

    beforeEach(async () => {
        rootDir = await mkdtemp(join(tmpdir(), "packem-exe-assets-"));

        await mkdir(join(rootDir, "templates"), { recursive: true });
        await mkdir(join(rootDir, "locales"), { recursive: true });
        await mkdir(join(rootDir, "node_modules/pkg"), { recursive: true });

        await writeFile(join(rootDir, "templates/mail.hbs"), "hello");
        await writeFile(join(rootDir, "templates/sms.hbs"), "hi");
        await writeFile(join(rootDir, "locales/en.json"), "{}");
        await writeFile(join(rootDir, "locales/_draft.json"), "{}");
        await writeFile(join(rootDir, "node_modules/pkg/index.js"), "module.exports = 1;");
    });

    afterEach(async () => {
        await rm(rootDir, { force: true, recursive: true });
    });

    it("should return an empty map when no assets are configured", async () => {
        expect.assertions(1);

        await expect(resolveAssets(undefined, rootDir)).resolves.toStrictEqual({ map: {}, totalBytes: 0 });
    });

    it("should expand a single glob and key files by their path relative to the root", async () => {
        expect.assertions(1);

        const { map } = await resolveAssets("templates/**/*.hbs", rootDir);

        expect(Object.keys(map)).toStrictEqual(["templates/mail.hbs", "templates/sms.hbs"]);
    });

    it("should sum the size of the embedded files", async () => {
        expect.assertions(1);

        const { totalBytes } = await resolveAssets("templates/**/*.hbs", rootDir);

        expect(totalBytes).toBe(7);
    });

    it("should apply a negated pattern as an exclusion", async () => {
        expect.assertions(1);

        const { map } = await resolveAssets(["locales/*.json", "!locales/_draft.json"], rootDir);

        expect(Object.keys(map)).toStrictEqual(["locales/en.json"]);
    });

    it("should never walk into node_modules", async () => {
        expect.assertions(1);

        const { map } = await resolveAssets("**/*.js", rootDir).catch(() => {
            return { map: {} };
        });

        expect(Object.keys(map)).toStrictEqual([]);
    });

    it("should produce a stable, sorted key order across runs", async () => {
        expect.assertions(1);

        const first = await resolveAssets(["locales/*.json", "templates/*.hbs"], rootDir);
        const second = await resolveAssets(["templates/*.hbs", "locales/*.json"], rootDir);

        expect(Object.keys(first.map)).toStrictEqual(Object.keys(second.map));
    });

    it("should map absolute paths for the matched files", async () => {
        expect.assertions(1);

        const { map } = await resolveAssets("locales/en.json", rootDir);

        expect(map["locales/en.json"]).toBe(join(rootDir, "locales/en.json"));
    });

    it("should accept an explicit key to path map", async () => {
        expect.assertions(1);

        const { map } = await resolveAssets({ "schema.json": "./locales/en.json" }, rootDir);

        expect(map).toStrictEqual({ "schema.json": join(rootDir, "locales/en.json") });
    });

    it("should normalize backslashes in explicit keys so runtime lookups match", async () => {
        expect.assertions(1);

        const { map } = await resolveAssets({ "a\\b.json": "./locales/en.json" }, rootDir);

        expect(Object.keys(map)).toStrictEqual(["a/b.json"]);
    });

    it("should reject an explicit entry pointing at a missing file", async () => {
        expect.assertions(1);

        await expect(resolveAssets({ missing: "./nope.json" }, rootDir)).rejects.toThrow('The `exe.assets` entry "missing"');
    });

    it("should reject an explicit entry pointing at a directory, and suggest a glob", async () => {
        expect.assertions(1);

        await expect(resolveAssets({ templates: "./templates" }, rootDir)).rejects.toThrow("Use a glob such as");
    });

    it("should reject a glob that matches nothing", async () => {
        expect.assertions(1);

        await expect(resolveAssets("does-not-exist/**", rootDir)).rejects.toThrow("did not match any file");
    });

    it.each([["__packem_sea_manifest__"], ["__packem_sea_bytecode__"], ["__packem_sea_native__/addon.node"]])(
        "should reject the reserved key %s, which packem's own payload uses",
        async (key) => {
            expect.assertions(1);

            await expect(resolveAssets({ [key]: "./locales/en.json" }, rootDir)).rejects.toThrow("is reserved by packem");
        },
    );

    it("should reject a globbed file whose path collides with a reserved key", async () => {
        expect.assertions(1);

        await writeFile(join(rootDir, "__packem_sea_manifest__"), "{}");

        await expect(resolveAssets("__packem_sea_*", rootDir)).rejects.toThrow("is reserved by packem");
    });

    it("should allow a key that merely looks similar", async () => {
        expect.assertions(1);

        const { map } = await resolveAssets({ packem_sea_manifest: "./locales/en.json" }, rootDir);

        expect(Object.keys(map)).toStrictEqual(["packem_sea_manifest"]);
    });

    it("should return an empty map for an empty pattern list", async () => {
        expect.assertions(1);

        await expect(resolveAssets([], rootDir)).resolves.toStrictEqual({ map: {}, totalBytes: 0 });
    });
});
