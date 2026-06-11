import { describe, expect, it } from "vitest";

import { spawnAsync } from "../src/tsgo.js";

describe("spawnAsync", () => {
    it("resolves when the process exits with code 0", async () => {
        await expect(spawnAsync(process.execPath, ["-e", "process.exit(0)"], {})).resolves.toBeUndefined();
    });

    it("rejects with an error message containing the exit code when the process exits with a non-zero code", async () => {
        await expect(spawnAsync(process.execPath, ["-e", "process.exit(1)"], {})).rejects.toThrow(/code 1/);
    });

    it("rejects when the binary cannot be spawned", async () => {
        await expect(spawnAsync("/nonexistent-binary-xyz", [], {})).rejects.toThrow();
    });
});
