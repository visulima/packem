import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

describe("packem preserve-directives", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should preserve user added shebang", async () => {
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
        await createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
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

    it("should preserve package.json bin added shebang", async () => {
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
        await createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
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
        expect.assertions(7);

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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`'use client';
import { jsx } from 'react/jsx-runtime';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const Tr = /* @__PURE__ */ __name(() => jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20" }), "Tr");

export { Tr as default };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use client';
'use strict';

const jsxRuntime = require('react/jsx-runtime');

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const Tr = /* @__PURE__ */ __name(() => jsxRuntime.jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20" }), "Tr");

module.exports = Tr;
`);
        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`declare const Tr: () => any;

export { Tr as default };
`);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const Tr: () => any;

export { Tr as default };
`);

        const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).toBe(`declare const Tr: () => any;

export { Tr as default };
`);
    });

    it("should merge duplicated directives", async () => {
        expect.assertions(5);

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
        await createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`const foo = "foo";

export { foo };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const foo = "foo";

exports.foo = foo;
`);

        const cjsCliContent = readFileSync(`${temporaryDirectoryPath}/dist/cli.cjs`);

        expect(cjsCliContent).toBe(`#!/usr/bin/env node
'use strict';

console.log("Hello, cli!");
`);
    });

    it("should chunk directives in separated files", async () => {
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
        await createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
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
});
