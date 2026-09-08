import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "@visulima/path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashFile, resolveChecksumAlgorithm, writeChecksum } from "../../../src/exe/checksum";

describe("exe checksums", () => {
    describe(resolveChecksumAlgorithm, () => {
        it.each([[undefined], [false]])("should return undefined for %s", (value) => {
            expect.assertions(1);

            expect(resolveChecksumAlgorithm(value)).toBeUndefined();
        });

        it("should default `true` to sha256", () => {
            expect.assertions(1);

            expect(resolveChecksumAlgorithm(true)).toBe("sha256");
        });

        it("should pass an explicit algorithm through", () => {
            expect.assertions(1);

            expect(resolveChecksumAlgorithm("sha512")).toBe("sha512");
        });
    });

    describe("writing digests", () => {
        let directory: string;
        let filePath: string;

        beforeEach(async () => {
            directory = await mkdtemp(join(tmpdir(), "packem-exe-checksum-"));
            filePath = join(directory, "app");

            await writeFile(filePath, "binary-contents");
        });

        afterEach(async () => {
            await rm(directory, { force: true, recursive: true });
        });

        it("should hash the file contents", async () => {
            expect.assertions(1);

            const expected = createHash("sha256").update("binary-contents").digest("hex");

            await expect(hashFile(filePath, "sha256")).resolves.toBe(expected);
        });

        it("should write a sidecar in the coreutils format", async () => {
            expect.assertions(2);

            const { digest, path } = await writeChecksum(filePath, "sha256");

            expect(path).toBe(`${filePath}.sha256`);
            await expect(readFile(path, "utf8")).resolves.toBe(`${digest}  app\n`);
        });

        it("should support sha512", async () => {
            expect.assertions(2);

            const { digest, path } = await writeChecksum(filePath, "sha512");

            expect(path).toBe(`${filePath}.sha512`);
            expect(digest).toHaveLength(128);
        });
    });
});
