import type { PackageJson } from "@visulima/package";
import { describe, expect, it } from "vitest";

import { extractExportFilenames } from "../../../src/utils/extract-export-filenames";

describe("extractExportFilenames", () => {
    it("should return an empty array when packageExports is falsy", () => {
        expect.assertions(1);

        const packageExports = null;
        const type = "esm";

        const result = extractExportFilenames(packageExports, type, false);

        expect(result).toStrictEqual([]);
    });

    it("should return an array with a single object when packageExports is a string", () => {
        expect.assertions(1);

        const packageExports = "index.js";
        const type = "esm";

        const result = extractExportFilenames(packageExports, type, false);

        expect(result).toStrictEqual([{ file: "index.js", key: "exports", type: "esm" }]);
    });

    it("should return an array of objects when packageExports is an object", () => {
        expect.assertions(1);

        const packageExports = {
            "./lib": "./lib/index.js",
            "./src": "./src/index.js",
        };
        const type = "esm";

        const result = extractExportFilenames(packageExports, type, false);

        expect(result).toStrictEqual([
            { file: "./lib/index.js", key: "exports", type: "esm" },
            { file: "./src/index.js", key: "exports", type: "esm" },
        ]);
    });

    it("should infer the export type from the filename when it is provided", () => {
        expect.assertions(1);

        const packageExports = {
            "./lib": "./lib/index.js",
            "./src": "./src/index.mjs",
        };
        const type = "cjs";

        const result = extractExportFilenames(packageExports, type, false);

        expect(result).toStrictEqual([
            { file: "./lib/index.js", key: "exports", type: "cjs" },
            { file: "./src/index.mjs", key: "exports", type: "esm" },
        ]);
    });

    it('should infer the export type as "esm" when condition is "import"', () => {
        expect.assertions(1);

        const packageExports = {
            "./lib": {
                import: "./lib/index.js",
            },
            "./src": {
                import: "./src/index.js",
            },
        };
        const type = "cjs";

        const result = extractExportFilenames(packageExports, type, false);

        expect(result).toStrictEqual([
            { file: "./lib/index.js", key: "exports", subKey: "import", type: "esm" },
            { file: "./src/index.js", key: "exports", subKey: "import", type: "esm" },
        ]);
    });

    it('should infer the export type as "esm" when condition is "import" and "cjs" when condition is "require"', () => {
        expect.assertions(1);

        const packageExports = {
            "./lib": {
                import: "./lib/index.mjs",
                require: "./src/index.cjs",
            },
            "./src": {
                import: "./src/index.mjs",
                require: "./src/index.cjs",
            },
        };
        const type = "cjs";

        const result = extractExportFilenames(packageExports, type, false);

        expect(result).toStrictEqual([
            {
                file: "./lib/index.mjs",
                key: "exports",
                subKey: "import",
                type: "esm",
            },
            {
                file: "./src/index.cjs",
                key: "exports",
                subKey: "require",
                type: "cjs",
            },
            {
                file: "./src/index.mjs",
                key: "exports",
                subKey: "import",
                type: "esm",
            },
            {
                file: "./src/index.cjs",
                key: "exports",
                subKey: "require",
                type: "cjs",
            },
        ]);
    });

    it('should throw an error and exit with code 1 when inferredType does not match the package.json "type" field', () => {
        expect.assertions(1);

        const packageExports = "./src/index.cjs";
        const type = "esm";

        expect(() => {
            extractExportFilenames(packageExports, type, false);
        }).toThrow('Exported file "./src/index.cjs" has an extension that does not match the package.json type "module".');
    });

    it("should infer the correct export type", () => {
        expect.assertions(1);

        const packageExports: PackageJson["exports"] = {
            ".": {
                default: {
                    types: "./dist/create-bundler.d.ts",
                    // eslint-disable-next-line perfectionist/sort-objects
                    default: "./dist/create-bundler.js",
                },
                import: {
                    types: "./dist/create-bundler.d.mts",
                    // eslint-disable-next-line perfectionist/sort-objects
                    default: "./dist/create-bundler.mjs",
                },
                node: {
                    module: "./dist/create-bundler.js",
                    require: "./dist/create-bundler.cjs",
                },
                require: {
                    types: "./dist/create-bundler.d.cts",
                    // eslint-disable-next-line perfectionist/sort-objects
                    default: "./dist/create-bundler.cjs",
                },
            },
        };
        const type = "cjs";

        const result = extractExportFilenames(packageExports, type, true);

        expect(result).toStrictEqual([
            {
                file: "./dist/create-bundler.d.ts",
                key: "exports",
                subKey: "types",
                type: "cjs",
            },
            {
                file: "./dist/create-bundler.js",
                key: "exports",
                subKey: "default",
                type: "cjs",
            },
            {
                file: "./dist/create-bundler.d.mts",
                key: "exports",
                subKey: "types",
                type: "esm",
            },
            {
                file: "./dist/create-bundler.mjs",
                key: "exports",
                subKey: "default",
                type: "esm",
            },
            {
                file: "./dist/create-bundler.js",
                key: "exports",
                type: "esm",
            },
            {
                file: "./dist/create-bundler.cjs",
                key: "exports",
                subKey: "require",
                type: "cjs",
            },
            {
                file: "./dist/create-bundler.d.cts",
                key: "exports",
                subKey: "types",
                type: "cjs",
            },
            {
                file: "./dist/create-bundler.cjs",
                key: "exports",
                subKey: "default",
                type: "cjs",
            },
        ]);
    });
});
