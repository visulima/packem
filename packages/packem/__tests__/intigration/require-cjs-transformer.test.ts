import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { readdirSync } from "node:fs";
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
        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const test = "hello";`);

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

        // Check that the build succeeded and generated files
        expect(readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toContain("hello");
        expect(readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toContain("hello");
    });

    it("should transform ESM imports of CJS modules to require calls", async () => {
        expect.assertions(7);

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
                node: ">=18.0.0",
                outDir: "dist",
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

        // Check that Node.js built-in modules are transformed with runtime helpers
        expect(mjsContent).toMatchSnapshot("mjs");

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
        expect.assertions(10);

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
                node: ">=18.0.0",
                outDir: "dist",
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

        // Check that Node.js built-in modules are transformed with runtime helpers
        expect(mjsContent).toContain("const __cjs_getBuiltinModule = (module) => {");
        expect(mjsContent).toContain("__cjs_getBuiltinModule(\"fs\")");
        expect(mjsContent).toContain("__cjs_getBuiltinModule(\"path\")");

        // Check that the output contains the expected export
        expect(mjsContent).toContain("export { test };");

        // Check that the original import statements are not present (they should be transformed)
        expect(mjsContent).not.toContain("import 'fs'");
        expect(mjsContent).not.toContain("import fs, { writeFileSync, readFileSync } from 'fs'");
        expect(mjsContent).not.toContain("import * as path from 'path'");
        expect(mjsContent).not.toContain("import { join } from 'path'");
    });

    it("should handle multiple entry points with shared chunks correctly", async () => {
        expect.assertions(6);

        // Create utility file 1 - fs utilities
        writeFileSync(
            `${temporaryDirectoryPath}/src/fs-utils.ts`,
            `import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const readFile = (path: string) => readFileSync(path, 'utf8');
export const writeFile = (path: string, content: string) => writeFileSync(path, content);`,
        );

        // Create utility file 2 - path utilities
        writeFileSync(
            `${temporaryDirectoryPath}/src/path-utils.ts`,
            `import { join, resolve } from 'node:path';

export const joinPaths = (...args: string[]) => join(...args);
export const resolvePath = (p: string) => resolve(p);`,
        );

        writeFileSync(
            `${temporaryDirectoryPath}/src/external-packem-build-lib.ts`,
            `import { createRequire as __cjs_createRequire } from "node:module";

          const __cjs_require = __cjs_createRequire(import.meta.url);

          const __cjs_getProcess = typeof globalThis !== "undefined" && typeof globalThis.process !== "undefined" ? globalThis.process : process;

          const __cjs_getBuiltinModule = (module) => {
              // Check if we're in Node.js and version supports getBuiltinModule
              if (typeof __cjs_getProcess !== "undefined" && __cjs_getProcess.versions && __cjs_getProcess.versions.node) {
                  const [major, minor] = __cjs_getProcess.versions.node.split(".").map(Number);
                  // Node.js 20.16.0+ and 22.3.0+
                  if (major > 22 || (major === 22 && minor >= 3) || (major === 20 && minor >= 16)) {
                      return __cjs_getProcess.getBuiltinModule(module);
                  }
              }
              // Fallback to createRequire
              return __cjs_require(module);
          };

          export const {
            writeFileSync,
            readFileSync
          } = __cjs_getBuiltinModule("node:fs");
`,
        );

        // Create utility file 3 - process utilities (shared by both index and index2)
        writeFileSync(
            `${temporaryDirectoryPath}/src/process-utils.ts`,
            `import process from 'node:process';
import { writeFileSync, readFileSync } from './external-packem-build-lib';

console.log(writeFileSync, readFileSync);

export const getEnv = (key: string) => process.env[key];
export const getCwd = () => process.cwd();`,
        );

        // Create index.ts - uses fs-utils, path-utils, and process-utils
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import { readFile, writeFile } from './fs-utils';
import { joinPaths } from './path-utils';
import { getEnv, getCwd } from './process-utils';

export const mainIndex = () => ({
    readFile,
    writeFile,
    joinPaths,
    getEnv,
    getCwd,
});`,
        );

        // Create index2.ts - uses only process-utils and path-utils
        writeFileSync(
            `${temporaryDirectoryPath}/src/index2.ts`,
            `import { getEnv } from './process-utils';
import { resolvePath } from './path-utils';

export const mainIndex2 = () => ({
    getEnv,
    resolvePath,
});
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            type: "module",
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": "./dist/index.js",
                "./index2": "./dist/index2.js",
            },
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

        const indexMjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);
        const index2MjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index2.js`);

        // Check that helpers are properly injected in both entry points
        expect(indexMjsContent).toMatchInlineSnapshot(`
          "import { createRequire as __cjs_createRequire } from "node:module";

          const __cjs_require = __cjs_createRequire(import.meta.url);

          const __cjs_getProcess = typeof globalThis !== "undefined" && typeof globalThis.process !== "undefined" ? globalThis.process : process;

          const __cjs_getBuiltinModule = (module) => {
              // Check if we're in Node.js and version supports getBuiltinModule
              if (typeof __cjs_getProcess !== "undefined" && __cjs_getProcess.versions && __cjs_getProcess.versions.node) {
                  const [major, minor] = __cjs_getProcess.versions.node.split(".").map(Number);
                  // Node.js 20.16.0+ and 22.3.0+
                  if (major > 22 || (major === 22 && minor >= 3) || (major === 20 && minor >= 16)) {
                      return __cjs_getProcess.getBuiltinModule(module);
                  }
              }
              // Fallback to createRequire
              return __cjs_require(module);
          };

          const {
            writeFileSync,
            readFileSync
          } = __cjs_getBuiltinModule("node:fs");
          import { g as getCwd, a as getEnv, j as joinPaths } from './packem_shared/process-utils-D1raRETv.js';

          const readFile = (path) => readFileSync(path, "utf8");
          const writeFile = (path, content) => writeFileSync(path, content);

          const mainIndex = () => ({
            readFile,
            writeFile,
            joinPaths,
            getEnv,
            getCwd
          });

          export { mainIndex };
          "
        `);
        expect(index2MjsContent).toMatchInlineSnapshot(`
          "import { r as resolvePath, a as getEnv } from './packem_shared/process-utils-D1raRETv.js';

          const mainIndex2 = () => ({
            getEnv,
            resolvePath
          });

          export { mainIndex2 };
          "
        `);

        // Find the shared chunk file dynamically (filename contains hash)
        const sharedChunkDirectory = `${temporaryDirectoryPath}/dist/packem_shared`;
        const sharedChunkFiles = readdirSync(sharedChunkDirectory).filter((file) => file.startsWith("process-utils-"));
        
        expect(sharedChunkFiles.length).toBe(1);

        const sharedChunkFile = sharedChunkFiles[0];
        const sharedMjsContent = readFileSync(`${sharedChunkDirectory}/${sharedChunkFile}`);
        
        expect(sharedMjsContent).toMatchSnapshot("shared");
    });
});
