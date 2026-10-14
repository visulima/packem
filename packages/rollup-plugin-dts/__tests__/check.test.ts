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

            await expect(
                buildDeclarations(errorEntry, { emitDtsOnly: true, generator: "tsc", tsconfig: errorTsconfig }),
            ).resolves.toMatch(DECLARATION_RE);
        });

        it("fails the build with the diagnostic code when check is true", async () => {
            expect.assertions(1);

            await expect(
                buildDeclarations(errorEntry, { check: true, emitDtsOnly: true, generator: "tsc", tsconfig: errorTsconfig }),
            ).rejects.toThrow(TS2322_RE);
        });

        it("fails the project build in build mode when check is true", async () => {
            expect.assertions(1);

            await expect(
                buildDeclarations(errorEntry, { build: true, check: true, emitDtsOnly: true, generator: "tsc", tsconfig: errorTsconfig }),
            ).rejects.toThrow(TS2322_RE);
        });

        it("builds a valid source when check is true", async () => {
            expect.assertions(1);

            await expect(
                buildDeclarations(validEntry, { check: true, emitDtsOnly: true, generator: "tsc", tsconfig: validTsconfig }),
            ).resolves.toMatch(DECLARATION_RE);
        });
    });

    describe.skipIf(tsgoPath === undefined)("tsgo", () => {
        it("does not type-check by default", async () => {
            expect.assertions(1);

            await expect(
                buildDeclarations(errorEntry, { emitDtsOnly: true, tsconfig: errorTsconfig, tsgo: { path: tsgoPath } }),
            ).resolves.toMatch(DECLARATION_RE);
        });

        it("fails the build with the diagnostic code when check is true", async () => {
            expect.assertions(1);

            await expect(
                buildDeclarations(errorEntry, { check: true, emitDtsOnly: true, tsconfig: errorTsconfig, tsgo: { path: tsgoPath } }),
            ).rejects.toThrow(TS2322_RE);
        });

        it("builds a valid source when check is true", async () => {
            expect.assertions(1);

            await expect(
                buildDeclarations(validEntry, { check: true, emitDtsOnly: true, tsconfig: validTsconfig, tsgo: { path: tsgoPath } }),
            ).resolves.toMatch(DECLARATION_RE);
        });
    });

    describe("oxc", () => {
        it("warns once that check has no effect and still emits", async () => {
            expect.assertions(3);

            const logger = createLogger();

            await expect(
                buildDeclarations(errorEntry, { check: true, emitDtsOnly: true, logger, oxc: true, tsconfig: errorTsconfig }),
            ).resolves.toMatch(DECLARATION_RE);
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
