/* eslint-disable vitest/require-mock-type-parameters */
import { rm } from "node:fs/promises";

import { isAccessibleSync, readFileSync } from "@visulima/fs";
import { join } from "@visulima/path";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RollupLogger } from "../../../src/utils/create-rollup-logger";
import FileCache from "../../../src/utils/file-cache";

const hoisted = vi.hoisted(() => {
    return {
        fs: { isAccessibleSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn() },
        logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as RollupLogger,
    };
});

vi.mock(import("@visulima/fs"), () => {
    return { isAccessibleSync: hoisted.fs.isAccessibleSync, readFileSync: hoisted.fs.readFileSync, writeFileSync: hoisted.fs.writeFileSync };
});

describe("fileCache", () => {
    let temporaryDirectoryPath: string;
    let cacheDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
        cacheDirectoryPath = join(temporaryDirectoryPath, "cache");
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should initialize cache path and log appropriately when constructed", () => {
        expect.assertions(1);

        // eslint-disable-next-line no-new, sonarjs/constructor-for-side-effects
        new FileCache(temporaryDirectoryPath, cacheDirectoryPath, "hash123", hoisted.logger);

        expect(hoisted.logger.debug).toHaveBeenCalledExactlyOnceWith({
            message: `Cache path is: ${cacheDirectoryPath}`,
        });
    });

    it("should update isEnabled state when setter is called", () => {
        expect.assertions(1);

        const fileCache = new FileCache(temporaryDirectoryPath, cacheDirectoryPath, "hash123", hoisted.logger);

        fileCache.isEnabled = false;

        expect(fileCache.isEnabled).toBe(false);
    });

    it("should return true if file is accessible in the cache", () => {
        expect.assertions(1);

        vi.mocked(isAccessibleSync).mockReturnValue(true);

        const fileCache = new FileCache(temporaryDirectoryPath, cacheDirectoryPath, "hash123", hoisted.logger);

        expect(fileCache.has("testFile")).toBe(true);
    });

    it("should retrieve data from memory cache if available", () => {
        expect.assertions(3);

        const fileCache = new FileCache(temporaryDirectoryPath, cacheDirectoryPath, "hash123", hoisted.logger);
        const data = { key: "value" };

        vi.mocked(isAccessibleSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify(data));

        expect(fileCache.get("/path/to/file")).toStrictEqual(data);
        expect(fileCache.get("/path/to/file")).toStrictEqual(data);
        expect(readFileSync).toHaveBeenCalledTimes(1);
    });

    it("should read and parse JSON data from file system correctly", () => {
        expect.assertions(1);

        const jsonData = JSON.stringify({ key: "value" });

        vi.mocked(readFileSync).mockReturnValue(jsonData);
        vi.mocked(isAccessibleSync).mockReturnValue(true);

        const fileCache = new FileCache(temporaryDirectoryPath, cacheDirectoryPath, "hash123", hoisted.logger);

        expect(fileCache.get("/path/to/file")).toStrictEqual({ key: "value" });
    });

    it("should handle undefined cache path gracefully in constructor", () => {
        expect.assertions(1);

        // eslint-disable-next-line no-new, sonarjs/constructor-for-side-effects
        new FileCache(temporaryDirectoryPath, undefined, "hash123", hoisted.logger);

        expect(hoisted.logger.debug).toHaveBeenCalledExactlyOnceWith({
            message: "Could not create cache directory.",
        });
    });

    it("should handle non-JSON data correctly in get method", () => {
        expect.assertions(1);

        const nonJsonData = "plain text";

        vi.mocked(readFileSync).mockReturnValue(nonJsonData);
        vi.mocked(isAccessibleSync).mockReturnValue(true);

        const fileCache = new FileCache(temporaryDirectoryPath, cacheDirectoryPath, "hash123", hoisted.logger);

        expect(fileCache.get("/path/to/file")).toStrictEqual(nonJsonData);
    });

    it("should handle undefined data input gracefully in set method", () => {
        expect.assertions(1);

        const fileCache = new FileCache(temporaryDirectoryPath, cacheDirectoryPath, "hash123", hoisted.logger);

        expect(() => fileCache.set("testFile", undefined)).not.toThrow();
    });

    it("should return false if cache is disabled in has method", () => {
        expect.assertions(1);

        const fileCache = new FileCache(temporaryDirectoryPath, cacheDirectoryPath, "hash123", hoisted.logger);

        fileCache.isEnabled = false;

        expect(fileCache.has("testFile")).toBe(false);
    });

    it("should return undefined if cache is disabled in get method", () => {
        expect.assertions(1);

        const fileCache = new FileCache(temporaryDirectoryPath, cacheDirectoryPath, "hash123", hoisted.logger);

        fileCache.isEnabled = false;

        expect(fileCache.get("testFile")).toBeUndefined();
    });
});
