import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { satisfies } from "semver";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackem } from "../helpers";

describe("packem validate engines", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = mkdtempSync(join(tmpdir(), "packem-validate-engines-"));

        // Create a basic src/index.js file for the build to work
        mkdirSync(join(temporaryDirectoryPath, "src"), { recursive: true });
        writeFileSync(join(temporaryDirectoryPath, "src", "index.js"), "export const foo = \"bar\";");
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should warn when engines.node is missing", async () => {
        expect.assertions(4);

        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            name: "test-package",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackem("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stdout).toContain("The 'engines.node' field is missing in your package.json");
        expect(binProcess.stdout).toContain("Consider adding");
        expect(binProcess.stdout).toContain(">=18.0.0");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should pass when current Node.js version satisfies engines.node requirement", async () => {
        expect.assertions(2);

        await createPackageJson(temporaryDirectoryPath, {
            engines: {
                node: ">=16.0.0", // This should satisfy current Node.js version (18.x+)
            },
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            name: "test-package",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackem("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stdout).toContain("Build succeeded");
    });

    it.runIf(satisfies(process.version, "<20.0.0"))("should fail when current Node.js version does not satisfy engines.node requirement", async () => {
        expect.assertions(4);

        await createPackageJson(temporaryDirectoryPath, {
            engines: {
                node: ">=20.0.0", // This should not satisfy Node.js 18.x
            },
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            name: "test-package",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackem("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain("Node.js version mismatch");
        expect(binProcess.stderr).toContain("does not satisfy the required range");
        expect(binProcess.stderr).toContain(">=20.0.0");
        expect(binProcess.exitCode).toBe(1);
    });

    it.runIf(satisfies(process.version, ">=20.0.0"))("should fail when current Node.js version does not satisfy engines.node requirement (Node 20+)", async () => {
        expect.assertions(4);

        await createPackageJson(temporaryDirectoryPath, {
            engines: {
                node: ">=25.0.0", // This should not satisfy Node.js 20.x-24.x
            },
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            name: "test-package",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackem("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain("Node.js version mismatch");
        expect(binProcess.stderr).toContain("does not satisfy the required range");
        expect(binProcess.stderr).toContain(">=25.0.0");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should warn when engines.node has invalid semver range", async () => {
        expect.assertions(2);

        await createPackageJson(temporaryDirectoryPath, {
            engines: {
                node: "invalid-version-range",
            },
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            name: "test-package",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackem("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        // The error occurs before validation warnings, so it appears in stderr
        expect(binProcess.stderr).toContain("Invalid comparator: invalid-version-range");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should skip validation when engines validation is disabled", async () => {
        expect.assertions(2);

        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            name: "test-package",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                validation: {
                    packageJson: {
                        engines: false,
                    },
                },
            },
        });

        const binProcess = await execPackem("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stdout).not.toContain("engines.node");
    });

    it("should work with complex semver ranges", async () => {
        expect.assertions(2);

        await createPackageJson(temporaryDirectoryPath, {
            engines: {
                node: "^18.0.0 || ^20.0.0 || ^22.0.0 || ^24.0.0", // This should satisfy Node.js 18.x+
            },
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            name: "test-package",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackem("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stdout).toContain("Build succeeded");
    });
});
