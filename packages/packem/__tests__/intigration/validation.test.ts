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
            expect(binProcess.stdout).toContain("Total file size exceeds the limit: 57 Bytes / 1.00 Bytes");
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
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath, {
                config: {
                    validation: {
                        bundleLimit: {
                            allowFail: true,
                            limit: 1,
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
            expect(binProcess.stdout).toContain("Total file size exceeds the limit: 57 Bytes / 1.00 Bytes");
        });
    });
});
