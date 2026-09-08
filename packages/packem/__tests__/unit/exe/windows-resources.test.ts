import { describe, expect, it } from "vitest";

import { buildVersionStrings, toVersionQuad } from "../../../src/exe/windows-resources";

describe("exe windows resources", () => {
    describe(toVersionQuad, () => {
        it("should split a semver version", () => {
            expect.assertions(1);

            expect(toVersionQuad("2.1.3")).toStrictEqual([2, 1, 3, 0]);
        });

        it("should drop the prerelease tag", () => {
            expect.assertions(1);

            expect(toVersionQuad("2.1.3-beta.4")).toStrictEqual([2, 1, 3, 0]);
        });

        it("should coerce a partial version", () => {
            expect.assertions(1);

            expect(toVersionQuad("2.1")).toStrictEqual([2, 1, 0, 0]);
        });

        it.each([[undefined], [""], ["not-a-version"]])("should fall back to zeroes for %s", (value) => {
            expect.assertions(1);

            expect(toVersionQuad(value)).toStrictEqual([0, 0, 0, 0]);
        });
    });

    describe(buildVersionStrings, () => {
        const packageJson = {
            author: { name: "Acme Inc." },
            description: "Does the thing",
            name: "acme-cli",
            version: "2.1.0",
        };

        it("should derive every field from package.json", () => {
            expect.assertions(1);

            expect(buildVersionStrings({}, packageJson, "acme.exe")).toStrictEqual({
                CompanyName: "Acme Inc.",
                FileDescription: "Does the thing",
                FileVersion: "2.1.0",
                InternalName: "acme-cli",
                OriginalFilename: "acme.exe",
                ProductName: "acme-cli",
                ProductVersion: "2.1.0",
            });
        });

        it("should read a string author field", () => {
            expect.assertions(1);

            expect(buildVersionStrings({}, { ...packageJson, author: "Jane <jane@example.com>" }, "acme.exe").CompanyName).toBe("Jane <jane@example.com>");
        });

        it("should let explicit fields win over package.json", () => {
            expect.assertions(2);

            const strings = buildVersionStrings({ companyName: "Other Ltd.", productVersion: "9.9.9" }, packageJson, "acme.exe");

            expect(strings.CompanyName).toBe("Other Ltd.");
            expect(strings.ProductVersion).toBe("9.9.9");
        });

        it("should omit fields that would render as blank rows", () => {
            expect.assertions(2);

            const strings = buildVersionStrings({}, { name: "acme-cli", version: "1.0.0" }, "acme.exe");

            expect(strings).not.toHaveProperty("CompanyName");
            expect(strings).not.toHaveProperty("LegalCopyright");
        });

        it("should fall back to the package name when there is no description", () => {
            expect.assertions(1);

            expect(buildVersionStrings({}, { name: "acme-cli" }, "acme.exe").FileDescription).toBe("acme-cli");
        });

        it("should default the versions when package.json has none", () => {
            expect.assertions(2);

            const strings = buildVersionStrings({}, { name: "acme-cli" }, "acme.exe");

            expect(strings.FileVersion).toBe("0.0.0");
            expect(strings.ProductVersion).toBe("0.0.0");
        });

        it("should keep an explicitly set copyright", () => {
            expect.assertions(1);

            expect(buildVersionStrings({ legalCopyright: "© 2026 Acme" }, packageJson, "acme.exe").LegalCopyright).toBe("© 2026 Acme");
        });
    });
});
