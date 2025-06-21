import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BuildContext } from "../../src/types";
import validateEngines from "../../src/validator/package-json/validate-engines";
import warn from "../../src/utils/warn";

// Mock the warn function
vi.mock("../../src/utils/warn", () => ({
    default: vi.fn(),
}));

const mockWarn = vi.mocked(warn);

describe("validateEngines", () => {
    const createMockContext = (pkg: any, validation: any = {}): BuildContext => ({
        options: {
            validation: {
                packageJson: validation,
            },
        },
        pkg,
    } as BuildContext);

    beforeEach(() => {
        mockWarn.mockClear();
    });

    it("should warn when engines.node is missing", () => {
        const context = createMockContext({
            name: "test-package",
        });

        validateEngines(context);

        expect(mockWarn).toHaveBeenCalledWith(
            context,
            "The 'engines.node' field is missing in your package.json. Consider adding \"engines\": { \"node\": \">=18.0.0\" } to specify Node.js version requirements.",
        );
    });

    it("should not warn when engines.node is present and valid", () => {
        const context = createMockContext({
            name: "test-package",
            engines: {
                node: ">=18.0.0",
            },
        });

        validateEngines(context);

        expect(mockWarn).not.toHaveBeenCalled();
    });

    it("should warn when engines.node has invalid semver range", () => {
        const context = createMockContext({
            name: "test-package",
            engines: {
                node: "invalid-version-range",
            },
        });

        validateEngines(context);

        expect(mockWarn).toHaveBeenCalledWith(
            context,
            "Invalid Node.js version range \"invalid-version-range\" in engines.node field. Please use a valid semver range like \">=18.0.0\".",
        );
    });

    it("should throw error when current Node.js version does not satisfy engines.node requirement", () => {
        const context = createMockContext({
            name: "test-package",
            engines: {
                node: ">=99.0.0", // This should not satisfy any current Node.js version
            },
        });

        expect(() => validateEngines(context)).toThrow(
            "Node.js version mismatch: Current version v18.20.0 does not satisfy the required range \">=99.0.0\" specified in package.json engines.node field.",
        );
    });

    it("should work with complex semver ranges", () => {
        const context = createMockContext({
            name: "test-package",
            engines: {
                node: "^18.0.0 || ^20.0.0", // This should satisfy Node.js 18.x
            },
        });

        validateEngines(context);

        expect(mockWarn).not.toHaveBeenCalled();
    });

    it("should skip validation when engines validation is disabled", () => {
        const context = createMockContext(
            {
                name: "test-package",
            },
            { engines: false },
        );

        validateEngines(context);

        expect(mockWarn).not.toHaveBeenCalled();
    });

    it("should use default version range when engines.node is missing", () => {
        const context = createMockContext({
            name: "test-package",
        });

        validateEngines(context);

        expect(mockWarn).toHaveBeenCalledWith(
            context,
            expect.stringContaining(">=18.0.0"),
        );
    });
});
