import { describe, expect, it } from "vitest";

import { buildTsgoArgs, spawnAsync } from "../src/tsgo.js";

const exitCode1Error = /code 1/;
const spawnError = /ENOENT|spawn/;

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
});

describe("spawnAsync", () => {
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
