import { mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import loadPackageJson from "../../../src/config/utils/load-package-json";

describe(loadPackageJson, () => {
    let temporaryDirectoryPath: string;

    beforeEach(() => {
        temporaryDirectoryPath = mkdtempSync(join(tmpdir(), "load-package-json-test-"));
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should load and parse a basic package.json file", () => {
        expect.assertions(3);

        const packageJsonData = {
            main: "./src/index.js",
            name: "test-package",
            version: "1.0.0",
        };

        writeFileSync(join(temporaryDirectoryPath, "package.json"), JSON.stringify(packageJsonData, undefined, 2));

        const result = loadPackageJson(temporaryDirectoryPath);

        expect(result.packageJson.name).toBe("test-package");
        expect(result.packageJson.version).toBe("1.0.0");
        expect(result.packageJsonPath).toBe(join(temporaryDirectoryPath, "package.json"));
    });

    it("should merge publishConfig properties into the main package.json object", () => {
        expect.assertions(6);

        const packageJsonData = {
            main: "./src/index.js",
            module: "./src/index.mjs",
            name: "test-package",
            publishConfig: {
                exports: {
                    ".": {
                        import: "./dist/index.mjs",
                        require: "./dist/index.js",
                    },
                },
                main: "./dist/index.js",
                module: "./dist/index.mjs",
                type: "module",
            },
            type: "commonjs",
            version: "1.0.0",
        };

        writeFileSync(join(temporaryDirectoryPath, "package.json"), JSON.stringify(packageJsonData, undefined, 2));

        const result = loadPackageJson(temporaryDirectoryPath);

        // publishConfig properties should override original properties
        expect(result.packageJson.main).toBe("./dist/index.js");
        expect(result.packageJson.module).toBe("./dist/index.mjs");
        expect(result.packageJson.type).toBe("module");
        expect(result.packageJson.exports).toStrictEqual({
            ".": {
                import: "./dist/index.mjs",
                require: "./dist/index.js",
            },
        });

        // Original properties that weren't in publishConfig should remain
        expect(result.packageJson.name).toBe("test-package");
        expect(result.packageJson.version).toBe("1.0.0");
    });

    it("should handle package.json without publishConfig", () => {
        expect.assertions(4);

        const packageJsonData = {
            main: "./src/index.js",
            name: "test-package",
            type: "commonjs",
            version: "1.0.0",
        };

        writeFileSync(join(temporaryDirectoryPath, "package.json"), JSON.stringify(packageJsonData, undefined, 2));

        const result = loadPackageJson(temporaryDirectoryPath);

        expect(result.packageJson.name).toBe("test-package");
        expect(result.packageJson.version).toBe("1.0.0");
        expect(result.packageJson.main).toBe("./src/index.js");
        expect(result.packageJson.type).toBe("commonjs");
    });

    it("should handle empty publishConfig object", () => {
        expect.assertions(4);

        const packageJsonData = {
            main: "./src/index.js",
            name: "test-package",
            publishConfig: {},
            version: "1.0.0",
        };

        writeFileSync(join(temporaryDirectoryPath, "package.json"), JSON.stringify(packageJsonData, undefined, 2));

        const result = loadPackageJson(temporaryDirectoryPath);

        expect(result.packageJson.name).toBe("test-package");
        expect(result.packageJson.version).toBe("1.0.0");
        expect(result.packageJson.main).toBe("./src/index.js");
        expect(result.packageJson.publishConfig).toStrictEqual({});
    });

    it("should handle publishConfig with partial properties", () => {
        expect.assertions(5);

        const packageJsonData = {
            main: "./src/index.js",
            module: "./src/index.mjs",
            name: "test-package",
            publishConfig: {
                main: "./dist/index.js",
                // module and type are not overridden
            },
            type: "commonjs",
            version: "1.0.0",
        };

        writeFileSync(join(temporaryDirectoryPath, "package.json"), JSON.stringify(packageJsonData, undefined, 2));

        const result = loadPackageJson(temporaryDirectoryPath);

        expect(result.packageJson.name).toBe("test-package");
        expect(result.packageJson.main).toBe("./dist/index.js"); // overridden
        expect(result.packageJson.module).toBe("./src/index.mjs"); // not overridden
        expect(result.packageJson.type).toBe("commonjs"); // not overridden
        expect(result.packageJson.version).toBe("1.0.0");
    });

    it("should handle complex publishConfig with nested objects", () => {
        expect.assertions(4);

        const packageJsonData = {
            bin: {
                "test-cli": "./src/cli.js",
            },
            exports: {
                ".": "./src/index.js",
            },
            name: "test-package",
            publishConfig: {
                bin: {
                    "test-bin": "./dist/bin.js",
                    "test-cli": "./dist/cli.js",
                },
                exports: {
                    ".": {
                        import: "./dist/index.mjs",
                        require: "./dist/index.js",
                    },
                    "./cli": "./dist/cli.js",
                },
            },
            version: "1.0.0",
        };

        writeFileSync(join(temporaryDirectoryPath, "package.json"), JSON.stringify(packageJsonData, undefined, 2));

        const result = loadPackageJson(temporaryDirectoryPath);

        expect(result.packageJson.name).toBe("test-package");
        expect(result.packageJson.exports).toStrictEqual({
            ".": {
                import: "./dist/index.mjs",
                require: "./dist/index.js",
            },
            "./cli": "./dist/cli.js",
        });
        expect(result.packageJson.bin).toStrictEqual({
            "test-bin": "./dist/bin.js",
            "test-cli": "./dist/cli.js",
        });
        expect(result.packageJson.version).toBe("1.0.0");
    });

    it("should throw an error when package.json does not exist", () => {
        expect.assertions(1);

        expect(() => {
            loadPackageJson(temporaryDirectoryPath);
        }).toThrow(`package.json not found at ${join(temporaryDirectoryPath, "package.json")}`);
    });

    it("should throw an error when directory does not exist", () => {
        expect.assertions(1);

        const nonExistentPath = join(temporaryDirectoryPath, "non-existent");

        expect(() => {
            loadPackageJson(nonExistentPath);
        }).toThrow(`package.json not found at ${join(nonExistentPath, "package.json")}`);
    });

    it("should return correct packageJsonPath", () => {
        expect.assertions(1);

        const packageJsonData = {
            name: "test-package",
            version: "1.0.0",
        };

        writeFileSync(join(temporaryDirectoryPath, "package.json"), JSON.stringify(packageJsonData, undefined, 2));

        const result = loadPackageJson(temporaryDirectoryPath);

        expect(result.packageJsonPath).toBe(join(temporaryDirectoryPath, "package.json"));
    });
});
