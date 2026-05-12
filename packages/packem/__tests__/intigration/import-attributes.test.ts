import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

describe("packem import-attributes", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        await createPackemConfig(temporaryDirectoryPath);
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    describe('type: "text"', () => {
        it("should inline file content as string in ESM output", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/page.html`, `<h1>Hello World</h1>`);
            writeFileSync(
                `${temporaryDirectoryPath}/src/index.ts`,
                `import html from "./page.html" with { type: "text" };

export const content = html;`,
            );

            await installPackage(temporaryDirectoryPath, "typescript");
            await createTsConfig(temporaryDirectoryPath);
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                module: "./dist/index.mjs",
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjsContent).toContain("<h1>Hello World</h1>");
        });

        it("should inline file content as string in CJS output", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/page.html`, `<h1>Hello World</h1>`);
            writeFileSync(
                `${temporaryDirectoryPath}/src/index.ts`,
                `import html from "./page.html" with { type: "text" };

export const content = html;`,
            );

            await installPackage(temporaryDirectoryPath, "typescript");
            await createTsConfig(temporaryDirectoryPath);
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            expect(cjsContent).toContain("<h1>Hello World</h1>");
        });

        it("should handle empty text files", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/empty.txt`, ``);
            writeFileSync(
                `${temporaryDirectoryPath}/src/index.ts`,
                `import text from "./empty.txt" with { type: "text" };

export const content = text;`,
            );

            await installPackage(temporaryDirectoryPath, "typescript");
            await createTsConfig(temporaryDirectoryPath);
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                module: "./dist/index.mjs",
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjsContent).toContain('""');
        });
    });

    describe('type: "bytes"', () => {
        it("should inline file content as Uint8Array in ESM output", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/data.bin`, Buffer.from([0x00, 0x01, 0x02, 0xff]));
            writeFileSync(
                `${temporaryDirectoryPath}/src/index.ts`,
                `import bytes from "./data.bin" with { type: "bytes" };

export const data = bytes;`,
            );

            await installPackage(temporaryDirectoryPath, "typescript");
            await createTsConfig(temporaryDirectoryPath);
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                module: "./dist/index.mjs",
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjsContent).toContain("Uint8Array");
        });

        it("should inline file content as Uint8Array in CJS output", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/data.bin`, Buffer.from([0x00, 0x01, 0x02, 0xff]));
            writeFileSync(
                `${temporaryDirectoryPath}/src/index.ts`,
                `import bytes from "./data.bin" with { type: "bytes" };

export const data = bytes;`,
            );

            await installPackage(temporaryDirectoryPath, "typescript");
            await createTsConfig(temporaryDirectoryPath);
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            expect(cjsContent).toContain("Uint8Array");
        });

        it("should handle empty binary files", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/empty.bin`, Buffer.alloc(0));
            writeFileSync(
                `${temporaryDirectoryPath}/src/index.ts`,
                `import bytes from "./empty.bin" with { type: "bytes" };

export const data = bytes;`,
            );

            await installPackage(temporaryDirectoryPath, "typescript");
            await createTsConfig(temporaryDirectoryPath);
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                module: "./dist/index.mjs",
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjsContent).toContain("Uint8Array([])");
        });
    });

    // Per spec, file extensions are irrelevant for import attributes:
    // - proposal-import-text: host-defined, no extension restrictions
    // - proposal-import-bytes: "The file extension will be ignored."
    describe("any file extension", () => {
        const extensions = [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx", ".jsx", ".txt", ".html", ".bin", ".wasm"];

        for (const extension of extensions) {
            it(`type: "text" with ${extension}`, async () => {
                expect.assertions(3);

                const fileName = `data${extension}`;

                writeFileSync(`${temporaryDirectoryPath}/src/${fileName}`, `file content`);
                writeFileSync(
                    `${temporaryDirectoryPath}/src/index.ts`,
                    `import text from "./${fileName}" with { type: "text" };

export const content = text;`,
                );

                await installPackage(temporaryDirectoryPath, "typescript");
                await createTsConfig(temporaryDirectoryPath);
                await createPackageJson(temporaryDirectoryPath, {
                    devDependencies: {
                        typescript: "*",
                    },
                    module: "./dist/index.mjs",
                });

                const binProcess = await execPackem("build", [], {
                    cwd: temporaryDirectoryPath,
                    reject: false,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);

                const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

                expect(mjsContent).toContain("file content");
            });

            it(`type: "bytes" with ${extension}`, async () => {
                expect.assertions(3);

                const fileName = `data${extension}`;

                writeFileSync(`${temporaryDirectoryPath}/src/${fileName}`, Buffer.from([0xca, 0xfe]));
                writeFileSync(
                    `${temporaryDirectoryPath}/src/index.ts`,
                    `import bytes from "./${fileName}" with { type: "bytes" };

export const data = bytes;`,
                );

                await installPackage(temporaryDirectoryPath, "typescript");
                await createTsConfig(temporaryDirectoryPath);
                await createPackageJson(temporaryDirectoryPath, {
                    devDependencies: {
                        typescript: "*",
                    },
                    module: "./dist/index.mjs",
                });

                const binProcess = await execPackem("build", [], {
                    cwd: temporaryDirectoryPath,
                    reject: false,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);

                const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

                expect(mjsContent).toContain("Uint8Array");
            });
        }
    });

    describe("both ESM and CJS outputs", () => {
        it("should generate both outputs with inlined text content", async () => {
            expect.assertions(4);

            writeFileSync(`${temporaryDirectoryPath}/src/template.html`, `<div>Template</div>`);
            writeFileSync(
                `${temporaryDirectoryPath}/src/index.ts`,
                `import html from "./template.html" with { type: "text" };

export const template = html;`,
            );

            await installPackage(temporaryDirectoryPath, "typescript");
            await createTsConfig(temporaryDirectoryPath);
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjsContent).toContain("<div>Template</div>");

            const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            expect(cjsContent).toContain("<div>Template</div>");
        });
    });
});
