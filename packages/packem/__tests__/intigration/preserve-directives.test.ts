import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage, streamToString } from "../helpers";

describe("packem preserve-directives", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        createPackemConfig(temporaryDirectoryPath, {});
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
        createPackageJson(temporaryDirectoryPath, {
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
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
        createPackageJson(temporaryDirectoryPath, {
            bin: "./dist/index.cjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
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
        createPackageJson(temporaryDirectoryPath, {
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
        createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                jsx: "react-jsx",
                moduleResolution: "bundler",
            },
        });

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "react");
        await installPackage(temporaryDirectoryPath, "react-dom");

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
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
        expect.assertions(6);

        writeFileSync(
            `${temporaryDirectoryPath}/src/cli.ts`,
            `#!/usr/bin/env node
console.log("Hello, cli!");`,
        );
        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const foo = 'foo';`);
        createPackageJson(temporaryDirectoryPath, {
            bin: {
                packem: "./dist/cli.cjs",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`const foo = "foo";

export { foo };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

const foo = "foo";

exports.foo = foo;
`);

        const cjsCliContent = readFileSync(`${temporaryDirectoryPath}/dist/cli.cjs`);

        expect(cjsCliContent).toBe(`#!/usr/bin/env node
'use strict';

console.log("Hello, cli!");
`);
        const dtsContent = readFileSync(`${temporaryDirectoryPath}/dist/cli.d.ts`);

        expect(dtsContent).toBe(`\n`);
    });

    it("should merge duplicated directives from many files", async () => {
        expect.assertions(4);

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
        createPackageJson(temporaryDirectoryPath, {
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
        createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`'use client';
'use sukka';
const foo = "foo";

const bar = "bar";

const baz = "baz";

export { bar, baz, foo };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use client';
'use sukka';
'use strict';

const foo = "foo";

const bar = "bar";

const baz = "baz";

exports.bar = bar;
exports.baz = baz;
exports.foo = foo;
`);
    });
});
