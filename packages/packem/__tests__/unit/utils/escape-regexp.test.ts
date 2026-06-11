import { describe, expect, it } from "vitest";

import escapeRegExp from "../../../src/utils/escape-regexp";

describe("escapeRegExp", () => {
    it("escapes regex metacharacters so they match literally", () => {
        expect.assertions(2);

        const value = "src+dist(.)";
        const escaped = escapeRegExp(value);

        expect(new RegExp(`^${escaped}$`).test(value)).toBe(true);
        // The unescaped form would mis-match because of the regex metacharacters.
        expect(new RegExp(`^${escaped}$`).test("srcdistX")).toBe(false);
    });

    it("leaves plain directory names unchanged in behaviour", () => {
        expect.assertions(1);

        expect(escapeRegExp("src")).toBe("src");
    });

    it("escapes a dot so it does not match arbitrary characters", () => {
        expect.assertions(2);

        const escaped = escapeRegExp("a.b");

        expect(new RegExp(escaped).test("a.b")).toBe(true);
        expect(new RegExp(escaped).test("axb")).toBe(false);
    });
});
