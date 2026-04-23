import { rm } from "node:fs/promises";

import { writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

describe("packem validation", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    describe("bundle size", () => {
        it("should throw a error if the size of the file extends the file limit", async () => {
            expect.assertions(2);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `console.log("test");`);

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath, {
                config: {
                    validation: {
                        bundleLimit: {
                            limits: {
                                "index.mjs": 1,
                            },
                        },
                    },
                },
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.exitCode).toBe(1);
            expect(binProcess.stdout).toContain("File size exceeds the limit: dist/index.mjs (21 Bytes / 1.00 Bytes)");
        });

        it("should throw a warning if the size of the file extends the file limit and allowFail is enabled", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `console.log("test");`);

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
                types: "./dist/index.d.ts",
                typesVersions: {
                    "*": {
                        ".": ["./dist/index.d.ts"],
                    },
                },
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath, {
                config: {
                    validation: {
                        bundleLimit: {
                            allowFail: true,
                            limits: {
                                "index.mjs": 1,
                            },
                        },
                        packageJson: {
                            engines: false,
                        },
                    },
                },
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);
            expect(binProcess.stdout).toContain("File size exceeds the limit: dist/index.mjs (21 Bytes / 1.00 Bytes)");
        });

        it("should throw a error if the size of the bundle extends the limit", async () => {
            expect.assertions(2);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `console.log("test");`);

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath, {
                config: {
                    validation: {
                        bundleLimit: {
                            limit: 1,
                        },
                    },
                },
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.exitCode).toBe(1);
            expect(binProcess.stdout).toContain("Total file size exceeds the limit: 93 Bytes / 1.00 Bytes");
        });

        it("should throw a warning if the size of the bundle extends the bundle limit and allowFail is enabled", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `console.log("test");`);

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
                types: "./dist/index.d.ts",
                typesVersions: {
                    "*": {
                        ".": ["./dist/index.d.ts"],
                    },
                },
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath, {
                config: {
                    validation: {
                        bundleLimit: {
                            allowFail: true,
                            limit: 1,
                        },
                        packageJson: {
                            engines: false,
                        },
                    },
                },
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);
            expect(binProcess.stdout).toContain("Total file size exceeds the limit: 93 Bytes / 1.00 Bytes");
        });
    });

    describe("unused dependencies", () => {
        it("should not flag a dependency imported only via `import type` as unused", async () => {
            expect.assertions(2);

            // Stand up a fake "type-only" package directly in the fixture's node_modules so
            // TypeScript can resolve the type import without needing the package linked into
            // the workspace. The validator only inspects package.json vs observed imports.
            const typesOnlyRoot = `${temporaryDirectoryPath}/node_modules/fake-type-only`;

            writeFileSync(`${typesOnlyRoot}/package.json`, JSON.stringify({ name: "fake-type-only", types: "./index.d.ts", version: "1.0.0" }));
            writeFileSync(`${typesOnlyRoot}/index.d.ts`, `export interface Shape { name: string }\n`);

            writeFileSync(
                `${temporaryDirectoryPath}/src/index.ts`,
                `import type { Shape } from "fake-type-only";\n\nexport const nameOf = (s: Shape): string => s.name;\n`,
            );

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                dependencies: {
                    "fake-type-only": "*",
                },
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
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
                types: "./dist/index.d.ts",
                typesVersions: {
                    "*": {
                        ".": ["./dist/index.d.ts"],
                    },
                },
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", ["--validation"], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.stdout + binProcess.stderr).not.toContain("These dependencies are listed in package.json but not used");
            expect(binProcess.exitCode).toBe(0);
        });
    });
});
