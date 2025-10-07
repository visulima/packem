import { existsSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { readFileSync, writeFile } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackem } from "../helpers";

describe("native modules", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("esm: copies .node files to natives directory", async () => {
        expect.assertions(6);

        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": "./dist/index.js",
            },
            type: "module",
        });

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                cjsInterop: true,
            },
        });

        // Create source files
        await writeFile(
            join(temporaryDirectoryPath, "src", "index.js"),
            `
					import native from './native.node';
					console.log(native);
				`,
        );

        // Create dummy .node file
        await writeFile(join(temporaryDirectoryPath, "src", "native.node"), Buffer.from("dummy native module"));

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Check that natives directory was created
        expect(existsSync(join(temporaryDirectoryPath, "dist", "natives"))).toBe(true);

        // Check that .node file was copied
        const files = readdirSync(join(temporaryDirectoryPath, "dist", "natives"));

        expect(files.some((file) => file.endsWith(".node"))).toBe(true);

        // Check that import was rewritten and uses createRequire for ESM
        const content = readFileSync(join(temporaryDirectoryPath, "dist", "index.js"), "utf8");

        console.log(content);

        expect(content).toMatch("./natives");
        expect(content).toMatch("createRequire");
    });

    it("cJS: copies .node files to natives directory", async () => {
        expect.assertions(7);

        await createPackageJson(temporaryDirectoryPath, {
            main: "./dist/index.js",
            type: "commonjs",
        });

        await createPackemConfig(temporaryDirectoryPath);

        // Create source files
        await writeFile(
            join(temporaryDirectoryPath, "src", "index.js"),
            `
					import native from './native.node';
					console.log(native);
				`,
        );

        // Create dummy .node file
        await writeFile(join(temporaryDirectoryPath, "src", "native.node"), Buffer.from("dummy native module"));

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Check that natives directory was created
        expect(existsSync(join(temporaryDirectoryPath, "dist", "natives"))).toBe(true);

        // Check that .node file was copied
        const files = readdirSync(join(temporaryDirectoryPath, "dist", "natives"));

        expect(files.some((file) => file.endsWith(".node"))).toBe(true);

        // Check that import was transformed to require for CJS
        const content = readFileSync(join(temporaryDirectoryPath, "dist", "index.js"), "utf8");

        expect(content).toMatch("./natives");
        expect(content).toMatch("require");
        // Should NOT have createRequire in CJS output
        expect(content).not.toMatch("createRequire");
    });

    it("custom nativesDirectory option", async () => {
        expect.assertions(5);

        await createPackageJson(temporaryDirectoryPath, {
            main: "./dist/index.js",
            type: "module",
        });

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    nativeModules: {
                        nativesDirectory: "custom-natives",
                    },
                },
            },
        });

        // Create source files
        await writeFile(
            join(temporaryDirectoryPath, "src", "index.js"),
            `
					import native from './native.node';
					console.log(native);
				`,
        );

        // Create dummy .node file
        await writeFile(join(temporaryDirectoryPath, "src", "native.node"), Buffer.from("dummy native module"));

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Check that custom directory was created
        expect(existsSync(join(temporaryDirectoryPath, "dist", "custom-natives"))).toBe(true);

        // Check that .node file was copied to custom directory
        const files = readdirSync(join(temporaryDirectoryPath, "dist", "custom-natives"));

        expect(files.some((file) => file.endsWith(".node"))).toBe(true);

        // Check that import was rewritten with custom directory
        const content = readFileSync(join(temporaryDirectoryPath, "dist", "index.js"), "utf8");

        expect(content).toMatch("./custom-natives");
    });

    it("handles name collisions by adding suffixes", async () => {
        expect.assertions(8);

        await createPackageJson(temporaryDirectoryPath, {
            main: "./dist/index.js",
            type: "module",
        });

        await createPackemConfig(temporaryDirectoryPath);

        // Create source files with same base name
        await writeFile(
            join(temporaryDirectoryPath, "src", "index.js"),
            `
					import native1 from './addon.node';
					import native2 from './lib/addon.node';
					console.log(native1, native2);
				`,
        );

        // Create dummy .node files with same name
        await writeFile(join(temporaryDirectoryPath, "src", "addon.node"), Buffer.from("native module 1"));
        await writeFile(join(temporaryDirectoryPath, "src", "lib", "addon.node"), Buffer.from("native module 2"));

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Check that natives directory was created
        expect(existsSync(join(temporaryDirectoryPath, "dist", "natives"))).toBe(true);

        // Check that both .node files were copied with different names
        const files = readdirSync(join(temporaryDirectoryPath, "dist", "natives"));
        const nodeFiles = files.filter((file) => file.endsWith(".node"));

        expect(nodeFiles).toHaveLength(2);

        // Should have original name and suffixed name
        expect(nodeFiles).toContain("addon.node");
        expect(nodeFiles.some((file) => file.startsWith("addon_") && file.endsWith(".node"))).toBe(true);

        // Check that imports were rewritten correctly
        const content = readFileSync(join(temporaryDirectoryPath, "dist", "index.js"), "utf8");

        expect(content).toMatch("./natives/addon.node");
        expect(content).toMatch("./natives/addon_");
    });
});
