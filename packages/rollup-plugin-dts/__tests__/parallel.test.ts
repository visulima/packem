import path from "node:path";
import { fileURLToPath } from "node:url";

import { rollupBuild } from "@sxzz/test-utils";
import { describe, expect, it } from "vitest";

import { dts } from "../src/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// `parallel: true` forks the tsc worker as a real child process, so it can only work if the
// worker is actually emitted as a build artifact and can be located at runtime. It used to
// be neither: no worker file was emitted, and the fallback path (`./tsc/worker.js`,
// relative to `import.meta.url`) pointed inside the hashed shared-chunk directory. The
// fork failed and the mode was dead in the published package. These tests drive the real
// child process end to end, so a regression in either half surfaces here.
describe("parallel tsc worker", () => {
    it("emits declarations through the forked worker", async () => {
        expect.assertions(2);

        const { snapshot } = await rollupBuild(
            path.resolve(dirname, "fixtures/basic.ts"),
            [dts({ compilerOptions: { isolatedDeclarations: false }, emitDtsOnly: true, parallel: true })],
            {},
            {},
        );

        expect(snapshot).toContain("declare function fn");
        expect(snapshot).toContain("interface Interface");
    }, 60_000);

    // Several modules are loaded concurrently, so multiple requests are in flight against a
    // single worker at once. Responses are correlated by id; if that correlation were wrong,
    // declarations would be attributed to the wrong module.
    it("keeps concurrent requests correlated to the right module", async () => {
        expect.assertions(2);

        const { snapshot } = await rollupBuild(
            [path.resolve(dirname, "fixtures/basic.ts"), path.resolve(dirname, "fixtures/jsdoc.ts")],
            [dts({ compilerOptions: { isolatedDeclarations: false }, emitDtsOnly: true, parallel: true })],
            {},
            {},
        );

        expect(snapshot).toContain("declare function fn");
        expect(snapshot).toContain("jsdoc");
    }, 60_000);
});
