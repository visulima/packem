import { mkdtemp, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rollup } from "rollup";
import { describe, expect, it, vi } from "vitest";

import { dts } from "../src/index.js";
import type { Options } from "../src/options.js";
import { getTsgoPathFromNodeModules } from "../src/tsgo.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const errorTsconfig = path.resolve(dirname, "fixtures/check/error/tsconfig.json");
const validTsconfig = path.resolve(dirname, "fixtures/check/valid/tsconfig.json");
const errorEntry = path.resolve(dirname, "fixtures/check/error/index.ts");
const validEntry = path.resolve(dirname, "fixtures/check/valid/index.ts");

const TS2322_RE = /TS2322/u;
const DECLARATION_RE = /declare const value: number/u;
const CHECK_WARNING_RE = /`check` option has no effect with the `oxc` generator/u;

const createLogger = () => {
    return { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
};

const findTsgoPath = (): string | undefined => {
    try {
        return getTsgoPathFromNodeModules(createLogger());
    } catch {
        return undefined;
    }
};

const tsgoPath = findTsgoPath();

const buildDeclarations = async (input: string, options: Options): Promise<string> => {
    const bundle = await rollup({ input, plugins: dts(options) });

    try {
        const { output } = await bundle.generate({ format: "es" });

        return output.map((chunk) => (chunk.type === "chunk" ? chunk.code : "")).join("\n");
    } finally {
        await bundle.close();
    }
};

describe("check option", () => {
    describe("tsc", () => {
        it("does not type-check by default", async () => {
            expect.assertions(1);

            await expect(buildDeclarations(errorEntry, { emitDtsOnly: true, generator: "tsc", tsconfig: errorTsconfig })).resolves.toMatch(DECLARATION_RE);
        });

        it("fails the build with the diagnostic code when check is true", async () => {
            expect.assertions(1);

            await expect(buildDeclarations(errorEntry, { check: true, emitDtsOnly: true, generator: "tsc", tsconfig: errorTsconfig })).rejects.toThrow(
                TS2322_RE,
            );
        });

        it("fails the project build in build mode when check is true", async () => {
            expect.assertions(1);

            await expect(
                buildDeclarations(errorEntry, { build: true, check: true, emitDtsOnly: true, generator: "tsc", tsconfig: errorTsconfig }),
            ).rejects.toThrow(TS2322_RE);
        });

        it("builds a valid source when check is true", async () => {
            expect.assertions(1);

            await expect(buildDeclarations(validEntry, { check: true, emitDtsOnly: true, generator: "tsc", tsconfig: validTsconfig })).resolves.toMatch(
                DECLARATION_RE,
            );
        });

        it("fails a second build-mode check when the edited source looks older than the build info", async () => {
            expect.assertions(2);

            const root = await realpath(await mkdtemp(path.join(tmpdir(), "rollup-plugin-dts-check-")));

            try {
                const tsconfig = path.join(root, "tsconfig.json");
                const entry = path.join(root, "index.ts");
                const options: Options = { build: true, check: true, emitDtsOnly: true, generator: "tsc", newContext: true, tsconfig };

                await writeFile(
                    tsconfig,
                    JSON.stringify({
                        compilerOptions: {
                            declaration: true,
                            incremental: true,
                            module: "esnext",
                            moduleResolution: "bundler",
                            outDir: "./dist",
                            skipLibCheck: true,
                            strict: true,
                            target: "esnext",
                            types: [],
                        },
                        include: ["index.ts"],
                    }),
                );
                await writeFile(entry, "export const value: number = 1;\n");

                await expect(buildDeclarations(entry, options)).resolves.toMatch(DECLARATION_RE);

                // The solution builder decides up-to-dateness from modification times. An edit that
                // leaves the source older than the build info (e.g. a restored cache) is skipped by it.
                await writeFile(entry, 'export const value: number = "not a number";\n');
                const past = new Date(2000, 0, 1);
                await utimes(entry, past, past);

                await expect(buildDeclarations(entry, options)).rejects.toThrow(TS2322_RE);
            } finally {
                await rm(root, { force: true, recursive: true });
            }
        });
    });

    describe.skipIf(tsgoPath === undefined)("tsgo", () => {
        it("does not type-check by default", async () => {
            expect.assertions(1);

            await expect(buildDeclarations(errorEntry, { emitDtsOnly: true, tsconfig: errorTsconfig, tsgo: { path: tsgoPath } })).resolves.toMatch(
                DECLARATION_RE,
            );
        });

        it("fails the build with the diagnostic code when check is true", async () => {
            expect.assertions(1);

            await expect(buildDeclarations(errorEntry, { check: true, emitDtsOnly: true, tsconfig: errorTsconfig, tsgo: { path: tsgoPath } })).rejects.toThrow(
                TS2322_RE,
            );
        });

        it("builds a valid source when check is true", async () => {
            expect.assertions(1);

            await expect(buildDeclarations(validEntry, { check: true, emitDtsOnly: true, tsconfig: validTsconfig, tsgo: { path: tsgoPath } })).resolves.toMatch(
                DECLARATION_RE,
            );
        });
    });

    describe("oxc", () => {
        it("warns once that check has no effect and still emits", async () => {
            expect.assertions(3);

            const logger = createLogger();

            await expect(buildDeclarations(errorEntry, { check: true, emitDtsOnly: true, logger, oxc: true, tsconfig: errorTsconfig })).resolves.toMatch(
                DECLARATION_RE,
            );
            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(CHECK_WARNING_RE));
        });

        it("does not warn when check is not set", () => {
            expect.assertions(1);

            const logger = createLogger();

            dts({ emitDtsOnly: true, logger, oxc: true, tsconfig: errorTsconfig });

            expect(logger.warn).not.toHaveBeenCalled();
        });
    });
});
