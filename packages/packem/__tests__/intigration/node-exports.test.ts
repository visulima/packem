import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage, streamToString } from "../helpers";

describe("packem node exports", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    describe("cjs-interop", () => {
        it("should output 'default export' correctly and dont transform dts when cjsInterop", async () => {
            expect.assertions(7);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `const test = () => "this should be in final bundle";\nexport default test;`);

            await installPackage(temporaryDirectoryPath, "typescript");
            createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "^4.4.3",
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
                type: "commonjs",
                types: "./dist/index.d.ts",
            });
            await createPackemConfig(temporaryDirectoryPath, {});
            createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });

            const binProcess = await execPackemSync("build", ["--env NODE_ENV=development", "--cjsInterop"], {
                cwd: temporaryDirectoryPath,
            });

            await expect(streamToString(binProcess.stderr)).resolves.toBe("");
            expect(binProcess.exitCode).toBe(0);

            const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjsContent).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const test = /* @__PURE__ */ __name(() => "this should be in final bundle", "test");

export { test as default };
`);

            const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            expect(cjsContent).toBe(`'use strict';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const test = /* @__PURE__ */ __name(() => "this should be in final bundle", "test");

module.exports = test;
`);
            const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

            expect(dCtsContent).toBe(`declare const test: () => string;

export { test as default };

declare const defaultExport: {

} & typeof test;

export default defaultExport;
`);

            const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

            expect(dMtsContent).toBe(`declare const test: () => string;

export { test as default };
`);

            const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

            expect(dContent).toBe(`declare const test: () => string;

export { test as default };

declare const defaultExport: {

} & typeof test;

export default defaultExport;
`);
        });

        it("should output 'default export with named export' correctly when cjsInterop", async () => {
            expect.assertions(7);

            await installPackage(temporaryDirectoryPath, "typescript");
            writeFileSync(
                `${temporaryDirectoryPath}/src/index.ts`,
                `const test = () => {
    return "this should be in final bundle";
};

const test2 = "this should be in final bundle";

export { test2, test as default };`,
            );
            createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "^4.4.3",
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
                type: "commonjs",
                types: "./dist/index.d.ts",
            });
            await createPackemConfig(temporaryDirectoryPath, {});
            createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });

            const binProcess = await execPackemSync("build", ["--env NODE_ENV=development", "--cjsInterop"], {
                cwd: temporaryDirectoryPath,
            });

            await expect(streamToString(binProcess.stderr)).resolves.toBe("");
            expect(binProcess.exitCode).toBe(0);

            const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjsContent).toMatchSnapshot("mjs output");

            const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            expect(cjsContent).toMatchSnapshot("cjs output");

            const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

            expect(dCtsContent).toMatchSnapshot("cjs dts output");

            const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

            expect(dMtsContent).toMatchSnapshot("mjs dts output");

            const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

            expect(dContent).toMatchSnapshot("dts output");
        });

        it("should output 'default export with multi named export' correctly when cjsInterop", async () => {
            expect.assertions(7);

            await installPackage(temporaryDirectoryPath, "typescript");
            writeFileSync(
                `${temporaryDirectoryPath}/src/index.ts`,
                `const test = () => {
    return "this should be in final bundle";
};

const test2 = "this should be in final bundle";
const test3 = "this should be in final bundle";
const test4 = "this should be in final bundle";
const test5 = "this should be in final bundle";

export { test2, test3, test4, test5, test as default };`,
            );
            createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "^4.4.3",
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
                type: "commonjs",
                types: "./dist/index.d.ts",
            });
            await createPackemConfig(temporaryDirectoryPath, {});
            createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });

            const binProcess = await execPackemSync("build", ["--env NODE_ENV=development", "--cjsInterop"], {
                cwd: temporaryDirectoryPath,
            });

            await expect(streamToString(binProcess.stderr)).resolves.toBe("");
            expect(binProcess.exitCode).toBe(0);

            const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjsContent).toMatchSnapshot("mjs output");

            const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            expect(cjsContent).toMatchSnapshot("cjs output");

            const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

            expect(dCtsContent).toMatchSnapshot("cjs dts output");

            const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

            expect(dMtsContent).toMatchSnapshot("mjs dts output");

            const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

            expect(dContent).toMatchSnapshot("dts output");
        });
    });

    it("should output 'default export' correctly", async () => {
        expect.assertions(7);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `const test = "this should be in final bundle";\nexport default test;`);

        await installPackage(temporaryDirectoryPath, "typescript");
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "^4.4.3",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {});
        createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`const test = "this should be in final bundle";

export { test as default };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

const test = "this should be in final bundle";

module.exports = test;
`);

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`declare const test = "this should be in final bundle";

export { test as default };
`);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const test = "this should be in final bundle";

export { test as default };
`);

        const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).toBe(`declare const test = "this should be in final bundle";

export { test as default };
`);
    });

    it("should output 'default export' for nested folder correctly", async () => {
        expect.assertions(7);

        await installPackage(temporaryDirectoryPath, "typescript");
        writeFileSync(`${temporaryDirectoryPath}/src/test/index.ts`, `const test = "this should be in final bundle";\nexport default test;`);
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "^4.4.3",
            },
            main: "./dist/test/index.cjs",
            module: "./dist/test/index.mjs",
            type: "commonjs",
            types: "./dist/test/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {});
        createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/test/index.mjs`);

        expect(mjsContent).toBe(`const test = "this should be in final bundle";

export { test as default };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/test/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

const test = "this should be in final bundle";

module.exports = test;
`);
        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/test/index.d.cts`);

        expect(dCtsContent).toBe(`declare const test = "this should be in final bundle";

export { test as default };
`);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/test/index.d.mts`);

        expect(dMtsContent).toBe(`declare const test = "this should be in final bundle";

export { test as default };
`);

        const dContent = readFileSync(`${temporaryDirectoryPath}/dist/test/index.d.ts`);

        expect(dContent).toBe(`declare const test = "this should be in final bundle";

export { test as default };
`);
    });

    it.todo("should handle externals", async () => {
        expect.assertions(7);

        await installPackage(temporaryDirectoryPath, "typescript");
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import a from 'peer-dep'
import b from 'peer-dep-meta'

export default a + b
`,
        );
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "^4.4.3",
            },
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                    types: "./dist/index.d.ts",
                },
            },
            peerDependencies: {
                "peer-dep": "*",
            },
            peerDependenciesMeta: {
                "peer-dep-meta": {
                    optional: true,
                },
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {});
        createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs output");

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toMatchSnapshot("cjs dts output");

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toMatchSnapshot("mjs dts output");

        const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).toMatchSnapshot("dts output");
    });

    it("should bundle 'devDependencies' that are used inside the code and are not marked as external", async () => {
        expect.assertions(7);

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "detect-indent");
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import detectIndentFn from "detect-indent";

const { indent: dIndent } = detectIndentFn("  file");

export const indent = dIndent;
`,
        );
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "detect-indent": "^7.0.1",
                typescript: "^4.4.3",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {});
        createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                moduleResolution: "bundler",
            }
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs output");

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toMatchSnapshot("cjs dts output");

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toMatchSnapshot("mjs dts output");

        const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).toMatchSnapshot("dts output");
    });

    it("should split shared module into one chunk layer", async () => {
        expect.assertions(3);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.js`,
            `import { dep } from '#dep'

export const value = dep
`,
        );
        writeFileSync(`${temporaryDirectoryPath}/src/lib/polyfill.js`, `export const dep = 'polyfill-dep'`);
        createPackageJson(temporaryDirectoryPath, {
            exports: "./dist/index.js",
            imports: {
                "#dep": "./src/lib/polyfill.cjs",
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(cjsContent).toBe(`'use strict';

const dep = "polyfill-dep";

const value = dep;

exports.value = value;
`);
    });

    it("should output 'class' with 'extends correctly", async () => {
        expect.assertions(7);

        await installPackage(temporaryDirectoryPath, "typescript");
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `class Parent {
  constructor() {}
}

class Feature {
  constructor() {}
}

export class Child extends Parent {
  feature = new Feature();

  constructor() {
    console.log("before");

    super();

    console.log("after");
  }
}`,
        );
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "^4.4.3",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {});
        createTsConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs output");

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toMatchSnapshot("cjs dts output");

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toMatchSnapshot("mjs dts output");

        const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).toMatchSnapshot("dts output");
    });

    it("should output 'class' with 'extends correctly when minify is used", async () => {
        expect.assertions(8);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `class Parent {
  constructor() {}
}

class Feature {
  constructor() {}
}

export class Child extends Parent {
  feature = new Feature();

  constructor() {
    console.log("before");

    super();

    console.log("after");
  }
}`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "^4.4.3",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {});
        createTsConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackemSync("build", ["--env NODE_ENV=production", "--minify"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("Minification is enabled, the output will be minified");

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs output");

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toMatchSnapshot("cjs dts output");

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toMatchSnapshot("mjs dts output");

        const dContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).toMatchSnapshot("dts output");
    });
});
