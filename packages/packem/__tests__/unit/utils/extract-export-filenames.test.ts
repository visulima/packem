import type { PackageJson } from "@visulima/package";
import { describe, expect, it } from "vitest";

import type { OutputDescriptor } from "../../../src/utils/extract-export-filenames";
import { extractExportFilenames } from "../../../src/utils/extract-export-filenames";

describe(extractExportFilenames, () => {
    it("should return an empty array when packageExports is falsy", () => {
        expect.assertions(1);

        const packageExports = undefined;
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
            {
                exportKey: "lib",
                file: "./lib/index.js",
                key: "exports",
                type: "esm",
            },
            {
                exportKey: "src",
                file: "./src/index.js",
                key: "exports",
                type: "esm",
            },
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
            {
                exportKey: "lib",
                file: "./lib/index.js",
                key: "exports",
                type: "cjs",
            },
            {
                exportKey: "src",
                file: "./src/index.mjs",
                key: "exports",
                type: "esm",
            },
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
            {
                exportKey: "lib",
                file: "./lib/index.js",
                key: "exports",
                subKey: "import",
                type: "esm",
            },
            {
                exportKey: "src",
                file: "./src/index.js",
                key: "exports",
                subKey: "import",
                type: "esm",
            },
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
                exportKey: "lib",
                file: "./lib/index.mjs",
                key: "exports",
                subKey: "import",
                type: "esm",
            },
            {
                exportKey: "lib",
                file: "./src/index.cjs",
                key: "exports",
                subKey: "require",
                type: "cjs",
            },
            {
                exportKey: "src",
                file: "./src/index.mjs",
                key: "exports",
                subKey: "import",
                type: "esm",
            },
            {
                exportKey: "src",
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
        }).toThrowError('Exported file "./src/index.cjs" has an extension that does not match the package.json type "module".');
    });

    it.each([
        [
            "cjs",
            {
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
            },
            [
                {
                    exportKey: ".",
                    file: "./dist/create-bundler.d.ts",
                    key: "exports",
                    subKey: "types",
                    type: "cjs",
                },
                {
                    exportKey: ".",
                    file: "./dist/create-bundler.js",
                    key: "exports",
                    subKey: "default",
                    type: "cjs",
                },
                {
                    exportKey: ".",
                    file: "./dist/create-bundler.d.mts",
                    key: "exports",
                    subKey: "types",
                    type: "esm",
                },
                {
                    exportKey: ".",
                    file: "./dist/create-bundler.mjs",
                    key: "exports",
                    subKey: "default",
                    type: "esm",
                },
                {
                    exportKey: ".",
                    file: "./dist/create-bundler.js",
                    key: "exports",
                    type: "esm",
                },
                {
                    exportKey: ".",
                    file: "./dist/create-bundler.cjs",
                    key: "exports",
                    subKey: "require",
                    type: "cjs",
                },
                {
                    exportKey: ".",
                    file: "./dist/create-bundler.d.cts",
                    key: "exports",
                    subKey: "types",
                    type: "cjs",
                },
                {
                    exportKey: ".",
                    file: "./dist/create-bundler.cjs",
                    key: "exports",
                    subKey: "default",
                    type: "cjs",
                },
            ],
        ],
        [
            "cjs",
            [
                "./src/index.cjs",
                {
                    "./lib": {
                        import: "./lib/index.mjs",
                        require: "./src/index.cjs",
                    },
                    "./src": {
                        import: "./src/index.mjs",
                        require: "./src/index.cjs",
                    },
                },
            ],
            [
                {
                    exportKey: "*",
                    file: "./src/index.cjs",
                    key: "exports",
                    type: "cjs",
                },
                {
                    exportKey: "lib",
                    file: "./lib/index.mjs",
                    key: "exports",
                    subKey: "import",
                    type: "esm",
                },
                {
                    exportKey: "lib",
                    file: "./src/index.cjs",
                    key: "exports",
                    subKey: "require",
                    type: "cjs",
                },
                {
                    exportKey: "src",
                    file: "./src/index.mjs",
                    key: "exports",
                    subKey: "import",
                    type: "esm",
                },
                {
                    exportKey: "src",
                    file: "./src/index.cjs",
                    key: "exports",
                    subKey: "require",
                    type: "cjs",
                },
            ],
        ],
        [
            "esm",
            {
                "edge-light": "./dist/index.edge.mjs",
                import: "./dist/index.mjs",
            },
            [
                {
                    exportKey: "*",
                    file: "./dist/index.edge.mjs",
                    key: "exports",
                    subKey: "edge-light",
                    type: "esm",
                },
                {
                    exportKey: "*",
                    file: "./dist/index.mjs",
                    key: "exports",
                    subKey: "import",
                    type: "esm",
                },
            ],
        ],
        [
            "cjs",
            ["./dist/index.mjs", "./dist/index.cjs", "./dist/deep/index.cjs", "./dist/deep/index.mjs"],
            [
                {
                    exportKey: "*",
                    file: "./dist/index.mjs",
                    key: "exports",
                    type: "esm",
                },
                {
                    exportKey: "*",
                    file: "./dist/index.cjs",
                    key: "exports",
                    type: "cjs",
                },
                {
                    exportKey: "*",
                    file: "./dist/deep/index.cjs",
                    key: "exports",
                    type: "cjs",
                },
                {
                    exportKey: "*",
                    file: "./dist/deep/index.mjs",
                    key: "exports",
                    type: "esm",
                },
            ],
        ],
        [
            "cjs",
            {
                ".": {
                    browser: "./dist/index.browser.mjs",
                    import: {
                        default: "./dist/index.server.mjs",
                        types: "./dist/index.server.d.mts",
                    },
                    require: {
                        default: "./dist/index.server.cjs",
                        types: "./dist/index.server.d.cts",
                    },
                },
                "./browser": {
                    import: {
                        default: "./dist/index.browser.mjs",
                        types: "./dist/index.browser.d.mts",
                    },
                    require: {
                        default: "./dist/index.browser.cjs",
                        types: "./dist/index.browser.d.cts",
                    },
                },
                "./browser/processor": {
                    browser: "./dist/processor.browser.mjs",
                    import: {
                        default: "./dist/processor.browser.mjs",
                        types: "./dist/processor.browser.d.mts",
                    },
                    require: {
                        default: "./dist/processor.browser.cjs",
                        types: "./dist/processor.browser.d.cts",
                    },
                },
                "./browser/reporter": {
                    browser: "./dist/reporter.browser.mjs",
                    import: {
                        default: "./dist/reporter.browser.mjs",
                        types: "./dist/reporter.browser.d.mts",
                    },
                    require: {
                        default: "./dist/reporter.browser.cjs",
                        types: "./dist/reporter.browser.d.cts",
                    },
                },
                "./package.json": "./package.json",
                "./processor": {
                    browser: "./dist/processor.browser.mjs",
                    import: {
                        default: "./dist/processor.server.mjs",
                        types: "./dist/processor.server.d.mts",
                    },
                    require: {
                        default: "./dist/processor.server.cjs",
                        types: "./dist/processor.server.d.cts",
                    },
                },
                "./reporter": {
                    browser: "./dist/reporter.browser.mjs",
                    import: {
                        default: "./dist/reporter.server.mjs",
                        types: "./dist/reporter.server.d.mts",
                    },
                    require: {
                        default: "./dist/reporter.server.cjs",
                        types: "./dist/reporter.server.d.cts",
                    },
                },
                "./server": {
                    import: {
                        default: "./dist/index.server.mjs",
                        types: "./dist/index.server.d.mts",
                    },
                    require: {
                        default: "./dist/index.server.cjs",
                        types: "./dist/index.server.d.cts",
                    },
                },
                "./server/processor": {
                    import: {
                        default: "./dist/processor.server.mjs",
                        types: "./dist/processor.server.d.mts",
                    },
                    require: {
                        default: "./dist/processor.server.cjs",
                        types: "./dist/processor.server.d.cts",
                    },
                },
                "./server/reporter": {
                    import: {
                        default: "./dist/reporter.server.mjs",
                        types: "./dist/reporter.server.d.mts",
                    },
                    require: {
                        default: "./dist/reporter.server.cjs",
                        types: "./dist/reporter.server.d.cts",
                    },
                },
            },
            [
                {
                    exportKey: ".",
                    file: "./dist/index.browser.mjs",
                    key: "exports",
                    subKey: "browser",
                    type: "esm",
                },
                {
                    exportKey: ".",
                    file: "./dist/index.server.mjs",
                    key: "exports",
                    subKey: "default",
                    type: "esm",
                },
                {
                    exportKey: ".",
                    file: "./dist/index.server.d.mts",
                    key: "exports",
                    subKey: "types",
                    type: "esm",
                },
                {
                    exportKey: ".",
                    file: "./dist/index.server.cjs",
                    key: "exports",
                    subKey: "default",
                    type: "cjs",
                },
                {
                    exportKey: ".",
                    file: "./dist/index.server.d.cts",
                    key: "exports",
                    subKey: "types",
                    type: "cjs",
                },
                {
                    exportKey: "browser",
                    file: "./dist/index.browser.mjs",
                    key: "exports",
                    subKey: "default",
                    type: "esm",
                },
                {
                    exportKey: "browser",
                    file: "./dist/index.browser.d.mts",
                    key: "exports",
                    subKey: "types",
                    type: "esm",
                },
                {
                    exportKey: "browser",
                    file: "./dist/index.browser.cjs",
                    key: "exports",
                    subKey: "default",
                    type: "cjs",
                },
                {
                    exportKey: "browser",
                    file: "./dist/index.browser.d.cts",
                    key: "exports",
                    subKey: "types",
                    type: "cjs",
                },
                {
                    exportKey: "browser/processor",
                    file: "./dist/processor.browser.mjs",
                    key: "exports",
                    subKey: "browser",
                    type: "esm",
                },
                {
                    exportKey: "browser/processor",
                    file: "./dist/processor.browser.mjs",
                    key: "exports",
                    subKey: "default",
                    type: "esm",
                },
                {
                    exportKey: "browser/processor",
                    file: "./dist/processor.browser.d.mts",
                    key: "exports",
                    subKey: "types",
                    type: "esm",
                },
                {
                    exportKey: "browser/processor",
                    file: "./dist/processor.browser.cjs",
                    key: "exports",
                    subKey: "default",
                    type: "cjs",
                },
                {
                    exportKey: "browser/processor",
                    file: "./dist/processor.browser.d.cts",
                    key: "exports",
                    subKey: "types",
                    type: "cjs",
                },
                {
                    exportKey: "browser/reporter",
                    file: "./dist/reporter.browser.mjs",
                    key: "exports",
                    subKey: "browser",
                    type: "esm",
                },
                {
                    exportKey: "browser/reporter",
                    file: "./dist/reporter.browser.mjs",
                    key: "exports",
                    subKey: "default",
                    type: "esm",
                },
                {
                    exportKey: "browser/reporter",
                    file: "./dist/reporter.browser.d.mts",
                    key: "exports",
                    subKey: "types",
                    type: "esm",
                },
                {
                    exportKey: "browser/reporter",
                    file: "./dist/reporter.browser.cjs",
                    key: "exports",
                    subKey: "default",
                    type: "cjs",
                },
                {
                    exportKey: "browser/reporter",
                    file: "./dist/reporter.browser.d.cts",
                    key: "exports",
                    subKey: "types",
                    type: "cjs",
                },
                {
                    exportKey: "processor",
                    file: "./dist/processor.browser.mjs",
                    key: "exports",
                    subKey: "browser",
                    type: "esm",
                },
                {
                    exportKey: "processor",
                    file: "./dist/processor.server.mjs",
                    key: "exports",
                    subKey: "default",
                    type: "esm",
                },
                {
                    exportKey: "processor",
                    file: "./dist/processor.server.d.mts",
                    key: "exports",
                    subKey: "types",
                    type: "esm",
                },
                {
                    exportKey: "processor",
                    file: "./dist/processor.server.cjs",
                    key: "exports",
                    subKey: "default",
                    type: "cjs",
                },
                {
                    exportKey: "processor",
                    file: "./dist/processor.server.d.cts",
                    key: "exports",
                    subKey: "types",
                    type: "cjs",
                },
                {
                    exportKey: "reporter",
                    file: "./dist/reporter.browser.mjs",
                    key: "exports",
                    subKey: "browser",
                    type: "esm",
                },
                {
                    exportKey: "reporter",
                    file: "./dist/reporter.server.mjs",
                    key: "exports",
                    subKey: "default",
                    type: "esm",
                },
                {
                    exportKey: "reporter",
                    file: "./dist/reporter.server.d.mts",
                    key: "exports",
                    subKey: "types",
                    type: "esm",
                },
                {
                    exportKey: "reporter",
                    file: "./dist/reporter.server.cjs",
                    key: "exports",
                    subKey: "default",
                    type: "cjs",
                },
                {
                    exportKey: "reporter",
                    file: "./dist/reporter.server.d.cts",
                    key: "exports",
                    subKey: "types",
                    type: "cjs",
                },
                {
                    exportKey: "server",
                    file: "./dist/index.server.mjs",
                    key: "exports",
                    subKey: "default",
                    type: "esm",
                },
                {
                    exportKey: "server",
                    file: "./dist/index.server.d.mts",
                    key: "exports",
                    subKey: "types",
                    type: "esm",
                },
                {
                    exportKey: "server",
                    file: "./dist/index.server.cjs",
                    key: "exports",
                    subKey: "default",
                    type: "cjs",
                },
                {
                    exportKey: "server",
                    file: "./dist/index.server.d.cts",
                    key: "exports",
                    subKey: "types",
                    type: "cjs",
                },
                {
                    exportKey: "server/processor",
                    file: "./dist/processor.server.mjs",
                    key: "exports",
                    subKey: "default",
                    type: "esm",
                },
                {
                    exportKey: "server/processor",
                    file: "./dist/processor.server.d.mts",
                    key: "exports",
                    subKey: "types",
                    type: "esm",
                },
                {
                    exportKey: "server/processor",
                    file: "./dist/processor.server.cjs",
                    key: "exports",
                    subKey: "default",
                    type: "cjs",
                },
                {
                    exportKey: "server/processor",
                    file: "./dist/processor.server.d.cts",
                    key: "exports",
                    subKey: "types",
                    type: "cjs",
                },
                {
                    exportKey: "server/reporter",
                    file: "./dist/reporter.server.mjs",
                    key: "exports",
                    subKey: "default",
                    type: "esm",
                },
                {
                    exportKey: "server/reporter",
                    file: "./dist/reporter.server.d.mts",
                    key: "exports",
                    subKey: "types",
                    type: "esm",
                },
                {
                    exportKey: "server/reporter",
                    file: "./dist/reporter.server.cjs",
                    key: "exports",
                    subKey: "default",
                    type: "cjs",
                },
                {
                    exportKey: "server/reporter",
                    file: "./dist/reporter.server.d.cts",
                    key: "exports",
                    subKey: "types",
                    type: "cjs",
                },
            ],
        ],
    ] as ["cjs" | "esm", PackageJson["exports"], OutputDescriptor[]][])(
        "should infer the correct export type",
        (type: "cjs" | "esm", packageExports: PackageJson["exports"], expectedResult: OutputDescriptor[]) => {
            expect.assertions(1);

            const result = extractExportFilenames(packageExports, type, true);

            expect(result).toStrictEqual(expectedResult);
        },
    );
});
