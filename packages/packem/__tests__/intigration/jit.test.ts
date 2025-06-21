import { execSync } from "node:child_process";
import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { join, relative } from "@visulima/path";
import { resolvePath } from "mlly";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

describe("packem build --jit", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should build a package with jit", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: {
                        default: "./dist/index.mjs",
                        types: "./dist/index.d.mts",
                    },
                    require: {
                        default: "./dist/index.cjs",
                        types: "./dist/index.d.cts",
                    },
                },
            },
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", ["--jit"], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);
        const jitiCJSPath = relative(
            join(temporaryDirectoryPath, "dist"),

            await resolvePath("jiti", {
                conditions: ["node", "require"],
                url: import.meta.url,
            }),
        );

        expect(cjsContent).toBe(`const { createJiti } = require("${jitiCJSPath}");

const jiti = createJiti(__filename, {
  "alias": {},
  "interopDefault": true,
  "transformOptions": {
    "babel": {
      "plugins": []
    }
  }
});

/** @type {import("${temporaryDirectoryPath}/src/index.d.cts")} */
module.exports = jiti("${temporaryDirectoryPath}/src/index.ts")`);

        const cDtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(cDtsContent).toBe(`export * from "${temporaryDirectoryPath}/src/index.d.cts";
export { default } from "${temporaryDirectoryPath}/src/index.d.cts";`);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);
        const jitiESMPath = relative(
            join(temporaryDirectoryPath, "dist"),

            await resolvePath("jiti", {
                conditions: ["node", "import"],
                url: import.meta.url,
            }),
        );

        expect(mjsContent).toBe(`import { createJiti } from "${jitiESMPath}";

const jiti = createJiti(import.meta.url, {
  "alias": {},
  "interopDefault": true,
  "transformOptions": {
    "babel": {
      "plugins": []
    }
  }
});

/** @type {import("${temporaryDirectoryPath}/src/index.d.mts")} */
const _module = await jiti.import("${temporaryDirectoryPath}/src/index.ts");
export default _module?.default ?? _module;`);

        const mDtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(mDtsContent).toBe(`export * from "${temporaryDirectoryPath}/src/index.d.mts";
export { default } from "${temporaryDirectoryPath}/src/index.d.mts";`);
    });

    it("should build a package with jit and arbitrary module namespace identifier names", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `const foo = {};\n\nexport { foo as 'module.exports' };`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: {
                        default: "./dist/index.mjs",
                        types: "./dist/index.d.mts",
                    },
                    require: {
                        default: "./dist/index.cjs",
                        types: "./dist/index.d.cts",
                    },
                },
            },
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", ["--jit"], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);
        const jitiCJSPath = relative(
            join(temporaryDirectoryPath, "dist"),

            await resolvePath("jiti", {
                conditions: ["node", "require"],
                url: import.meta.url,
            }),
        );

        expect(cjsContent).toBe(`const { createJiti } = require("${jitiCJSPath}");

const jiti = createJiti(__filename, {
  "alias": {},
  "interopDefault": true,
  "transformOptions": {
    "babel": {
      "plugins": []
    }
  }
});

/** @type {import("${temporaryDirectoryPath}/src/index.d.cts")} */
module.exports = jiti("${temporaryDirectoryPath}/src/index.ts")`);

        const cDtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(cDtsContent).toBe(`export * from "${temporaryDirectoryPath}/src/index.d.cts";
`);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);
        const jitiESMPath = relative(
            join(temporaryDirectoryPath, "dist"),

            await resolvePath("jiti", {
                conditions: ["node", "import"],
                url: import.meta.url,
            }),
        );

        expect(mjsContent).toBe(`import { createJiti } from "${jitiESMPath}";

const jiti = createJiti(import.meta.url, {
  "alias": {},
  "interopDefault": true,
  "transformOptions": {
    "babel": {
      "plugins": []
    }
  }
});

/** @type {import("${temporaryDirectoryPath}/src/index.d.mts")} */
const _module = await jiti.import("${temporaryDirectoryPath}/src/index.ts");
const __packem_export_0 = _module['module.exports'];
export { __packem_export_0 as "'module.exports'" };`);

        const mDtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(mDtsContent).toBe(`export * from "${temporaryDirectoryPath}/src/index.d.mts";
`);
    });

    it("should work at runtime with arbitrary module namespace identifier names", async () => {
        expect.assertions(4);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `const foo = { test: 'value' };\n\nexport { foo as 'module.exports' };`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: {
                        default: "./dist/index.mjs",
                        types: "./dist/index.d.mts",
                    },
                    require: {
                        default: "./dist/index.cjs",
                        types: "./dist/index.d.cts",
                    },
                },
            },
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", ["--jit"], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Test CommonJS require
        const cjsTestCode = `
            const result = require("./dist/index.cjs");
            console.log(JSON.stringify(result));
        `;

        writeFileSync(`${temporaryDirectoryPath}/test-cjs.js`, cjsTestCode);

        try {
            const cjsOutput = execSync(`node test-cjs.js`, {
                cwd: temporaryDirectoryPath,
                encoding: "utf8",
            });
            const cjsResult = JSON.parse(cjsOutput.trim()) as Record<string, unknown>;

            expect(cjsResult["module.exports"]).toStrictEqual({ test: "value" });
        } catch (error) {
            throw new Error(`CJS test failed: ${error}`);
        }

        // Test ESM import (import the named export, not default)
        const mjsTestCode = `
            import { "'module.exports'" as moduleExports } from "./dist/index.mjs";
            console.log(JSON.stringify({ 'module.exports': moduleExports }));
        `;

        writeFileSync(`${temporaryDirectoryPath}/test-esm.mjs`, mjsTestCode);

        try {
            const mjsOutput = execSync(`node test-esm.mjs`, {
                cwd: temporaryDirectoryPath,
                encoding: "utf8",
            });
            const mjsResult = JSON.parse(mjsOutput.trim()) as Record<string, unknown>;

            expect(mjsResult["module.exports"]).toStrictEqual({ test: "value" });
        } catch (error) {
            throw new Error(`ESM test failed: ${error}`);
        }
    });
});
