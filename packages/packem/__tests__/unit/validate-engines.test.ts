import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BuildContext } from "../../src/types";
import warn from "../../src/utils/warn";
import validateEngines from "../../src/validator/package-json/validate-engines";

// Mock the warn function
vi.mock("../../src/utils/warn", () => {
    return {
        default: vi.fn(),
    };
});

const mockWarn = vi.mocked(warn);

describe(validateEngines, () => {
    const createMockContext = (package_: any, validation: any = {}): BuildContext => ({
        options: {
            validation: {
                packageJson: validation,
            },
        },
        pkg: package_,
    } as BuildContext);

    beforeEach(() => {
        mockWarn.mockClear();
    });

    it("should warn when engines.node is missing", () => {
        expect.assertions(1);

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
        expect.assertions(1);

        const context = createMockContext({
            engines: {
                node: ">=18.0.0",
            },
            name: "test-package",
        });

        validateEngines(context);

        expect(mockWarn).not.toHaveBeenCalled();
    });

    it("should warn when engines.node has invalid semver range", () => {
        expect.assertions(1);

        const context = createMockContext({
            engines: {
                node: "invalid-version-range",
            },
            name: "test-package",
        });

        validateEngines(context);

        expect(mockWarn).toHaveBeenCalledWith(
            context,
            "Invalid Node.js version range \"invalid-version-range\" in engines.node field. Please use a valid semver range like \">=18.0.0\".",
        );
    });

    it("should throw error when current Node.js version does not satisfy engines.node requirement", () => {
        expect.assertions(1);

        const context = createMockContext({
            engines: {
                node: ">=99.0.0", // This should not satisfy any current Node.js version
            },
            name: "test-package",
        });

        expect(() => validateEngines(context)).toThrow(
            `Node.js version mismatch: Current version ${process.version} does not satisfy the required range \">=99.0.0\" specified in package.json engines.node field.`,
        );
    });

    it("should work with complex semver ranges", () => {
        expect.assertions(1);

        const context = createMockContext({
            engines: {
                node: "^18.0.0 || ^20.0.0", // This should satisfy Node.js 18.x
            },
            name: "test-package",
        });

        validateEngines(context);

        expect(mockWarn).not.toHaveBeenCalled();
    });

    it("should skip validation when engines validation is disabled", () => {
        expect.assertions(1);

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
        expect.assertions(1);

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
