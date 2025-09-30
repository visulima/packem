import { init } from "cjs-module-lexer";
import { describe, expect, it } from "vitest";

import isPureCJS from "../../../src/utils/is-pure-cjs";

describe(isPureCJS, async () => {
    await init();

    it("node: built-in modules return false", async () => {
        expect.assertions(1);

        await expect(isPureCJS("node:fs", process.cwd())).resolves.toBe(false);
    });

    it(".cjs files return true", async () => {
        expect.assertions(1);

        await expect(isPureCJS("module.cjs", process.cwd())).resolves.toBe(true);
    });

    it("unknown modules return false by default", async () => {
        expect.assertions(1);

        await expect(isPureCJS("nonexistent-module", process.cwd())).resolves.toBe(false);
    });

    it("handles empty importer gracefully", async () => {
        expect.assertions(1);

        await expect(isPureCJS("some-module", "")).resolves.toBe(false);
    });

    it("handles malformed importer paths", async () => {
        expect.assertions(1);

        await expect(isPureCJS("some-module", "./index-!~{009}~.js")).resolves.toBe(false);
    });
});
