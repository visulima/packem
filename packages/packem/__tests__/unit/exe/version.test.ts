import { describe, expect, it } from "vitest";

import { isAtLeast, parseVersion } from "../../../src/exe/version";

describe("exe version helpers", () => {
    describe(parseVersion, () => {
        it.each([
            ["an exact version", "25.7.0", { major: 25, minor: 7, patch: 0 }],
            ["a prerelease", "26.0.0-rc.1", { major: 26, minor: 0, patch: 0, prerelease: "rc.1" }],
            ["build metadata, which is dropped", "25.7.0+build.5", { major: 25, minor: 7, patch: 0 }],
            ["surrounding whitespace", "  25.7.0 ", { major: 25, minor: 7, patch: 0 }],
        ])("should parse %s", (_label, value, expected) => {
            expect.assertions(1);

            expect(parseVersion(value)).toStrictEqual(expected);
        });

        it.each([["25"], ["25.7"], ["v25.7.0"], ["latest"], [""], ["25.7.0.x"], ["x.y.z"]])("should reject %s", (value) => {
            expect.assertions(1);

            expect(parseVersion(value)).toBeUndefined();
        });
    });

    describe(isAtLeast, () => {
        it("should accept the exact minimum", () => {
            expect.assertions(1);

            expect(isAtLeast("25.7.0", "25.7.0")).toBe(true);
        });

        it.each([
            ["25.7.1", true],
            ["25.8.0", true],
            ["26.0.0", true],
            ["25.6.9", false],
            ["24.99.99", false],
            ["25.7.0", true],
        ])("should compare %s against 25.7.0 as %s", (version, expected) => {
            expect.assertions(1);

            expect(isAtLeast(version, "25.7.0")).toBe(expected);
        });

        it("should compare numerically rather than lexically", () => {
            expect.assertions(2);

            expect(isAtLeast("25.10.0", "25.7.0")).toBe(true);
            expect(isAtLeast("100.0.0", "25.7.0")).toBe(true);
        });

        it("should sort a prerelease below the release it leads to", () => {
            expect.assertions(1);

            expect(isAtLeast("25.7.0-rc.1", "25.7.0")).toBe(false);
        });

        it("should accept a prerelease of a strictly higher version, so nightlies work", () => {
            expect.assertions(1);

            expect(isAtLeast("25.8.0-nightly20260101", "25.7.0")).toBe(true);
        });

        it.each([["not-a-version"], ["25.7"], [""]])("should reject the unparsable version %s", (version) => {
            expect.assertions(1);

            expect(isAtLeast(version, "25.7.0")).toBe(false);
        });

        it("should reject an unparsable minimum", () => {
            expect.assertions(1);

            expect(isAtLeast("25.7.0", "25.7")).toBe(false);
        });
    });
});
