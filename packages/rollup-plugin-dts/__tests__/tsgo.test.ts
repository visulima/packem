import { describe, expect, it } from "vitest";

import { spawnAsync } from "../src/tsgo.js";

const exitCode1Error = /code 1/;
const spawnError = /ENOENT|spawn/;

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
