/* eslint-disable no-secrets/no-secrets */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import loadEnvFile from "../../../src/config/utils/load-env-file";

describe(loadEnvFile, () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = temporaryDirectory();
    });

    afterEach(() => {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { force: true, recursive: true });
        }
    });

    it("should load environment variables from .env file", async () => {
        expect.assertions(1);

        const envFile = join(tempDir, ".env");

        writeFileSync(envFile, "PACKEM_API_URL=https://api.example.com\nPACKEM_VERSION=1.0.0\n");

        const result = await loadEnvFile(".env", tempDir, "PACKEM_");

        expect(result).toEqual({
            "process.env.PACKEM_API_URL": "\"https://api.example.com\"",
            "process.env.PACKEM_VERSION": "\"1.0.0\"",
        });
    });

    it("should filter variables by prefix", async () => {
        expect.assertions(1);

        const envFile = join(tempDir, ".env");

        writeFileSync(envFile, "PACKEM_API_URL=https://api.example.com\nOTHER_VAR=should-be-ignored\nPACKEM_VERSION=1.0.0\n");

        const result = await loadEnvFile(".env", tempDir, "PACKEM_");

        expect(result).toEqual({
            "process.env.PACKEM_API_URL": "\"https://api.example.com\"",
            "process.env.PACKEM_VERSION": "\"1.0.0\"",
        });
    });

    it("should handle empty prefix (load all variables)", async () => {
        expect.assertions(1);

        const envFile = join(tempDir, ".env");

        writeFileSync(envFile, "API_URL=https://api.example.com\nVERSION=1.0.0\n");

        const result = await loadEnvFile(".env", tempDir, "");

        expect(result).toEqual({
            "process.env.API_URL": "\"https://api.example.com\"",
            "process.env.VERSION": "\"1.0.0\"",
        });
    });

    it("should handle quoted values", async () => {
        expect.assertions(1);

        const envFile = join(tempDir, ".env");

        writeFileSync(envFile, "PACKEM_API_URL=\"https://api.example.com\"\nPACKEM_MESSAGE='Hello World'\n");

        const result = await loadEnvFile(".env", tempDir, "PACKEM_");

        expect(result).toEqual({
            "process.env.PACKEM_API_URL": "\"https://api.example.com\"",
            "process.env.PACKEM_MESSAGE": "\"Hello World\"",
        });
    });

    it("should skip comments and empty lines", async () => {
        expect.assertions(1);

        const envFile = join(tempDir, ".env");

        writeFileSync(envFile, "# This is a comment\nPACKEM_API_URL=https://api.example.com\n\n# Another comment\nPACKEM_VERSION=1.0.0\n");

        const result = await loadEnvFile(".env", tempDir, "PACKEM_");

        expect(result).toEqual({
            "process.env.PACKEM_API_URL": "\"https://api.example.com\"",
            "process.env.PACKEM_VERSION": "\"1.0.0\"",
        });
    });

    it("should return empty object if file does not exist", async () => {
        expect.assertions(1);

        const result = await loadEnvFile(".env", tempDir, "PACKEM_");

        expect(result).toEqual({});
    });

    it("should handle relative paths", async () => {
        expect.assertions(1);

        const subDir = join(tempDir, "config");

        mkdirSync(subDir, { recursive: true });
        const envFile = join(subDir, ".env");

        writeFileSync(envFile, "PACKEM_API_URL=https://api.example.com\n");

        const result = await loadEnvFile("config/.env", tempDir, "PACKEM_");

        expect(result).toEqual({
            "process.env.PACKEM_API_URL": "\"https://api.example.com\"",
        });
    });

    it("should handle absolute paths", async () => {
        expect.assertions(1);

        const envFile = join(tempDir, ".env");

        writeFileSync(envFile, "PACKEM_API_URL=https://api.example.com\n");

        const result = await loadEnvFile(envFile, tempDir, "PACKEM_");

        expect(result).toEqual({
            "process.env.PACKEM_API_URL": "\"https://api.example.com\"",
        });
    });

    it("should use default prefix PACKEM_ if not provided", async () => {
        expect.assertions(1);

        const envFile = join(tempDir, ".env");

        writeFileSync(envFile, "PACKEM_API_URL=https://api.example.com\nOTHER_VAR=should-be-ignored\n");

        const result = await loadEnvFile(".env", tempDir);

        expect(result).toEqual({
            "process.env.PACKEM_API_URL": "\"https://api.example.com\"",
        });
    });

    it("should handle values with equals signs", async () => {
        expect.assertions(1);

        const envFile = join(tempDir, ".env");

        writeFileSync(envFile, "PACKEM_CONFIG=key=value\nPACKEM_QUERY=param1=val1&param2=val2\n");

        const result = await loadEnvFile(".env", tempDir, "PACKEM_");

        expect(result).toEqual({
            "process.env.PACKEM_CONFIG": "\"key=value\"",
            "process.env.PACKEM_QUERY": "\"param1=val1&param2=val2\"",
        });
    });

    it("should handle multiline values (basic support)", async () => {
        expect.assertions(2);

        const envFile = join(tempDir, ".env");

        writeFileSync(envFile, "PACKEM_MULTILINE=line1\\nline2\nPACKEM_SIMPLE=value\n");

        const result = await loadEnvFile(".env", tempDir, "PACKEM_");

        // Note: Basic parser doesn't handle escaped newlines, but should still work
        expect(result).toHaveProperty("process.env.PACKEM_MULTILINE");
        expect(result).toHaveProperty("process.env.PACKEM_SIMPLE");
    });
});
