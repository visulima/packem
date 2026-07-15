import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeFileSync } from "@visulima/fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

const IMPORT_TRACE_HEADER_REGEX = /Import trace:\n/;

const TRACE_TS_BROKEN_PATTERNS: RegExp[] = [/broken\.ts/, IMPORT_TRACE_HEADER_REGEX, /src[/\\]index\.ts\n/, /↳[^\n]{0,500}src[/\\]broken\.ts/];

const TRACE_TS_THREE_LEVEL_PATTERNS: RegExp[] = [
    /broken\.ts/,
    IMPORT_TRACE_HEADER_REGEX,
    /src[/\\]index\.ts\n/,
    /↳[^\n]{0,500}src[/\\]middle\.ts\n/,
    /↳[^\n]{0,500}src[/\\]broken\.ts/,
];

const TRACE_JS_BROKEN_PATTERNS: RegExp[] = [/broken\.js/, IMPORT_TRACE_HEADER_REGEX, /src[/\\]index\.js\n/, /↳[^\n]{0,500}src[/\\]broken\.js/];

const TRACE_DTS_BROKEN_PATTERNS: RegExp[] = [/does-not-exist/, IMPORT_TRACE_HEADER_REGEX, /src[/\\]index\.d\.ts\n/, /↳[^\n]{0,500}src[/\\]broken\.d\.ts/];

const INDEX_TS_REGEX = /index\.ts/;

const IMPORT_TRACE_LABEL_REGEX = /Import trace:/;

// Matches ANSI SGR escape sequences (ESC [ <digits/semicolons> m). The ESC
// byte (U+001B) is a literal control character, so the pattern must contain it
// directly. `[\d;]+` is a non-backtracking equivalent of `\d+(?:;\d+)*` for
// the realistic SGR parameter bytes emitted by terminal colorizers.
// eslint-disable-next-line no-control-regex -- ANSI escape sequences begin with the U+001B control char; stripping them requires matching that char.
const ANSI_ESCAPE_REGEX = /\u001B\[[\d;]+m/g;

/**
 * Strips ANSI escape codes from text for reliable matching.
 */
const stripAnsi = (text: string): string => text.replaceAll(ANSI_ESCAPE_REGEX, "");

/**
 * Asserts that the given patterns appear in the text in the specified order.
 * ANSI codes are stripped before matching.
 */
const expectMatchesInOrder = (text: string, patterns: RegExp[]): void => {
    const cleaned = stripAnsi(text);
    let lastIndex = 0;

    for (const pattern of patterns) {
        const match = pattern.exec(cleaned.slice(lastIndex));

        expect(match, `Expected pattern ${String(pattern)} to match in remaining text starting at index ${String(lastIndex)}`).not.toBeNull();

        lastIndex += (match?.index ?? 0) + (match?.[0]?.length ?? 0);
    }
};

describe("packem error cases", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        // Resolve the realpath so the temp dir matches packem's reported path. On
        // macOS tmpdir() returns /var/folders/... but packem resolves the realpath
        // /private/var/folders/...; without this the path assertions never match.
        temporaryDirectoryPath = realpathSync(mkdtempSync(join(tmpdir(), "packem-error-cases-")));

        await createPackemConfig(temporaryDirectoryPath);
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should throw a error if no package.json was found", async () => {
        expect.assertions(2);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain(`package.json not found at ${temporaryDirectoryPath}`);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if package.json is invalid", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/package.json`, "{");

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        const NODE_JS_VERSION = Number(process.versions.node.split(".")[0]);
        // Node.js changed the error message for invalid package.json across versions:
        // < 20: "Unexpected end of JSON input in"
        // 20-21: "Expected property name or"
        // 22+: "Invalid package config" (ERR_INVALID_PACKAGE_CONFIG)
        const expectedMessageByMajor = (major: number): string => {
            if (major < 20) {
                return "Unexpected end of JSON input in";
            }

            if (major < 22) {
                return "Expected property name or";
            }

            return "Invalid package config";
        };
        const expectedMessage = expectedMessageByMajor(NODE_JS_VERSION);

        expect(binProcess.stderr).toContain(expectedMessage);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if no src directory was found", async () => {
        expect.assertions(2);

        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            name: "pkg",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain("No 'src' directory found. Please provide entries manually.");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if src dir has no entries", async () => {
        expect.assertions(2);

        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            name: "pkg",
        });

        mkdirSync(`${temporaryDirectoryPath}/src`);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain("No source files found in 'src' directory. Please provide entries manually.");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if package.json has no entry", async () => {
        expect.assertions(2);

        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            name: "pkg",
        });
        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "");

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain("No entries detected. Please provide entries manually.");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if conflicting entry in package.json", async () => {
        expect.assertions(3);

        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            engines: {
                node: ">=20",
            },
            files: ["dist"],
            main: "dist/index.js",
            module: "dist/index.js",
            name: "pkg",
        });
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, "");

        const binProcess = await execPackem("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain(`Conflict detected: The 'module' and 'main' fields both point to 'dist/index`);
        expect(binProcess.stderr).toContain(`Please ensure they refer to different module types.`);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should warn on invalid exports as ESM", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/foo.js`, `export const foo = "foo";`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const index = "index";`);

        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    require: "./dist/index.mjs",
                },
                "./foo": {
                    import: "./dist/foo.cjs",
                },
            },
            files: ["dist"],
            main: "./dist/index.mjs",
            module: "./dist/index.mjs",
        });

        const binProcess = await execPackem("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain(`The 'main' field in your package.json should not use a '.mjs' extension for`);
        expect(binProcess.stderr).toContain(`CommonJS modules.`);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should warn on invalid exports as CJS", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/foo.js`, `export const foo = "foo";`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const index = "index";`);

        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    require: "./dist/index.mjs",
                },
                "./foo": {
                    import: "./dist/foo.cjs",
                },
            },
            files: ["dist"],
            main: "./dist/index.cjs",
            module: "./dist/index.cjs",
        });

        const binProcess = await execPackem("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain(`The 'module' field in your package.json should not use a '.cjs' extension f`);
        expect(binProcess.stderr).toContain(`or ES modules.`);
        expect(binProcess.exitCode).toBe(1);
    });

    // Rolldown emits a different error format and does not run the rollup-plugin-import-trace
    // output through its error renderer, so the "Import trace:" header / ↳ markers are absent.
    describe.skipIf(process.env.PACKEM_TEST_BUNDLER === "rolldown")("import trace", () => {
        it("should show import trace with 2 levels on build error", async () => {
            expect.assertions(5);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export { value } from "./broken";`);
            // Syntax error that esbuild cannot transform
            writeFileSync(`${temporaryDirectoryPath}/src/broken.ts`, `export const value: string = !!!;`);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                module: "./dist/index.mjs",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.exitCode).toBe(1);

            expectMatchesInOrder(binProcess.stderr as string, TRACE_TS_BROKEN_PATTERNS);
        });

        it("should show import trace with 3 levels on build error", async () => {
            expect.assertions(6);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export { value } from "./middle";`);
            writeFileSync(`${temporaryDirectoryPath}/src/middle.ts`, `export { value } from "./broken";`);
            writeFileSync(`${temporaryDirectoryPath}/src/broken.ts`, `export const value: string = !!!;`);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                module: "./dist/index.mjs",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.exitCode).toBe(1);

            expectMatchesInOrder(binProcess.stderr as string, TRACE_TS_THREE_LEVEL_PATTERNS);
        });

        it("should not show import trace when error is in entry point", async () => {
            expect.assertions(3);

            // Syntax error directly in the entry point
            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value: string = !!!;`);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                module: "./dist/index.mjs",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.exitCode).toBe(1);
            expect(binProcess.stderr).toMatch(INDEX_TS_REGEX);
            // Entry point errors should NOT show import trace (trace length = 1)
            expect(binProcess.stderr).not.toMatch(IMPORT_TRACE_LABEL_REGEX);
        });

        it("should show import trace with plain js files", async () => {
            expect.assertions(5);

            writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export { value } from "./broken.js";`);
            // Syntax error that esbuild cannot transform
            writeFileSync(`${temporaryDirectoryPath}/src/broken.js`, `export const value = !!!;`);

            await createPackageJson(temporaryDirectoryPath, {
                module: "./dist/index.mjs",
                type: "module",
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.exitCode).toBe(1);

            expectMatchesInOrder(binProcess.stderr as string, TRACE_JS_BROKEN_PATTERNS);
        });

        it("should show import trace on dts build error", async () => {
            expect.assertions(5);

            await installPackage(temporaryDirectoryPath, "typescript");

            // index.ts re-exports from broken.ts
            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export { helper } from "./broken";`);
            // broken.ts has a value export (JS build succeeds) AND a type-only re-export
            // from a non-existent module. Esbuild strips the type export for the JS build,
            // but tsc preserves it in the .d.ts — causing the DTS build to fail on resolution.
            writeFileSync(`${temporaryDirectoryPath}/src/broken.ts`, `export const helper = 42;\nexport type { MissingType } from "./does-not-exist";`);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                exports: {
                    ".": {
                        default: "./dist/index.mjs",
                        types: "./dist/index.d.mts",
                    },
                },
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.exitCode).toBe(1);

            expectMatchesInOrder(binProcess.stderr as string, TRACE_DTS_BROKEN_PATTERNS);
        });
    });
});
