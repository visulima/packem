import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage, streamToString } from "../helpers";

describe("packem jsx", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should correctly export react tsx to js", async () => {
        expect.assertions(7);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.tsx`,
            `const Tr = () => (<tr className={"m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20"} />);

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
        createPackemConfig(temporaryDirectoryPath, {});

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "react");
        await installPackage(temporaryDirectoryPath, "react-dom");

        const binProcess = await execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`import { jsx } from 'react/jsx-runtime';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const Tr = /* @__PURE__ */ __name(() => jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20" }), "Tr");

export { Tr as default };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

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

    it("should not delete a attribute if the jsxRemoveAttributes config is empty", async () => {
        expect.assertions(7);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.tsx`,
            `const Tr = () => (<tr className={"m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20"} data-testid="test" />);

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
        createPackemConfig(temporaryDirectoryPath, {});

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "react");
        await installPackage(temporaryDirectoryPath, "react-dom");

        const binProcess = await execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`import { jsx } from 'react/jsx-runtime';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const Tr = /* @__PURE__ */ __name(() => jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20", "data-testid": "test" }), "Tr");

export { Tr as default };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

const jsxRuntime = require('react/jsx-runtime');

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const Tr = /* @__PURE__ */ __name(() => jsxRuntime.jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20", "data-testid": "test" }), "Tr");

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

    it("should delete a attribute if the jsxRemoveAttributes is configured", async () => {
        expect.assertions(7);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.tsx`,
            `const Tr = () => (<tr className={"m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20"} data-testid="test" />);

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
        createPackemConfig(temporaryDirectoryPath, {
            rollup: {
                jsxRemoveAttributes: {
                    attributes: ["data-testid"],
                },
            },
        });

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "react");
        await installPackage(temporaryDirectoryPath, "react-dom");

        const binProcess = await execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`import { jsx } from 'react/jsx-runtime';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const Tr = /* @__PURE__ */ __name(() => jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20" }), "Tr");

export { Tr as default };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

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

    it("should delete a attributes if the jsxRemoveAttributes is configured", async () => {
        expect.assertions(7);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.tsx`,
            `const Tr = () => (<tr className={"m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20"} data-testid="test" data-test="test" />);

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
        createPackemConfig(temporaryDirectoryPath, {
            rollup: {
                jsxRemoveAttributes: {
                    attributes: ["data-testid", "data-test"],
                },
            },
        });

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "react");
        await installPackage(temporaryDirectoryPath, "react-dom");

        const binProcess = await execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`import { jsx } from 'react/jsx-runtime';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const Tr = /* @__PURE__ */ __name(() => jsx("tr", { className: "m-0 border-t border-gray-300 p-0 dark:border-gray-600 even:bg-gray-100 even:dark:bg-gray-600/20" }), "Tr");

export { Tr as default };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

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

    // Lets see how this can be supported
    it.skip("should support custom jsx", async () => {
        expect.assertions(7);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.tsx`,
            `import * as Vue from 'vue'

export const Spinner = Vue.defineComponent(() => () => {
  return <div>loading</div>
})`,
        );
        createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                vue: "^3.4.25",
            },
            devDependencies: {
                typescript: "^5",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                // Customized JSX for Vue
                jsx: "preserve",
                jsxFactory: "Vue.h",
                jsxImportSource: "vue",
                module: "ESNext",
                moduleResolution: "Bundler",
            },
        });
        createPackemConfig(temporaryDirectoryPath, {});

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "vue");

        const binProcess = await execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(``);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(``);
        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(``);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(``);

        const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).toBe(``);
    });
});
