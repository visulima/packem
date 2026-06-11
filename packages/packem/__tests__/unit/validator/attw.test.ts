import { describe, expect, it } from "vitest";

import { parsePackFilename } from "../../../src/validator/attw";

describe("parsePackFilename", () => {
    it("parses npm pack --json output (JSON array with basename filename)", () => {
        expect.assertions(1);

        // npm emits an array of pack results; `filename` is a basename only.
        const stdout = JSON.stringify([
            {
                filename: "my-pkg-1.0.0.tgz",
                files: [{ path: "index.js" }],
                name: "my-pkg",
                version: "1.0.0",
            },
        ]);

        expect(parsePackFilename(stdout)).toBe("my-pkg-1.0.0.tgz");
    });

    it("parses pnpm pack --json output (JSON object with absolute filename)", () => {
        expect.assertions(1);

        // pnpm emits a single object with an absolute path.
        const stdout = JSON.stringify({
            filename: "/tmp/packem-attw-abc/my-pkg-1.0.0.tgz",
            files: [{ path: "index.js" }],
            name: "my-pkg",
            version: "1.0.0",
        });

        expect(parsePackFilename(stdout)).toBe("/tmp/packem-attw-abc/my-pkg-1.0.0.tgz");
    });

    it("parses yarn-style normalised output (JSON array)", () => {
        expect.assertions(1);

        // fixYarnStdout produces a JSON array of line objects; the pack result
        // entry carries the tarball basename.
        const stdout = JSON.stringify([
            {
                filename: "my-pkg-2.3.4.tgz",
                name: "my-pkg",
                version: "2.3.4",
            },
        ]);

        expect(parsePackFilename(stdout)).toBe("my-pkg-2.3.4.tgz");
    });

    it("throws a clear error when no filename is present", () => {
        expect.assertions(1);

        expect(() => parsePackFilename(JSON.stringify({ name: "no-filename" }))).toThrow(/Invalid npm pack output format/);
    });

    it("throws when the array is empty", () => {
        expect.assertions(1);

        expect(() => parsePackFilename("[]")).toThrow(/Invalid npm pack output format/);
    });
});
