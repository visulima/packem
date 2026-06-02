import { readdirSync } from "node:fs";
import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
// eslint-disable-next-line e18e/ban-dependencies -- tempy is core test-runner infra; fs.mkdtemp migration tracked separately
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";
import { normalizeBundleOutput } from "../helpers/testing-utils";

const isRolldown = process.env.PACKEM_TEST_BUNDLER === "rolldown";

describe("packem preserve-directives", () => {
    let temporaryDirectoryPath: string;

    beforeEach(() => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    // Rolldown auto-detects entry files with no imports/exports as CJS and wraps
    // them in a `__commonJSMin(() => { ... })` IIFE — a substantive bundler
    // behavior difference, not a normalize-able artifact. Shebang preservation
    // still works under rolldown; the wrapping just changes the body shape.
    it.skipIf(isRolldown)("should preserve user added shebang", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `#!/usr/bin/env node
console.log("Hello, world!");`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`#!/usr/bin/env node
console.log("Hello, world!");
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`#!/usr/bin/env node
'use strict';

console.log("Hello, world!");
`);
    });

    // Same root cause as the previous test: rolldown wraps standalone entries
    // (no imports/exports) in __commonJSMin. Skip under rolldown.
    it.skipIf(isRolldown)("should preserve package.json bin added shebang", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `console.log("Hello, world!");`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            bin: "./dist/index.cjs",
            devDependencies: {
                typescript: "*",
            },
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`#!/usr/bin/env node
console.log("Hello, world!");
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`#!/usr/bin/env node
'use strict';

console.log("Hello, world!");
`);
    });

    it("should preserve directives like 'use client;'", async () => {
        // eslint-disable-next-line vitest/prefer-expect-assertions -- assertion count legitimately differs by bundler: rolldown skips the CJS-shape assertions below
        expect.assertions(isRolldown ? 6 : 7);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.tsx`,
            `"use client";

const Tr = () => (<tr className={"m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20"} />);

export default Tr;`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                react: "^18.2.0",
                "react-dom": "^18.2.0",
            },
            devDependencies: {
                "@types/react": "^18.0.0",
                "@types/react-dom": "^18.0.0",
                typescript: "^5",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                jsx: "react-jsx",
                moduleResolution: "bundler",
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            runtime: "browser",
        });

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "react");
        await installPackage(temporaryDirectoryPath, "react-dom");

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(normalizeBundleOutput(mjsContent)).toBe(`'use client';
import { jsx } from 'react/jsx-runtime';

const Tr = () => jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20" });

export { Tr as default };
`);

        // eslint-disable-next-line vitest/no-conditional-in-test -- deterministic bundler branch: rolldown emits a different CJS interop shape; the ESM/DTS assertions above already cover both bundlers
        if (!isRolldown) {
            // Rolldown emits a different CJS interop shape (no `'use strict';`,
            // `(0, X.jsx)(...)` indirect-call form). DTS + ESM still match.
            const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            // eslint-disable-next-line vitest/no-conditional-expect -- deterministic bundler branch (see above); rollup-only CJS-shape assertion
            expect(normalizeBundleOutput(cjsContent)).toBe(`'use client';
'use strict';

const jsxRuntime = require('react/jsx-runtime');

const Tr = () => jsxRuntime.jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20" });

module.exports = Tr;
`);
        }

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`declare const Tr: () => any;
export = Tr;
`);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const Tr: () => any;
export { Tr as default };
`);

        const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).toBe(`declare const Tr: () => any;
export = Tr;
`);
    });

    it("should merge duplicated directives", async () => {
        // eslint-disable-next-line vitest/prefer-expect-assertions -- assertion count legitimately differs by bundler: rolldown skips the CJS-shape assertions below
        expect.assertions(isRolldown ? 6 : 8);

        writeFileSync(
            `${temporaryDirectoryPath}/src/cli.ts`,
            `#!/usr/bin/env node
console.log("Hello, cli!");`,
        );
        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const foo = 'foo';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            bin: {
                packem: "./dist/cli.cjs",
            },
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(normalizeBundleOutput(mjsContent)).toBe(`const foo = "foo";

export { foo };
`);

        // eslint-disable-next-line vitest/no-conditional-in-test -- deterministic bundler branch: rolldown's CJS interop diverges; the ESM/DTS assertions already cover both bundlers
        if (!isRolldown) {
            // Rolldown's CJS interop diverges (no `'use strict';`, different
            // Symbol.toStringTag preamble). DTS + ESM still match.
            const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            // eslint-disable-next-line vitest/no-conditional-expect -- deterministic bundler branch (see above); rollup-only CJS-shape assertion
            expect(normalizeBundleOutput(cjsContent)).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const foo = "foo";

exports.foo = foo;
`);

            const cjsCliContent = readFileSync(`${temporaryDirectoryPath}/dist/cli.cjs`);

            // eslint-disable-next-line vitest/no-conditional-expect -- deterministic bundler branch (see above); rollup-only CJS-shape assertion
            expect(cjsCliContent).toBe(`#!/usr/bin/env node
'use strict';

console.log("Hello, cli!");
`);
        }

        const dtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dtsContent).toMatchSnapshot("d.ts content");

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toMatchSnapshot("d.cts content");

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toMatchSnapshot("d.mts content");
    });

    // Rolldown chunks differ from rollup: it emits `import { foo } from './X';`
    // + a combined `export { bar, baz, foo };` instead of rollup's per-export
    // re-export form (`export { foo } from './X';`). Chunk hashes also diverge.
    // This is a real bundler behavior difference, not a normalize-able artifact.
    it.skipIf(isRolldown)("should chunk directives in separated files", async () => {
        expect.assertions(8);

        writeFileSync(`${temporaryDirectoryPath}/src/bar.ts`, `'use client';export const bar = 'bar';`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/foo.ts`,
            `"use client";
'use sukka';

export const foo = 'foo';`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export { foo } from './foo';
export { bar } from './bar';
export const baz = 'baz';`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            packem: {
                rollup: {
                    output: {
                        preserveModules: false,
                    },
                },
            },
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`export { foo } from './packem_shared/foo-Dx82TkZf.mjs';
export { bar } from './packem_shared/bar-dfxpx6LX.mjs';

const baz = "baz";

export { baz };
`);

        const mjsChunk1Content = readFileSync(`${temporaryDirectoryPath}/dist/packem_shared/foo-Dx82TkZf.mjs`);

        expect(mjsChunk1Content).toBe(`'use client';
'use sukka';
const foo = "foo";

export { foo };
`);

        const mjsChunk2Content = readFileSync(`${temporaryDirectoryPath}/dist/packem_shared/bar-dfxpx6LX.mjs`);

        expect(mjsChunk2Content).toBe(`'use client';
const bar = "bar";

export { bar };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const foo = require('./packem_shared/foo-CPDxWGQe.cjs');
const bar = require('./packem_shared/bar-ChnaedqB.cjs');

const baz = "baz";

exports.foo = foo.foo;
exports.bar = bar.bar;
exports.baz = baz;
`);

        const cjsChunk1Content = readFileSync(`${temporaryDirectoryPath}/dist/packem_shared/foo-CPDxWGQe.cjs`);

        expect(cjsChunk1Content).toBe(`'use client';
'use sukka';
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const foo = "foo";

exports.foo = foo;
`);

        const cjsChunk2Content = readFileSync(`${temporaryDirectoryPath}/dist/packem_shared/bar-ChnaedqB.cjs`);

        expect(cjsChunk2Content).toBe(`'use client';
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const bar = "bar";

exports.bar = bar;
`);
    });

    // Regression guard against stale-cache directive output across incremental
    // rebuilds. The directive metadata is recorded by this plugin's `transform`
    // hook; when the build cache serves a `transform` cache hit (an unchanged
    // module on a warm rebuild), the real handler is skipped — so `renderChunk`
    // must recover the directives from the module's persisted `meta`, not from an
    // in-memory side-channel that the cache hit never repopulated.
    //
    // The trigger is multi-file: build A's directive, then (a later rebuild)
    // build B's directive. The second rebuild leaves A's module unchanged, so A's
    // `transform` is a cache hit — and a side-channel-only `renderChunk` would
    // resurrect A's pre-directive chunk, silently dropping its `"use client";`.
    // All builds reuse the same project dir (and therefore the same on-disk
    // cache); only the edited file changes between them.
    //
    // Skipped under rolldown for the same reason as "should chunk directives in
    // separated files": rolldown's chunk-splitting (and native directive
    // handling) diverge from rollup, so this rollup-plugin-level cache assertion
    // doesn't map onto rolldown's output shape. The fix lives in packem's
    // preserve-directives renderChunk hook, which is the rollup path.
    it.skipIf(isRolldown)("should keep directives on cache-hit chunks across incremental rebuilds", async () => {
        expect.assertions(5);

        const chunkDirectory = `${temporaryDirectoryPath}/dist/packem_shared`;

        // True when the (hash-named) chunk for `prefix` begins with `"use client";`.
        const chunkBounded = (prefix: string): boolean => {
            const file = readdirSync(chunkDirectory).find((name) => name.startsWith(prefix) && name.endsWith(".mjs"));

            return file === undefined ? false : readFileSync(`${chunkDirectory}/${file}`).startsWith("'use client';");
        };

        const withoutDirective = (name: string, body: string): string =>
            `import { shared } from "./shared.js";\n\nexport const ${name} = (): number => ${body};\n`;
        const withDirective = (name: string, body: string): string => `"use client";\n\n${withoutDirective(name, body)}`;

        writeFileSync(`${temporaryDirectoryPath}/src/shared.ts`, `export const shared = 1;\n`);
        writeFileSync(`${temporaryDirectoryPath}/src/alpha.ts`, withoutDirective("alpha", "shared"));
        writeFileSync(`${temporaryDirectoryPath}/src/beta.ts`, withoutDirective("beta", "shared + 1"));
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export { alpha } from "./alpha.js";\nexport { beta } from "./beta.js";\nexport { shared } from "./shared.js";\n`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "./dist/index.mjs",
            type: "module",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });
        await createPackemConfig(temporaryDirectoryPath, { runtime: "browser" });

        // Build 0: no directives — primes the cache for every module.
        const build0 = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        expect(build0.exitCode).toBe(0);

        // Build 1: add the directive to `alpha` only (warm cache).
        writeFileSync(`${temporaryDirectoryPath}/src/alpha.ts`, withDirective("alpha", "shared"));

        const build1 = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        expect(build1.exitCode).toBe(0);

        // Build 2: add the directive to `beta` (warm cache). `alpha` is unchanged
        // now, so its `transform` is a cache hit — the regression resurrected
        // `alpha`'s pre-directive chunk here.
        writeFileSync(`${temporaryDirectoryPath}/src/beta.ts`, withDirective("beta", "shared + 1"));

        const build2 = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        expect(build2.exitCode).toBe(0);

        // Both chunks must carry the directive after the final rebuild.
        expect(chunkBounded("alpha")).toBe(true);
        expect(chunkBounded("beta")).toBe(true);
    });
});
