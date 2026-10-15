import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildTsgoArgs, isTS70Installed, spawnAsync } from "../src/tsgo.js";

const exitCode1Error = /code 1/;
const spawnError = /ENOENT|spawn/;
const TS2322_RE = /TS2322/u;

describe("buildTsgoArgs", () => {
    it("includes -p with the project and --declarationMap when sourcemap is on", () => {
        expect.assertions(3);

        const args = buildTsgoArgs("/project/tsconfig.json", "/dist", "/root", true);

        expect(args).toContain("-p");
        expect(args[args.indexOf("-p") + 1]).toBe("/project/tsconfig.json");
        expect(args).toContain("--declarationMap");
    });

    it("omits -p when no project and --declarationMap when sourcemap is off", () => {
        expect.assertions(2);

        const args = buildTsgoArgs(undefined, "/dist", "/root", false);

        expect(args).not.toContain("-p");
        expect(args).not.toContain("--declarationMap");
    });

    it("passes --noCheck unless check is requested", () => {
        expect.assertions(2);

        expect(buildTsgoArgs("/project/tsconfig.json", "/dist", "/root")).toContain("--noCheck");
        expect(buildTsgoArgs("/project/tsconfig.json", "/dist", "/root", false, true)).not.toContain("--noCheck");
    });
});

describe("spawnAsync", () => {
    it("includes stdout in the rejection, since tsgo prints its diagnostics there", async () => {
        expect.assertions(1);

        const script = `process.stdout.write("index.ts(1,7): error TS2322: diagnostic"); process.exit(2);`;

        await expect(spawnAsync(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "pipe"] })).rejects.toThrow(TS2322_RE);
    });

    it("resolves when the process exits with code 0", async () => {
        expect.assertions(1);

        await expect(spawnAsync(process.execPath, ["-e", "process.exit(0)"], {})).resolves.toBeUndefined();
    });

    it("rejects with an error message containing the exit code when the process exits with a non-zero code", async () => {
        expect.assertions(1);

        await expect(spawnAsync(process.execPath, ["-e", "process.exit(1)"], {})).rejects.toThrow(exitCode1Error);
    });

    it("rejects when the binary cannot be spawned", async () => {
        expect.assertions(1);

        await expect(spawnAsync("/nonexistent-binary-xyz", [], {})).rejects.toThrow(spawnError);
    });
});

describe("isTS70Installed", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const installFakeTypescript = (versionMajorMinor: string): string => {
        const root = mkdtempSync(join(tmpdir(), "dts-ts-version-"));
        const packageDirectory = join(root, "node_modules", "typescript");

        mkdirSync(packageDirectory, { recursive: true });
        writeFileSync(join(packageDirectory, "package.json"), JSON.stringify({ main: "index.cjs", name: "typescript", version: `${versionMajorMinor}.0` }));
        writeFileSync(join(packageDirectory, "index.cjs"), `module.exports = { versionMajorMinor: "${versionMajorMinor}" };`);

        return root;
    };

    it.each([
        ["7.0", true],
        ["7.1", true],
        ["6.0", false],
    ])("resolves typescript %s from the project, not from this package (-> %s)", (version, expected) => {
        expect.assertions(1);

        const root = installFakeTypescript(version);

        vi.spyOn(process, "cwd").mockReturnValue(root);

        try {
            expect(isTS70Installed()).toBe(expected);
        } finally {
            rmSync(root, { force: true, recursive: true });
        }
    });
});
