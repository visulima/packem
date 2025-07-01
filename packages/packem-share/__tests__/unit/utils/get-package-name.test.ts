import { describe, expect, it } from "vitest";

import getPackageName from "../../../src/utils/get-package-name";

describe(getPackageName, () => {
    it("should return the package name for a scoped package", () => {
        expect.assertions(1);

        const result = getPackageName("@scope/package-name");

        expect(result).toBe("@scope/package-name");
    });

    it("should return the package name for a regular package", () => {
        expect.assertions(1);

        const result = getPackageName("package-name");

        expect(result).toBe("package-name");
    });

    it("should handle package names with paths", () => {
        expect.assertions(1);

        const result = getPackageName("@scope/package-name/sub/path");

        expect(result).toBe("@scope/package-name");
    });

    it("should handle regular package names with paths", () => {
        expect.assertions(1);

        const result = getPackageName("package-name/sub/path");

        expect(result).toBe("package-name");
    });

    it("should handle empty string", () => {
        expect.assertions(1);

        const result = getPackageName("");

        expect(result).toBe("");
    });
});
