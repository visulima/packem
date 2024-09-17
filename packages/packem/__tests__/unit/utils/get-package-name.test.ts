import { describe, expect, it } from "vitest";

import getPackageName from "../../../src/utils/get-package-name";

describe('getPackageName', () => {
    it('should return the package name for a valid scoped package id', () => {
        expect.assertions(1);

        const result = getPackageName("@scope/package");

        expect(result).toBe("@scope/package");
    });

    it('should handle id with multiple slashes correctly', () => {
        expect.assertions(1);

        const result = getPackageName("@scope/package/subpackage");

        expect(result).toBe("@scope/package");
    });

    it('should handle id with no slashes correctly', () => {
        expect.assertions(1);

        const result = getPackageName("package");

        expect(result).toBe("package");
    });
});
