import { describe, expect, it } from "vitest";

import lowestCommonAncestor from "../../../../../src/plugins/isolated-declarations/utils/lowest-common-ancestor";

describe(lowestCommonAncestor, () => {
    it("should return the lowest common ancestor", () => {
        expect.assertions(3);

        expect(lowestCommonAncestor("/a/b", "/a")).toBe("/a");
        expect(lowestCommonAncestor(String.raw`C:\a\b`, String.raw`C:\a`)).toBe("C:/a");
        expect(lowestCommonAncestor(String.raw`C:\a\b`, "C:/a/b")).toBe("C:/a/b");
    });
});
