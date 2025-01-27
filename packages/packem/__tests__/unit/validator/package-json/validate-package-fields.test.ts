import { beforeEach, describe, expect, it, vi } from "vitest";

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
    beforeEach(() => {
        warn.mockClear();
    });

    it('should not warn if "files" field is missing in package.json when validation is enabled', () => {
        expect.assertions(1);

        const context = {
            options: { outDir: "dist", validation: { packageJson: { files: true } } },
            pkg: {},
        };

        validatePackageFields(context as BuildContext);

        expect(warn).not.toHaveBeenCalledWith(context, "The 'files' field is missing in your package.json. Add the files to be included in the package.");
    });

    it('should warn if "main" field is missing in package.json for CJS packages', () => {
        expect.assertions(1);

        const context = {
            options: { validation: { packageJson: { main: true } } },
            pkg: { type: "commonjs" },
        };

        validatePackageFields(context as BuildContext);

        expect(warn).toHaveBeenCalledWith(context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
    });

    it('should warn if "exports" field is missing in package.json for ESM packages when emitCJS is false', () => {
        expect.assertions(1);

        const context = {
            options: { emitCJS: false, validation: { packageJson: { exports: true } } },
            pkg: { type: "module" },
        };

        validatePackageFields(context as BuildContext);

        expect(warn).toHaveBeenCalledWith(context, "The 'exports' field is missing in your package.json. Define module exports explicitly.");
    });

    it('should warn if "types" field is missing in package.json when declaration is enabled', () => {
        expect.assertions(1);

        const context = {
            options: { declaration: true, outDir: "dist", validation: { packageJson: { types: true } } },
            pkg: {
                files: ["dist"],
                main: "dist/index.cjs",
                name: "test",
            },
        };

        validatePackageFields(context as BuildContext);

        expect(warn).toHaveBeenCalledWith(context, "The 'types' field is missing in your package.json. This field should point to your type definitions file.");
    });

    it('should handle empty "files" array in package.json', () => {
        expect.assertions(1);

        const context = {
            options: { outDir: "dist", validation: { packageJson: { files: true } } },
            pkg: { files: [] },
        };

        validatePackageFields(context as unknown as BuildContext);

        expect(warn).toHaveBeenCalledWith(context, "The 'files' field in your package.json is empty. Please specify the files to be included in the package.");
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
        expect(warn).toHaveBeenCalledWith(contextStringBin, "The 'bin' field in your package.json should not use a .mjs extension for CommonJS binaries.");

        validatePackageFields(contextObjectBin as unknown as BuildContext);
        expect(warn).toHaveBeenCalledWith(contextObjectBin, "The 'bin.cli1' field in your package.json should not use a .mjs extension for CommonJS binaries.");
    });

    it("should handle 'name' field in package.json", () => {
        expect.assertions(1);

        const context = {
            options: { validation: { packageJson: { name: true } } },
            pkg: {},
        };

        validatePackageFields(context as BuildContext);

        expect(warn).toHaveBeenCalledWith(context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
    });

    it("should not display a error if the pkg is module and has no cjs files", () => {
        expect.assertions(1);

        const context = {
            options: { declaration: true, outDir: "dist", validation: false },
            pkg: {
                exports: {
                    ".": {
                        default: "./dist/test.mjs",
                        types: "./dist/test.d.ts",
                    },
                },
                files: ["dist"],
                name: "test",
                type: "module",
            },
        };

        validatePackageFields(context as unknown as BuildContext);

        expect(warn).not.toHaveBeenCalled();
    });
});
