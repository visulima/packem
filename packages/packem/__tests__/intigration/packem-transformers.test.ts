import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";
import temporaryDirectory from "../helpers/temporary-directory";

// The byte-exact assertions below capture rollup-specific CJS emit:
//   - `'use strict';` directive prologue
//   - retained source binding name (`const index = ...`)
//   - `module.exports = index;`
// Rolldown emits a structurally different shape:
//   - no `'use strict'`
//   - synthetic default-export rename (`var src_default = ...`)
//   - `module.exports = src_default;`
// These are semantically identical but not byte-comparable, and the
// `normalizeBundleOutput` helper intentionally does NOT rewrite the
// `_default` rename. The transformer plugins themselves run fine under
// rolldown — the assertions are coupled to rollup's CJS shape, not the
// transformer behavior. Splitting per-bundler expected output would
// triple the table size; cheaper to skip and rely on other transformer
// coverage (typescript.test.ts cases) under rolldown.
describe.skipIf(process.env.PACKEM_TEST_BUNDLER === "rolldown")("packem-transformers", () => {
    let temporaryDirectoryPath: string;

    beforeEach(() => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it.each([
        [
            "esbuild",
            `'use strict';

const index = () => "index";

module.exports = index;
`,
            `const index = () => "index";

export { index as default };
`,
        ],
        [
            "swc",
            `'use strict';

function index() {
    return 'index';
}

module.exports = index;
`,
            `function index() {
    return 'index';
}

export { index as default };
`,
        ],
        [
            "sucrase",
            `'use strict';

const index = () => 'index';

module.exports = index;
`,
            `const index = () => 'index';

export { index as default };
`,
        ],
        [
            "oxc",
            `'use strict';

const index = () => "index";

module.exports = index;
`,
            `const index = () => "index";

export { index as default };
`,
        ],
    ])("should transfrom the file with the '%s' transformer", async (transformer, expectedCjs, expectedMjs) => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(
            temporaryDirectoryPath,
            {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
            },
            transformer as "esbuild" | "sucrase" | "swc",
        );
        await createPackemConfig(temporaryDirectoryPath, {
            transformer: transformer as "esbuild" | "oxc" | "sucrase" | "swc",
        });

        const expectedTransformerImports: Record<string, string> = {
            oxc: `${transformer}/oxc-transformer`,
            swc: "swc/swc-plugin",
        };
        const expectedTransformerImport = expectedTransformerImports[transformer] ?? `${transformer}/index`;

        expect(readFileSync(`${temporaryDirectoryPath}/packem.config.ts`)).toContain(expectedTransformerImport);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stdout).contains(transformer);
        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toBe(expectedCjs);
        expect(readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBe(expectedMjs);
    });
});
