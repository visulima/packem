import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

describe("packem require-cjs-transformer", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should load and run the requireCJS plugin", async () => {
        expect.assertions(4);

        // Create a simple source file
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export const test = "hello";`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "module",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                module: "ESNext",
                moduleResolution: "bundler",
                rootDir: "./src",
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    requireCJS: {},
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Check that the build succeeded and generated files
        expect(readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toContain("hello");
        expect(readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toContain("hello");
    });

    it("should transform ESM imports of CJS modules to require calls", async () => {
        expect.assertions(9);

        // Create source files with ESM imports of CJS modules (Node.js built-ins)
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import fs from 'fs';
import path from 'path';
import { readFileSync } from 'fs';
import { join } from 'path';

export const readContent = (filePath: string) => {
    return readFileSync(path.join(process.cwd(), filePath), 'utf8');
};

export const testFs = () => {
    return fs.existsSync('.');
};

export const testPath = (p: string) => {
    return join(p, 'test');
};`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "module",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                module: "ESNext",
                moduleResolution: "bundler",
                rootDir: "./src",
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    requireCJS: {
                        builtinNodeModules: true,
                    },
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Check ESM output - should transform CJS imports to require calls
        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        // Check that Node.js built-in modules are transformed to use globalThis.process.getBuiltinModule
        expect(mjsContent).toContain("globalThis.process.getBuiltinModule(\"fs\")");
        expect(mjsContent).toContain("const fs = globalThis.process.getBuiltinModule(\"fs\");");

        // Check that the output contains the expected exports
        expect(mjsContent).toContain("export { readContent, testFs, testPath };");

        // Check that the original import statements are not present (they should be transformed)
        expect(mjsContent).not.toContain("import fs from 'fs'");
        expect(mjsContent).not.toContain("import { readFileSync } from 'fs'");
        expect(mjsContent).not.toContain("import path from 'path'");
        expect(mjsContent).not.toContain("import { join } from 'path'");
    });

    it("should not transform when requireCJS option is not set", async () => {
        expect.assertions(4);

        // Create the same source file
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import fs from 'fs';
import { readFileSync } from 'fs';

export const readContent = (filePath: string) => {
    return readFileSync(filePath, 'utf8');
};`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "module",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                module: "ESNext",
                moduleResolution: "bundler",
                rootDir: "./src",
            },
        });
        // No requireCJS option in config
        await createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Check ESM output - should NOT contain require calls
        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        // Should NOT contain require calls when option is not set
        expect(mjsContent).not.toContain("__cjs_require(");
        expect(mjsContent).not.toContain("createRequire");
    });

    it("should handle different import patterns correctly", async () => {
        expect.assertions(9);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `// Side-effect import
import 'fs';

// Default import
import fs from 'fs';

// Named imports
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Namespace import
import * as path from 'path';

export const test = () => {
    return {
        fs,
        readFileSync,
        writeFileSync,
        join,
        path,
    };
};`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "module",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                module: "ESNext",
                moduleResolution: "bundler",
                rootDir: "./src",
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    requireCJS: {
                        builtinNodeModules: true,
                    },
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        // Check that Node.js built-in modules are transformed to use globalThis.process.getBuiltinModule
        expect(mjsContent).toContain("globalThis.process.getBuiltinModule(\"fs\")");
        expect(mjsContent).toContain("globalThis.process.getBuiltinModule(\"path\")");

        // Check that the output contains the expected export
        expect(mjsContent).toContain("export { test };");

        // Check that the original import statements are not present (they should be transformed)
        expect(mjsContent).not.toContain("import 'fs'");
        expect(mjsContent).not.toContain("import fs, { writeFileSync, readFileSync } from 'fs'");
        expect(mjsContent).not.toContain("import * as path from 'path'");
        expect(mjsContent).not.toContain("import { join } from 'path'");
    });
});
