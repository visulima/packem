import { describe, expect, it } from "vitest";

import lowestCommonAncestor from "../../../../../src/plugins/isolated-declarations/utils/lowest-common-ancestor";

describe(lowestCommonAncestor, () => {
    it("should return the lowest common ancestor", () => {
        expect.assertions(3);

        expect(lowestCommonAncestor("/a/b", "/a")).toBe("/a");
        expect(lowestCommonAncestor(String.raw`C:\a\b`, String.raw`C:\a`)).toBe("C:/a");
        expect(lowestCommonAncestor(String.raw`C:\a\b`, "C:/a/b")).toBe("C:/a/b");
    });

    it("returns a POSIX-style path even for a single Windows input so downstream splices never leak backslashes", () => {
        expect.assertions(1);

        // Regression: splicing a Windows dirname like `C:\a\b\src` into a rewritten import
        // specifier would put `\u` / `\a` sequences inside a string literal, which TypeScript's
        // scanner interprets as Unicode escapes and fails with TS1125 on Windows CI.
        expect(lowestCommonAncestor(String.raw`C:\a\b\src\index.ts`)).toBe("C:/a/b/src");
    });
});
