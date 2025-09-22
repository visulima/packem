import { describe, expect, it } from "vitest";

import validateAliasEntries from "../../../src/validator/validate-alias-entries";

describe(validateAliasEntries, () => {
    it("should accept valid alias names and process them correctly", () => {
        expect.assertions(1);

        const entries = {
            "#": __dirname,
            "@": __dirname,
            "@components": __dirname,
            "@components/test": __dirname,
            validAlias: __dirname,
            "~": __dirname,
        };

        expect(() => validateAliasEntries(entries)).not.toThrow();
    });

    it("should accept alias names starting with a letter or underscore", () => {
        expect.assertions(1);

        const entries = { _validAlias: __dirname };

        expect(() => validateAliasEntries(entries)).not.toThrow();
    });

    it("should accept alias names containing only valid characters", () => {
        expect.assertions(1);

        const entries = { validAlias123_: __dirname };

        expect(() => validateAliasEntries(entries)).not.toThrow();
    });

    it("should accept non-reserved alias names", () => {
        expect.assertions(1);

        const entries = { myAlias: __dirname };

        expect(() => validateAliasEntries(entries)).not.toThrow();
    });

    it("should resolve target paths that exist correctly", () => {
        expect.assertions(1);

        const entries = { validAlias: __dirname };

        expect(() => validateAliasEntries(entries)).not.toThrow();
    });

    it("should throw an error for empty alias names", () => {
        expect.assertions(1);

        const entries = { "": "/valid/path" };

        expect(() => validateAliasEntries(entries)).toThrow("Alias name \"\" is invalid. Alias names should be non-empty strings.");
    });

    it("should throw an error for alias names starting with invalid characters", () => {
        expect.assertions(1);

        const entries = { "1invalid": "/valid/path" };

        expect(() => validateAliasEntries(entries)).toThrow(
            "Alias name \"1invalid\" is invalid. Alias names should start with a letter or underscore and only contain letters, numbers, underscores, and dashes.",
        );
    });

    it("should throw an error for alias names containing invalid characters", () => {
        expect.assertions(1);

        const entries = { "invalid!alias": "/valid/path" };

        expect(() => validateAliasEntries(entries)).toThrow(
            "Alias name \"invalid!alias\" is invalid. Alias names should start with a letter or underscore and only contain letters, numbers, underscores, and dashes.",
        );
    });

    it("should throw an error for reserved keyword alias names", () => {
        expect.assertions(1);

        const entries = { class: "/valid/path" };

        expect(() => validateAliasEntries(entries)).toThrow("Alias name \"class\" is a reserved keyword and cannot be used.");
    });

    it("should throw an error for target paths that do not exist", () => {
        expect.assertions(1);

        const entries = { validAlias: "/invalid/path" };

        expect(() => validateAliasEntries(entries)).toThrow("Target path \"/invalid/path\" for alias \"validAlias\" does not exist.");
    });

    it("should throw an error if the entries object contains @/ or ~/", () => {
        expect.assertions(2);

        const entries = { "@/validAlias": "/valid/path" };

        expect(() => validateAliasEntries(entries)).toThrow(
            "Alias name \"@/validAlias\" is invalid. Alias names should start with a letter or underscore and only contain letters, numbers, underscores, and dashes.",
        );

        const entries2 = { "~/validAlias": "/valid/path" };

        expect(() => validateAliasEntries(entries2)).toThrow(
            "Alias name \"~/validAlias\" is invalid. Alias names should start with a letter or underscore and only contain letters, numbers, underscores, and dashes.",
        );
    });
});
