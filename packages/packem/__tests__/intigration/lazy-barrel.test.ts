import { rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { writeFile, writeJson } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackem } from "../helpers";

describe("lazy-barrel", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should build a project with barrel re-exports and run output", async () => {
        expect.assertions(3);

        // Create source files similar to provided lazy-barrel case
        const source = (p: string) => join(temporaryDirectoryPath, "src", p);

        await writeJson(join(temporaryDirectoryPath, "src", "package.json"), { sideEffects: false }, { overwrite: true });

        // named-barrel
        await writeFile(source("named-barrel/a.js"), "export const a = 'a';\n");
        await writeFile(source("named-barrel/b.js"), "export const b = 'b';\n");
        await writeFile(
            source("named-barrel/index.js"),
            "export { a as b } from './a';\nexport { b as c } from './b';\n",
        );

        // mixed-barrel
        await writeFile(source("mixed-barrel/a.js"), "export default 'a';\n");
        await writeFile(source("mixed-barrel/b.js"), "export const b = 'b';\n");
        await writeFile(source("mixed-barrel/c.js"), "export const value = 'c';\n");
        await writeFile(
            source("mixed-barrel/index.js"),
            "export { default as a } from './a';\nexport * from './b';\nexport { value as b } from './c';\nexport const d = 'd';\n",
        );

        // star-barrel
        await writeFile(source("star-barrel/a.js"), "export const a = 'a';\n");
        await writeFile(source("star-barrel/b.js"), "export const b = 'b';\n");
        await writeFile(source("star-barrel/c.js"), "export const c = 'c';\n");
        await writeFile(
            source("star-barrel/index.js"),
            "export { c } from './c';\nexport * from './a';\nexport * from './b';\nexport const d = 'd';\n",
        );

        // nested-barrel
        await writeFile(source("nested-barrel/b.js"), "export const b = 'b';\n");
        await writeFile(source("nested-barrel/c.js"), "export const c = 'c';\n");
        await writeFile(
            source("nested-barrel/a.js"),
            "import { b as a } from './b';\nexport { a };\nexport { c } from './c';\n",
        );
        await writeFile(
            source("nested-barrel/index.js"),
            "export { a } from './a';\nexport { c } from './c';\n",
        );

        // Entry that imports from barrels and exports a run function for assertions
        await writeFile(
            source("index.js"),
            [
                "import { b as a } from './named-barrel/index.js';",
                "import { b as c, d } from './mixed-barrel/index.js';",
                "import { b } from './star-barrel/index.js';",
                "import * as nested from './nested-barrel/index.js';",
                "export const run = () => ({ a, b, c, d, nestedA: nested.a });",
                "export default run;",
                "",
            ].join("\n"),
        );

        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
            },
            sideEffects: false,
        });

        await createPackemConfig(temporaryDirectoryPath, {
            transformer: "esbuild",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Dynamically import built module and verify runtime values
        const mjsUrl = pathToFileURL(join(temporaryDirectoryPath, "dist", "index.mjs")).href;
        const module_ = (await import(mjsUrl)) as { default?: () => unknown; run?: () => unknown };
        const result = module_.run?.() ?? await module_.default?.();

        expect(result).toStrictEqual({ a: "a", b: "b", c: "c", d: "d", nestedA: "b" });
    });
});
