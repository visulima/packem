import { describe, expect, it, vi } from "vitest";

import type { BuildContext } from "../../../../src/types";
import validatePackageFields from "../../../../src/validator/package-json/validate-package-fields";

const { warn } = vi.hoisted(() => {
    return {
        warn: vi.fn(),
    };
});

vi.mock("../../../../src/utils/warn", () => {
    return {
        default: warn,
    };
});

describe("validatePackageFields", () => {
    it('should warn if "files" field is missing in package.json when validation is enabled', () => {
        expect.assertions(1);

        const context = {
            options: { outDir: "dist", validation: { packageJson: { files: true } } },
            pkg: {},
        };

        validatePackageFields(context as BuildContext);

        expect(warn).toHaveBeenCalledWith(context, "'files' field is missing in your package.json");
    });

    it('should warn if "main" field is missing in package.json for CJS packages', () => {
        expect.assertions(1);

        const context = {
            options: { validation: { packageJson: { main: true } } },
            pkg: { type: "commonjs" },
        };

        validatePackageFields(context as BuildContext);

        expect(warn).toHaveBeenCalledWith(context, "'main' field is missing in your package.json");
    });

    it('should warn if "exports" field is missing in package.json for ESM packages when emitCJS is false', () => {
        expect.assertions(1);

        const context = {
            options: { emitCJS: false, validation: { packageJson: { exports: true } } },
            pkg: { type: "module" },
        };

        validatePackageFields(context as BuildContext);

        expect(warn).toHaveBeenCalledWith(context, "'exports' field is missing in your package.json");
    });

    it('should warn if "types" field is missing in package.json when declaration is enabled', () => {
        expect.assertions(1);

        const context = {
            options: { declaration: true, validation: { packageJson: { types: true } } },
            pkg: {},
        };

        validatePackageFields(context as BuildContext);

        expect(warn).toHaveBeenCalledWith(context, "'types' field is missing in your package.json");
    });

    it('should handle empty "files" array in package.json', () => {
        expect.assertions(1);

        const context = {
            options: { outDir: "dist", validation: { packageJson: { files: true } } },
            pkg: { files: [] },
        };

        validatePackageFields(context as unknown as BuildContext);

        expect(warn).toHaveBeenCalledWith(context, "'files' field is empty in your package.json");
    });

    it('should handle "bin" field as both string and object in package.json', () => {
        expect.assertions(2);

        const contextStringBin = {
            options: { validation: { packageJson: { bin: true } } },
            pkg: { bin: "bin/index.mjs", type: "commonjs" },
        };
        const contextObjectBin = {
            options: { validation: { packageJson: { bin: true } } },
            pkg: { bin: { cli1: "bin/cli1.mjs", cli2: "bin/cli2.cjs" }, type: "commonjs" },
        };

        validatePackageFields(contextStringBin as BuildContext);
        expect(warn).toHaveBeenCalledWith(contextStringBin, "'bin' field in your package.json should not have a .mjs extension");

        validatePackageFields(contextObjectBin as unknown as BuildContext);
        expect(warn).toHaveBeenCalledWith(contextObjectBin, "'bin.cli1' field in your package.json should not have a .mjs extension");
    });
});
