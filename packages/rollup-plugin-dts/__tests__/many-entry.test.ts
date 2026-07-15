import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rollup } from "rollup";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dts } from "../src/index.js";
import { MAX_RETAINED_PROGRAMS } from "../src/tsc/emit-compiler.js";
import { globalContext } from "../src/tsc/context.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const temporaryDirectory = path.join(dirname, "temp/many-entry");

// Regression for visulima/packem#216: the tsc DTS path used to root one shared program at *every*
// build entry and full-type-check the union at once, so memory scaled with total entry count and
// OOM'd on many-entry packages. The fix roots each program at only its own module. This test guards
// the functional side of that change — every entry must still receive a correct, non-empty
// declaration — across more entries than the per-entry program cache retains (MAX_RETAINED_PROGRAMS),
// so the cache evicts and rebuilds mid-build.
describe("many-entry dts (packem#216)", () => {
    beforeAll(async () => {
        await rm(temporaryDirectory, { force: true, recursive: true });
        await mkdir(temporaryDirectory, { recursive: true });
        await writeFile(
            path.join(temporaryDirectory, "tsconfig.json"),
            JSON.stringify({ compilerOptions: { module: "ESNext", moduleResolution: "Bundler", strict: true, target: "ESNext" } }),
        );
    });

    afterAll(async () => {
        await rm(temporaryDirectory, { force: true, recursive: true });
    });

    it("emits a correct declaration for every entry when a build has many independent entries", async () => {
        expect.hasAssertions();

        // Default options use `globalContext` (newContext is false), so reset it for an isolated
        // program-count assertion below.
        globalContext.programs.length = 0;

        const entryCount = 12;
        const input: Record<string, string> = {};

        for (let index = 0; index < entryCount; index++) {
            const file = path.join(temporaryDirectory, `entry${index}.ts`);

            await writeFile(
                file,
                `export interface Entry${index} { readonly tag: "entry-${index}"; readonly value: number; }\nexport declare const entry${index}: Entry${index};\n`,
            );

            input[`entry${index}`] = file;
        }

        const bundle = await rollup({
            input,
            plugins: [dts({ emitDtsOnly: true, oxc: false, tsconfig: path.join(temporaryDirectory, "tsconfig.json") })],
        });

        const { output } = await bundle.generate({ format: "es" });

        await bundle.close();

        const chunks = output.filter((item): item is Extract<typeof item, { type: "chunk" }> => item.type === "chunk");

        for (let index = 0; index < entryCount; index++) {
            const chunk = chunks.find((candidate) => candidate.code.includes(`interface Entry${index}`));

            expect(chunk, `entry${index} declaration should be emitted`).toBeDefined();
            expect(chunk?.code).toContain(`tag: "entry-${index}"`);
        }

        // The fix roots each program at one entry, so independent entries produce multiple programs
        // (a revert to the shared all-entries program would leave exactly 1), and retention is
        // capped (a revert of the eviction would leave one per entry, i.e. `entryCount`).
        expect(globalContext.programs.length).toBeGreaterThan(1);
        expect(globalContext.programs.length).toBeLessThanOrEqual(MAX_RETAINED_PROGRAMS);
    });
});
