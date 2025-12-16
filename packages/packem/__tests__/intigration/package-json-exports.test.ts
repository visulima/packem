import { cpSync, existsSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { isAccessibleSync, readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertContainFiles, createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

const splitedNodeJsVersion = process.versions.node.split(".");

const NODE_JS_VERSION = `${splitedNodeJsVersion[0]}.${splitedNodeJsVersion[1]}`;

describe("packem package.json exports", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should generate proper assets with js based on the package.json exports default", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.js`,
            `import myMod from 'my-mod'

export default 'exports-sugar-default'

export function method() {
  return myMod.test()
}
`,
        );

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                "my-mod": "*",
            },
            exports: {
                default: "./dist/index.mjs",
                node: "./dist/index.cjs",
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs output");

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");
    });

    it("should generate proper assets with js based on the package.json exports", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export default 'exports-sugar'`);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                "my-mod": "*",
            },
            exports: {
                import: "./dist/index.mjs",
                module: "./dist/index.mjs",
                require: "./dist/index.cjs",
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        for (const file of ["index.cjs", "index.mjs"]) {
            expect(existsSync(`${temporaryDirectoryPath}/dist/${file}`)).toBe(true);
        }
    });

    it("should work with dev and prod optimize conditions", async () => {
        expect.assertions(8);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value = process.env.NODE_ENV;`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    default: "./dist/index.cjs",
                    import: {
                        default: "./dist/index.mjs",
                        development: "./dist/index.development.mjs",
                        production: "./dist/index.production.mjs",
                    },
                    require: {
                        default: "./dist/index.cjs",
                        development: "./dist/index.development.cjs",
                        production: "./dist/index.production.cjs",
                    },
                },
            },
        });

        const binProcess = await execPackem("build", ["--no-environment"], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        for (const [file, regex] of [
            ["index.development.cjs", /= "development"/],
            ["index.development.mjs", /= "development"/],
            ["index.production.cjs", /="production"/],
            ["index.production.mjs", /="production"/],
            // In vitest the NODE_ENV is set to test
            ["index.cjs", /process.env.NODE_ENV/],
            ["index.mjs", /process.env.NODE_ENV/],
        ]) {
            const content = readFileSync(`${temporaryDirectoryPath}/dist/${file as string}`);

            expect(content).toMatch(regex as RegExp);
        }
    });

    it("should work with dev and prod optimize conditions in nested-convention", async () => {
        expect.assertions(14);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value = 'index';`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.production.ts`, `export const value = process.env.NODE_ENV;`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.development.ts`, `export const value = process.env.NODE_ENV;`);
        writeFileSync(`${temporaryDirectoryPath}/src/core.ts`, `export const value = 'core';`);
        writeFileSync(`${temporaryDirectoryPath}/src/core.production.ts`, `export const value = 'core' + process.env.NODE_ENV;`);
        writeFileSync(`${temporaryDirectoryPath}/src/core.development.ts`, `export const value = 'core' + process.env.NODE_ENV;`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: {
                        default: "./dist/index.mjs",
                        development: "./dist/index.development.mjs",
                        production: "./dist/index.production.mjs",
                    },
                    require: {
                        default: "./dist/index.cjs",
                        development: "./dist/index.development.cjs",
                        production: "./dist/index.production.cjs",
                    },
                },
                "./core": {
                    import: {
                        default: "./dist/core.mjs",
                        development: "./dist/core.development.mjs",
                        production: "./dist/core.production.mjs",
                    },
                    require: {
                        default: "./dist/core.cjs",
                        development: "./dist/core.development.cjs",
                        production: "./dist/core.production.cjs",
                    },
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        for (const [file, regex] of [
            ["index.development.cjs", /= "development"/],
            ["index.development.mjs", /= "development"/],
            ["index.production.cjs", /="production"/],
            ["index.production.mjs", /="production"/],
            ["index.cjs", /= "index"/],
            ["index.mjs", /= "index"/],

            // core export
            ["core.development.cjs", /= "coredevelopment"/],
            ["core.development.mjs", /= "coredevelopment"/],
            ["core.production.cjs", /="coreproduction"/],
            ["core.production.mjs", /="coreproduction"/],
            ["core.cjs", /= "core"/],
            ["core.mjs", /= "core"/],
        ]) {
            const content = readFileSync(`${temporaryDirectoryPath}/dist/${file as string}`);

            expect(content).toMatch(regex as RegExp);
        }
    });

    it("should generate proper assets for rsc condition with ts", async () => {
        expect.assertions(8);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export default 'index';
export const shared = true;

export type IString = string;`,
        );
        writeFileSync(`${temporaryDirectoryPath}/src/index.react-native.ts`, `export default 'react-native';`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.react-server.ts`, `export default 'react-server';`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/api/index.ts`,
            `import index, { type IString } from '../index';

export default 'api:' + index;
export { IString };`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath, {
            runtime: "browser",
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    "react-native": "./dist/index.react-native.cjs",
                    "react-server": "./dist/index.react-server.cjs",
                    require: "./dist/index.cjs",
                    types: "./dist/index.d.ts",
                },
                "./api": {
                    import: "./dist/api/index.mjs",
                    require: "./dist/api/index.cjs",
                },
            },
        });

        const binProcess = await execPackem("build", ["--no-environment"], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        for (const [file, regex] of [
            ["./index.mjs", /const shared = true/],
            ["./index.react-server.cjs", /"react-server"/],
            ["./index.react-native.cjs", /"react-native"/],
            ["./index.d.ts", /export const shared = true;/],
            ["./api/index.cjs", /"api:"/],
            ["./api/index.mjs", /"api:"/],
        ]) {
            const filePath = (file as string).startsWith("./") ? (file as string).slice(2) : (file as string);
            const content = readFileSync(`${temporaryDirectoryPath}/dist/${filePath}`);

            expect(content).toMatch(regex as RegExp);
        }
    });

    it("should work with nested path in exports", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/foo/bar.js`, `export const value = 'foo.bar';`);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                "./foo/bar": "./dist/foo/bar.js",
            },
            type: "module",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const content = readFileSync(`${temporaryDirectoryPath}/dist/foo/bar.js`);

        expect(content).toMatch(`const value = "foo.bar";

export { value };
`);
    });

    it("should work with ESM package with CJS main field", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const value = 'cjs';`);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
            },
            main: "./dist/index.cjs",
            type: "module",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs output");

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");
    });

    it("should deduplicate entries", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value = 'cjs';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                import: {
                    default: "./dist/index.mjs",
                    types: "./dist/index.d.mts",
                },
                require: {
                    default: "./dist/index.cjs",
                    types: "./dist/index.d.cts",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const files = readdirSync(join(temporaryDirectoryPath, "dist"));

        expect(files).toHaveLength(5);
    });

    it("should export dual package for type module", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                import: "./dist/index.mjs",
                require: "./dist/index.cjs",
            },
            main: "./dist/index.mjs",
            type: "module",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjs).toBe(`'use strict';

const index = () => "index";

module.exports = index;
`);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjs).toBe(`const index = () => "index";

export { index as default };
`);
    });

    it("should allow to have folder name the same like file for export", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/config/index.ts`, `export default () => 'index';`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);
        writeFileSync(`${temporaryDirectoryPath}/src/config.ts`, `export default () => 'config';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: {
                        default: "./dist/index.mjs",
                        types: "./dist/index.d.mts",
                    },
                    require: {
                        default: "./dist/index.cjs",
                        types: "./dist/index.d.cts",
                    },
                },
                "./config": {
                    import: {
                        default: "./dist/config.mjs",
                        types: "./dist/config.d.mts",
                    },
                    require: {
                        default: "./dist/config.cjs",
                        types: "./dist/config.d.cts",
                    },
                },
            },
            type: "module",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/config.cjs`);

        expect(cjs).toBe(`'use strict';

const config = () => "config";

module.exports = config;
`);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/config.mjs`);

        expect(mjs).toBe(`const config = () => "config";

export { config as default };
`);
    });

    it("should export dual package for type commonjs", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                import: "./dist/index.mjs",
                require: "./dist/index.cjs",
            },
            main: "./dist/index.cjs",
            type: "commonjs",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjs).toBe(`'use strict';

const index = () => "index";

module.exports = index;
`);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjs).toBe(`const index = () => "index";

export { index as default };
`);
    });

    it("should generate output with all cjs exports", async () => {
        expect.assertions(15);

        writeFileSync(`${temporaryDirectoryPath}/src/bin/cli.js`, `export const cli = 'cli';`);
        writeFileSync(`${temporaryDirectoryPath}/src/foo.js`, `export const foo = 'foo'`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const index = 'index'`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.react-server.js`, `export const index = 'index.react-server'`);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            bin: {
                cli: "./dist/bin/cli.js",
            },
            exports: {
                ".": {
                    import: "./dist/index.js",
                    "react-server": "./dist/index.react-server.js",
                },
                "./foo": "./dist/foo.js",
            },
            name: "@scope/output-app",
            type: "commonjs",
        });

        const binProcess = await execPackem("build", ["--no-color"], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");

        expect(binProcess.stdout).toContain("Build succeeded for output-app");
        expect(binProcess.stdout).toContain("dist/index.react-server.js (total size: 149.00 Bytes, brotli size: 110.00 Bytes, gzip size: 142.00 Bytes)");
        expect(binProcess.stdout).toContain("exports: index");
        expect(binProcess.stdout).toContain("dist/foo.js (total size: 128.00 Bytes, brotli size: 108.00 Bytes, gzip size: 132.00 Bytes)");
        expect(binProcess.stdout).toContain("exports: foo");
        expect(binProcess.stdout).toContain("dist/bin/cli.js (total size: 148.00 Bytes, brotli size: 112.00 Bytes, gzip size: 146.00 Bytes)");
        expect(binProcess.stdout).toContain("exports: cli");
        expect(binProcess.stdout).toContain("dist/index.js (total size: 42.00 Bytes, brotli size: 46.00 Bytes, gzip size: 53.00 Bytes)");
        expect(binProcess.stdout).toContain("exports: index");
        expect(binProcess.stdout).toContain("Σ Total dist size (byte size):");

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(cjsContent).toMatchSnapshot("cjs output");

        const cjsReactContent = readFileSync(`${temporaryDirectoryPath}/dist/index.react-server.js`);

        expect(cjsReactContent).toMatchSnapshot("cjs output");

        const cjsFooContent = readFileSync(`${temporaryDirectoryPath}/dist/foo.js`);

        expect(cjsFooContent).toMatchSnapshot("cjs output");

        const cjsCliContent = readFileSync(`${temporaryDirectoryPath}/dist/bin/cli.js`);

        expect(cjsCliContent).toMatchSnapshot("cjs output");
    });

    it("should support wildcard subpath exports", async () => {
        expect.assertions(7);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/pages/a.ts`,
            `export function render() {
    console.log('Page A');
}`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/pages/b.ts`,
            `export function render() {
    console.log('Page B');
}`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": "./dist/index.cjs",
                "./pages/*": {
                    import: "./dist/pages/*.mjs",
                    require: "./dist/pages/*.cjs",
                    types: "./dist/pages/*.d.ts",
                },
            },
            types: "./dist/index.d.ts",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjs).toBe(`'use strict';

const index = () => "index";

module.exports = index;
`);

        const cjsPageA = readFileSync(`${temporaryDirectoryPath}/dist/pages/a.cjs`);

        expect(cjsPageA).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function render() {
  console.log("Page A");
}

exports.render = render;
`);

        const mjsPageA = readFileSync(`${temporaryDirectoryPath}/dist/pages/a.mjs`);

        expect(mjsPageA).toBe(`function render() {
function render() {
  console.log("Page A");
}

export { render };
`);

        const cjsPageB = readFileSync(`${temporaryDirectoryPath}/dist/pages/b.cjs`);

        expect(cjsPageB).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function render() {
  console.log("Page B");
}

exports.render = render;
`);

        const mjsPageB = readFileSync(`${temporaryDirectoryPath}/dist/pages/b.mjs`);

        expect(mjsPageB).toBe(`function render() {
function render() {
  console.log("Page B");
}

export { render };
`);
    });

    describe("advanced wildcard exports", () => {
        describe("multiple wildcards", () => {
            it("all wildcards must match same value", async () => {
                expect.assertions(5);

                writeFileSync(`${temporaryDirectoryPath}/src/foo/foo.ts`, "export const foo = \"foo\"");
                writeFileSync(`${temporaryDirectoryPath}/src/bar/bar.ts`, "export const bar = \"bar\"");
                writeFileSync(`${temporaryDirectoryPath}/src/a/b.ts`, "export const baz = \"baz\"");

                await installPackage(temporaryDirectoryPath, "typescript");
                await createTsConfig(temporaryDirectoryPath);
                await createPackemConfig(temporaryDirectoryPath);
                await createPackageJson(temporaryDirectoryPath, {
                    devDependencies: {
                        typescript: "*",
                    },
                    exports: {
                        "./*": "./dist/*/*.mjs",
                    },
                });

                const binProcess = await execPackem("build", [], {
                    cwd: temporaryDirectoryPath,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);
                expect(existsSync(`${temporaryDirectoryPath}/dist/foo/foo.mjs`)).toBe(true);
                expect(existsSync(`${temporaryDirectoryPath}/dist/bar/bar.mjs`)).toBe(true);
                // Should not match because 'a' !== 'b'
                expect(existsSync(`${temporaryDirectoryPath}/dist/a/b.mjs`)).toBe(false);
            });

            it("with interleaved constants", async () => {
                expect.assertions(5);

                writeFileSync(`${temporaryDirectoryPath}/src/foo/_/foo/_/foo.ts`, "export const foo = \"foo\"");
                writeFileSync(`${temporaryDirectoryPath}/src/bar/_/bar/_/bar.ts`, "export const bar = \"bar\"");
                writeFileSync(`${temporaryDirectoryPath}/src/a/_/b/_/c.ts`, "export const baz = \"baz\"");

                await installPackage(temporaryDirectoryPath, "typescript");
                await createTsConfig(temporaryDirectoryPath);
                await createPackemConfig(temporaryDirectoryPath);
                await createPackageJson(temporaryDirectoryPath, {
                    devDependencies: {
                        typescript: "*",
                    },
                    exports: {
                        "./*": "./dist/*/_/*/_/*.mjs",
                    },
                });

                const binProcess = await execPackem("build", [], {
                    cwd: temporaryDirectoryPath,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);
                expect(existsSync(`${temporaryDirectoryPath}/dist/foo/_/foo/_/foo.mjs`)).toBe(true);
                expect(existsSync(`${temporaryDirectoryPath}/dist/bar/_/bar/_/bar.mjs`)).toBe(true);
                // Should not match because 'a' !== 'b' !== 'c'
                expect(existsSync(`${temporaryDirectoryPath}/dist/a/_/b/_/c.mjs`)).toBe(false);
            });

            it("capture multi-segment paths", async () => {
                expect.assertions(3);

                writeFileSync(`${temporaryDirectoryPath}/src/a/b/a/b/index.ts`, "export const foo = \"foo\"");

                await installPackage(temporaryDirectoryPath, "typescript");
                await createTsConfig(temporaryDirectoryPath);
                await createPackemConfig(temporaryDirectoryPath);
                await createPackageJson(temporaryDirectoryPath, {
                    devDependencies: {
                        typescript: "*",
                    },
                    exports: {
                        "./*": "./dist/*/*/index.js",
                    },
                });

                const binProcess = await execPackem("build", [], {
                    cwd: temporaryDirectoryPath,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);
                expect(existsSync(`${temporaryDirectoryPath}/dist/a/b/a/b/index.js`)).toBe(true);
            });
        });

        describe("wildcard with suffix", () => {
            it("basic wildcard with suffix", async () => {
                expect.assertions(4);

                writeFileSync(`${temporaryDirectoryPath}/src/features/auth/handler.ts`, "export const auth = \"auth\"");
                writeFileSync(`${temporaryDirectoryPath}/src/features/nested/billing/handler.ts`, "export const billing = \"billing\"");

                await installPackage(temporaryDirectoryPath, "typescript");
                await createTsConfig(temporaryDirectoryPath);
                await createPackemConfig(temporaryDirectoryPath);
                await createPackageJson(temporaryDirectoryPath, {
                    devDependencies: {
                        typescript: "*",
                    },
                    exports: {
                        "./features/*/handler": "./dist/features/*/handler.mjs",
                    },
                });

                const binProcess = await execPackem("build", [], {
                    cwd: temporaryDirectoryPath,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);
                expect(existsSync(`${temporaryDirectoryPath}/dist/features/auth/handler.mjs`)).toBe(true);
                expect(existsSync(`${temporaryDirectoryPath}/dist/features/nested/billing/handler.mjs`)).toBe(true);
            });
        });

        describe("formats & conditions", () => {
            it("declaration file extensions (.d.ts, .d.mts, .d.cts)", async () => {
                expect.assertions(4);

                writeFileSync(`${temporaryDirectoryPath}/src/types/models.ts`, "export type Model = { id: string }");

                await installPackage(temporaryDirectoryPath, "typescript");
                await createTsConfig(temporaryDirectoryPath);

                await createPackemConfig(temporaryDirectoryPath);
                await createPackageJson(temporaryDirectoryPath, {
                    devDependencies: {
                        typescript: "*",
                    },
                    exports: {
                        "./types/*": {
                            types: {
                                default: "./dist/types/*.d.ts",
                                import: "./dist/types/*.d.mts",
                                require: "./dist/types/*.d.cts",
                            },
                        },
                    },
                });

                const binProcess = await execPackem("build", [], {
                    cwd: temporaryDirectoryPath,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);
                expect(existsSync(`${temporaryDirectoryPath}/dist/types/models.d.ts`)).toBe(true);
                expect(existsSync(`${temporaryDirectoryPath}/dist/types/models.d.mts`)).toBe(true);
                expect(existsSync(`${temporaryDirectoryPath}/dist/types/models.d.cts`)).toBe(true);
            });

            it("export conditions (node, browser, default)", async () => {
                expect.assertions(5);

                writeFileSync(`${temporaryDirectoryPath}/src/node/fetch.ts`, "export const fetch = () => \"node-fetch\"");
                writeFileSync(`${temporaryDirectoryPath}/src/browser/fetch.ts`, "export const fetch = () => \"browser-fetch\"");
                writeFileSync(`${temporaryDirectoryPath}/src/default/fetch.ts`, "export const fetch = () => \"default-fetch\"");

                await installPackage(temporaryDirectoryPath, "typescript");
                await createTsConfig(temporaryDirectoryPath);
                await createPackemConfig(temporaryDirectoryPath);
                await createPackageJson(temporaryDirectoryPath, {
                    devDependencies: {
                        typescript: "*",
                    },
                    exports: {
                        "./adapters/*": {
                            browser: "./dist/browser/*.mjs",
                            default: "./dist/default/*.mjs",
                            node: "./dist/node/*.mjs",
                        },
                    },
                });

                const binProcess = await execPackem("build", [], {
                    cwd: temporaryDirectoryPath,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);
                expect(existsSync(`${temporaryDirectoryPath}/dist/node/fetch.mjs`)).toBe(true);
                expect(existsSync(`${temporaryDirectoryPath}/dist/browser/fetch.mjs`)).toBe(true);
                expect(existsSync(`${temporaryDirectoryPath}/dist/default/fetch.mjs`)).toBe(true);
            });

            it("array of paths", async () => {
                expect.assertions(4);

                writeFileSync(`${temporaryDirectoryPath}/src/tools/logger.ts`, "export const logger = () => \"log\"");

                await installPackage(temporaryDirectoryPath, "typescript");
                await createTsConfig(temporaryDirectoryPath);
                await createPackemConfig(temporaryDirectoryPath);
                await createPackageJson(temporaryDirectoryPath, {
                    devDependencies: {
                        typescript: "*",
                    },
                    exports: {
                        "./tools/*": ["./dist/tools/*.mjs", "./dist/tools/*.cjs"],
                    },
                });

                const binProcess = await execPackem("build", [], {
                    cwd: temporaryDirectoryPath,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);
                expect(existsSync(`${temporaryDirectoryPath}/dist/tools/logger.mjs`)).toBe(true);
                expect(existsSync(`${temporaryDirectoryPath}/dist/tools/logger.cjs`)).toBe(true);
            });
        });

        describe("edge cases", () => {
            it("no matching files (optional patterns)", async () => {
                expect.assertions(4);

                writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "export const main = \"main\"");

                await installPackage(temporaryDirectoryPath, "typescript");
                await createTsConfig(temporaryDirectoryPath);
                await createPackemConfig(temporaryDirectoryPath);
                await createPackageJson(temporaryDirectoryPath, {
                    devDependencies: {
                        typescript: "*",
                    },
                    exports: {
                        ".": "./dist/index.mjs",
                        "./optional/*": "./dist/optional/*.mjs",
                    },
                });

                const binProcess = await execPackem("build", [], {
                    cwd: temporaryDirectoryPath,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);
                expect(existsSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBe(true);
                expect(existsSync(`${temporaryDirectoryPath}/dist/optional`)).toBe(false);
            });

            it("empty capture is rejected", async () => {
                expect.assertions(4);

                writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "export const index = \"index\"");

                await installPackage(temporaryDirectoryPath, "typescript");
                await createTsConfig(temporaryDirectoryPath);
                await createPackemConfig(temporaryDirectoryPath);
                await createPackageJson(temporaryDirectoryPath, {
                    devDependencies: {
                        typescript: "*",
                    },
                    exports: {
                        ".": "./dist/index.mjs",
                        "./lib/*": "./dist/lib/*.mjs",
                    },
                });

                const binProcess = await execPackem("build", [], {
                    cwd: temporaryDirectoryPath,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);
                expect(existsSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBe(true);
                expect(existsSync(`${temporaryDirectoryPath}/dist/lib/.mjs`)).toBe(false);
            });

            it("wildcard without extension emits warning", async () => {
                expect.assertions(4);

                writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "export const index = \"index\"");
                writeFileSync(`${temporaryDirectoryPath}/src/foo.ts`, "export const foo = \"foo\"");

                await installPackage(temporaryDirectoryPath, "typescript");
                await createTsConfig(temporaryDirectoryPath);
                await createPackemConfig(temporaryDirectoryPath);
                await createPackageJson(temporaryDirectoryPath, {
                    devDependencies: {
                        typescript: "*",
                    },
                    exports: {
                        ".": "./dist/index.mjs",
                        "./*": "./dist/*",
                    },
                });

                const binProcess = await execPackem("build", [], {
                    cwd: temporaryDirectoryPath,
                });

                expect(binProcess.exitCode).toBe(0);
                expect(binProcess.stderr).toContain("Wildcard pattern must include a file extension");
                expect(binProcess.stderr).toContain("package.json#exports[\"./*\"]");
                expect(existsSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBe(true);
            });

            it("mixed static and wildcard exports", async () => {
                expect.assertions(5);

                writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "export const main = \"main\"");
                writeFileSync(`${temporaryDirectoryPath}/src/utils/helper.ts`, "export const helper = \"helper\"");
                writeFileSync(`${temporaryDirectoryPath}/src/constants.ts`, "export const CONSTANT = \"constant\"");

                await installPackage(temporaryDirectoryPath, "typescript");
                await createTsConfig(temporaryDirectoryPath);
                await createPackemConfig(temporaryDirectoryPath);
                await createPackageJson(temporaryDirectoryPath, {
                    devDependencies: {
                        typescript: "*",
                    },
                    exports: {
                        ".": "./dist/index.mjs",
                        "./constants": "./dist/constants.mjs",
                        "./utils/*": "./dist/utils/*.mjs",
                    },
                });

                const binProcess = await execPackem("build", [], {
                    cwd: temporaryDirectoryPath,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);
                expect(existsSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBe(true);
                expect(existsSync(`${temporaryDirectoryPath}/dist/utils/helper.mjs`)).toBe(true);
                expect(existsSync(`${temporaryDirectoryPath}/dist/constants.mjs`)).toBe(true);
            });
        });
    });

    it("should throw a error if exports is mjs file without type module in package.json", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: "./dist/index.mjs",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain(`Exported file "./dist/index.mjs" has an extension that does not match the package.json type "commonjs"`);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if exports is cjs file with type module in package.json", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: "./dist/index.cjs",
            type: "module",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain(`Exported file "./dist/index.cjs" has an extension that does not match the package.json type "module"`);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should work with single entry", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: "./dist/index.js",
            types: "./dist/index.d.ts",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(cjs).toBe(`'use strict';

const index = () => "index";

module.exports = index;
`);
    });

    it("should work with multi entries", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/server/index.edge-light.ts`, `export const name = "server.edge-light";`);
        writeFileSync(`${temporaryDirectoryPath}/src/server/index.react-server.ts`, `export const name = "server.react-server";`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/server/index.ts`,
            `import { type Client } from "../client";
import { type Shared } from "../shared";

export const name = "server.index";
export const main = true;

export { Client, Shared };
`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/client.ts`,
            `import { type Shared } from "./shared";

export default function client(c: string) {
    return "client" + c;
}

export type Client = string;
export { Shared };
`,
        );
        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default "index";`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/lite.ts`,
            `export default function lite(c: string) {
    return "lite" + c;
}
`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/shared.edge-light.ts`,
            `export default "shared.edge-light";
`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/shared.ts`,
            `export default "shared";

export type Shared = string;
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath, {
            runtime: "browser",
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": "./dist/index.cjs",
                "./client": {
                    import: "./dist/client.mjs",
                    require: "./dist/client.cjs",
                    types: "./dist/client.d.ts",
                },
                "./lite": "./dist/lite.cjs",
                "./package.json": "./package.json",
                "./server": {
                    "edge-light": "./dist/server/index.edge.mjs",
                    import: "./dist/server/index.mjs",
                    "react-server": "./dist/server/index.react-server.mjs",
                    types: "./dist/server/index.d.mts",
                },
                "./shared": {
                    "edge-light": "./dist/shared.edge-light.mjs",
                    import: "./dist/shared.mjs",
                    require: "./dist/shared.cjs",
                },
            },
            name: "multi-entries",
            types: "./dist/index.d.ts",
            version: "0.0.0",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsIndexContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsIndexContent).toBe(`'use strict';

const index = "index";

module.exports = index;
`);

        const cjsClientContent = readFileSync(`${temporaryDirectoryPath}/dist/client.cjs`);

        expect(cjsClientContent).toBe(`'use strict';

function client(c) {
  return "client" + c;
}

module.exports = client;
`);
    });

    it("should work with multi types", async () => {
        expect.assertions(5);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const index = "index";`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    default: "./dist/index.cjs",
                    import: {
                        default: "./dist/index.mjs",
                        types: "./dist/index.d.mts",
                    },
                    require: {
                        default: "./dist/index.cjs",
                        types: "./dist/index.d.cts",
                    },
                },
                "./package.json": "./package.json",
            },
            name: "multi-entries-multi-types",
            types: "./dist/index.d.ts",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjs).toBe(`const index = "index";

export { index };
`);

        const cjsDts = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(cjsDts).toBe(`declare const index = "index";

export { index };
`);

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjs).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const index = "index";

exports.index = index;
`);
    });

    it("should work with edge export condition", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const isEdge = process.env.EdgeRuntime;`);

        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                "edge-light": "./dist/index.edge.js",
                import: "./dist/index.js",
            },
            type: "module",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mjs).toBe(`const isEdge = false;

export { isEdge };
`);

        const mjsEdgeLight = readFileSync(`${temporaryDirectoryPath}/dist/index.edge.js`);

        expect(mjsEdgeLight).toBe(`const isEdge = true;

export { isEdge };
`);
    });

    it("should generate proper assets for each exports for server components with same layer", async () => {
        expect.assertions(6);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.js`,
            `"use client";

import React, { useState } from "react";

export function Button() {
    const [count] = useState(0);
    return React.createElement("button", \`count: \${count}\`);
}

export { Client } from "./_client";
`,
        );

        writeFileSync(
            `${temporaryDirectoryPath}/src/_client.js`,
            `"use client";

export function Client() {
    return "client-module";
}
`,
        );

        await createPackemConfig(temporaryDirectoryPath, {
            runtime: "browser",
        });
        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
            },
            peerDependencies: {
                react: "*",
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        // eslint-disable-next-line no-secrets/no-secrets
        expect(mjsContent).toBe(`'use client';
import React, { useState } from 'react';
export { Client } from './packem_shared/Client-97tyEYCZ.mjs';

function Button() {
  const [count] = useState(0);
  return React.createElement("button", \`count: \${count}\`);
}

export { Button };
`);

        const mjsClientContent = readFileSync(`${temporaryDirectoryPath}/dist/packem_shared/Client-97tyEYCZ.mjs`);

        expect(mjsClientContent).toBe(`'use client';
function Client() {
  return "client-module";
}

export { Client };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use client';
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const React = require('react');
const Client = require('./packem_shared/Client-gc0UrNx3.cjs');

const _interopDefaultCompat = e => e && typeof e === 'object' && 'default' in e ? e.default : e;

const React__default = /*#__PURE__*/_interopDefaultCompat(React);

function Button() {
  const [count] = React.useState(0);
  return React__default.createElement("button", \`count: \${count}\`);
}

exports.Client = Client.Client;
exports.Button = Button;
`);

        const cjsClientContent = readFileSync(`${temporaryDirectoryPath}/dist/packem_shared/Client-gc0UrNx3.cjs`);

        expect(cjsClientContent).toBe(`'use client';
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function Client() {
  return "client-module";
}

exports.Client = Client;
`);
    });

    it("should generate proper assets for each exports for server components", async () => {
        expect.assertions(8);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.js`,
            `export { Button, Client as UIClient } from "./ui";
export { action } from "./_actions";
export { Client } from "./_client";
`,
        );

        writeFileSync(
            `${temporaryDirectoryPath}/src/ui.js`,
            `"use client";

import React, { useState } from "react";

export function Button() {
    const [count] = useState(0);
    return React.createElement("button", \`count: \${count}\`);
}

export { Client } from "./_client";
export { asset } from "./_asset";
`,
        );

        writeFileSync(
            `${temporaryDirectoryPath}/src/_client.js`,
            `"use client";

export function Client() {
    return "client-module";
}
`,
        );

        writeFileSync(
            `${temporaryDirectoryPath}/src/_actions.js`,
            `"use server";

export async function action() {
    return "server-action";
}`,
        );

        writeFileSync(
            `${temporaryDirectoryPath}/src/_asset.js`,
            `"use client";

export const asset = "asset-module";
`,
        );

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
                "./ui": {
                    import: "./dist/ui.mjs",
                    require: "./dist/ui.cjs",
                },
            },
            peerDependencies: {
                react: "*",
            },
            type: "module",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`export { Button } from './ui.mjs';
export { action } from './packem_shared/action-Ec_x0XEO.mjs';
export { Client, Client as UIClient } from './packem_shared/Client-97tyEYCZ.mjs';
`);

        const mjsActionContent = readFileSync(`${temporaryDirectoryPath}/dist/packem_shared/action-Ec_x0XEO.mjs`);

        expect(mjsActionContent).toBe(`'use server';
async function action() {
  return "server-action";
}

export { action };
`);

        const mjsClientContent = readFileSync(`${temporaryDirectoryPath}/dist/packem_shared/Client-97tyEYCZ.mjs`);

        expect(mjsClientContent).toBe(`'use client';
function Client() {
  return "client-module";
}

export { Client };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const ui = require('./ui.cjs');
const action = require('./packem_shared/action-DHDpyHIn.cjs');
const Client = require('./packem_shared/Client-gc0UrNx3.cjs');



exports.Button = ui.Button;
exports.action = action.action;
exports.Client = Client.Client;
exports.UIClient = Client.Client;
`);

        const cjsActionContent = readFileSync(`${temporaryDirectoryPath}/dist/packem_shared/action-DHDpyHIn.cjs`);

        expect(cjsActionContent).toBe(`'use server';
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

async function action() {
  return "server-action";
}

exports.action = action;
`);

        const cjsClientContent = readFileSync(`${temporaryDirectoryPath}/dist/packem_shared/Client-gc0UrNx3.cjs`);

        expect(cjsClientContent).toBe(`'use client';
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function Client() {
  return "client-module";
}

exports.Client = Client;
`);
    });

    it("should find all files in the same directory if globstar is used", async () => {
        expect.assertions(22);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        Array.from({ length: 10 }).forEach((_, index) => {
            writeFileSync(`${temporaryDirectoryPath}/src/deep/index-${index}.js`, `export default 'index-${index}'`);
        });

        await installPackage(temporaryDirectoryPath, "typescript");

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: {
                        default: "./dist/index.mjs",
                        types: "./dist/index.d.mts",
                    },
                    require: {
                        default: "./dist/index.cjs",
                        types: "./dist/index.d.cts",
                    },
                },
                "./deep/*": {
                    import: {
                        default: "./dist/deep/*.mjs",
                        types: "./dist/deep/*.d.mts",
                    },
                    require: {
                        default: "./dist/deep/*.cjs",
                        types: "./dist/deep/*.d.cts",
                    },
                },
            },
        });
        await createTsConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-0.mjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-1.mjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-2.mjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-3.mjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-4.mjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-5.mjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-6.mjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-7.mjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-8.mjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-9.mjs`)).toBe(true);

        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-0.cjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-1.cjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-2.cjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-3.cjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-4.cjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-5.cjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-6.cjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-7.cjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-8.cjs`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/deep/index-9.cjs`)).toBe(true);
    });

    it("should generate different files, if file with same name, but with cts and mts ending was found", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.mts`, `export const result = "mts"`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.cts`, `export const result = "cts"`);

        await installPackage(temporaryDirectoryPath, "typescript");

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                    types: "./dist/index.d.ts",
                },
            },
        });

        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`const result = "mts";

export { result };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const result = "cts";

exports.result = result;
`);
    });

    it("should generate different files for mts and cts with same shared code", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/types.ts`,
            `export type Result = string;
export type Colorize = {
    color: string;
    text: string;
};`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/color.ts`,
            `const Colorize = function () {
    return {
        color: "red",
        text: "hello world",
    };
}

export default Colorize;`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.mts`,
            `import ColorizeImpl from "./color";
import type { Colorize } from "./types";

const result: Colorize = ColorizeImpl() as Colorize;

export default result as Colorize;

export const {
    text,
    color,
} = result;

export type { Colorize } from "./types";`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.cts`,
            `import ColorizeImpl from "./color";
import type { Colorize } from "./types";

const result: Colorize = ColorizeImpl() as Colorize;

export default result as Colorize;

export type { Colorize } from "./types";`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                cjsInterop: true,
            },
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                    types: "./dist/index.d.ts",
                },
            },
        });

        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });

        const binProcess = await execPackem("build", ["--debug"], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`const Colorize = function() {
  return {
    color: "red",
    text: "hello world"
  };
};

const result = Colorize();
const {
  text,
  color
} = result;

export { color, result as default, text };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

const Colorize = function() {
  return {
    color: "red",
    text: "hello world"
  };
};

const result = Colorize();

module.exports = result;
`);
    });

    it("should work with multiple exports conditions", async () => {
        expect.assertions(9);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const runtime = 'node';`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.browser.ts`, `export const runtime = 'browser';`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.edge-light.ts`, `export const runtime = 'edge-light';`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.workerd.ts`, `export const runtime = 'workerd';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    browser: {
                        default: "./dist/index.browser.mjs",
                        types: "./dist/index.browser.d.mts",
                    },
                    "edge-light": {
                        default: "./dist/index.edge-light.mjs",
                        types: "./dist/index.edge-light.d.mts",
                    },
                    import: {
                        default: "./dist/index.mjs",
                        types: "./dist/index.d.mts",
                    },
                    node: {
                        default: "./dist/index.cjs",
                        import: "./dist/index.mjs",
                        types: "./dist/index.d.ts",
                    },
                    require: {
                        default: "./dist/index.cjs",
                        types: "./dist/index.d.cts",
                    },
                    workerd: {
                        default: "./dist/index.workerd.mjs",
                        types: "./dist/index.workerd.d.mts",
                    },
                },
            },
            main: "dist/index.cjs",
            module: "dist/index.mjs",
            type: "module",
            types: "dist/index.d.ts",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const distributionFiles = [
            // entry files
            "index.mjs",
            "index.cjs",
            "index.browser.js",
            "index.workerd.js",
            "index.edge-light.js",
            // types
            "index.d.cts",
            "index.d.mts",
            "index.d.ts",
            "index.browser.d.ts",
            "index.workerd.d.ts",
            "index.edge-light.d.ts",
        ];

        const files = readdirSync(join(temporaryDirectoryPath, "dist"));

        expect(files).toHaveLength(11);

        assertContainFiles(join(temporaryDirectoryPath, "dist"), distributionFiles);

        for (const [file, regex] of [
            ["index.cjs", /const runtime = "node"/],
            ["index.mjs", /const runtime = "node"/],
            ["index.browser.js", /const runtime = "browser"/],
            ["index.workerd.js", /const runtime = "workerd"/],
            ["index.edge-light.js", /const runtime = "edge-light"/],
        ]) {
            const content = readFileSync(`${temporaryDirectoryPath}/dist/${file as string}`);

            expect(content).toMatch(regex as RegExp);
        }
    });

    it.skipIf(NODE_JS_VERSION !== "22.9")("should support the new 'module-sync' exports", async () => {
        expect.assertions(3);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.mts`,
            `import { resolved as import_module_require } from 'import-module-require';
import { resolved as module_and_import } from 'module-and-import';
import { resolved as module_and_require } from 'module-and-require';
import { resolved as module_import_require } from 'module-import-require';
import { resolved as module_only } from 'module-only';
import { resolved as module_require_import } from 'module-require-import';
import { resolved as require_module_import } from 'require-module-import';

console.log('import-module-require', import_module_require);
console.log('module-and-import', module_and_import);
console.log('module-and-require', module_and_require);
console.log('module-import-require', module_import_require);
console.log('module-only', module_only);
console.log('module-require-import', module_require_import);
console.log('require-module-import', require_module_import);`,
        );

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.cts`,
            `console.log('import-module-require', require('import-module-require').resolved);
console.log('module-and-import', require('module-and-import').resolved);
console.log('module-and-require', require('module-and-require').resolved);
console.log('module-import-require', require('module-import-require').resolved);
console.log('module-only', require('module-only').resolved);
console.log('module-require-import', require('module-require-import').resolved);
console.log('require-module-import', require('require-module-import').resolved);`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                // On older version of Node.js, where "module-sync" and require(esm) are
                // not supported, use the CJS version to avoid dual-package hazard.
                // When package authors think it's time to drop support for older versions of
                // On new version of Node.js, both require() and import get the ESM version
                default: "./dist/index.cjs",
                // Node.js, they can remove the exports conditions and just use "main": "index.js".
                "module-sync": "./dist/index.mjs",
            },
            type: "module",
        });

        const fixturePath = join(__dirname, "../../__fixtures__/module-conditions");

        const moduleConditionsFixture = readdirSync(fixturePath);

        for (const file of moduleConditionsFixture) {
            cpSync(`${fixturePath}/${file}`, `${temporaryDirectoryPath}/node_modules/${file}`, {
                recursive: true,
            });
        }

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            nodeOptions: ["--experimental-require-module"],
            reject: false,
        });

        expect(binProcess.exitCode).toBe(0);

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjs).toBe(`'use strict';

console.log("import-module-require", require("import-module-require").resolved);
console.log("module-and-import", require("module-and-import").resolved);
console.log("module-and-require", require("module-and-require").resolved);
console.log("module-import-require", require("module-import-require").resolved);
console.log("module-only", require("module-only").resolved);
console.log("module-require-import", require("module-require-import").resolved);
console.log("require-module-import", require("require-module-import").resolved);
`);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjs).toBe(`const resolved$6 = "module";

const resolved$5 = "module";

const resolved$4 = "module";

const resolved$3 = "module";

const resolved$2 = "module";

const resolved$1 = "module";

const resolved = "module";

console.log("import-module-require", resolved$6);
console.log("module-and-import", resolved$5);
console.log("module-and-require", resolved$4);
console.log("module-import-require", resolved$3);
console.log("module-only", resolved$2);
console.log("module-require-import", resolved$1);
console.log("require-module-import", resolved);
`);
    });

    it.skipIf(NODE_JS_VERSION !== "22.9")("should support the new 'module-sync' exports node", async () => {
        expect.assertions(3);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.mts`,
            `import { resolved as import_module_require } from 'import-module-require';
import { resolved as module_and_import } from 'module-and-import';
import { resolved as module_and_require } from 'module-and-require';
import { resolved as module_import_require } from 'module-import-require';
// This use the new "module-sync" export condition, this is only supported on newest Node.js version
import { resolved as module_only } from 'module-only';
import { resolved as module_require_import } from 'module-require-import';
import { resolved as require_module_import } from 'require-module-import';

console.log('import-module-require', import_module_require);
console.log('module-and-import', module_and_import);
console.log('module-and-require', module_and_require);
console.log('module-import-require', module_import_require);
console.log('module-only', module_only);
console.log('module-require-import', module_require_import);
console.log('require-module-import', require_module_import);`,
        );

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.cts`,
            `console.log('import-module-require', require('import-module-require').resolved);
console.log('module-and-import', require('module-and-import').resolved);
console.log('module-and-require', require('module-and-require').resolved);
console.log('module-import-require', require('module-import-require').resolved);
console.log('module-only', require('module-only').resolved);
console.log('module-require-import', require('module-require-import').resolved);
console.log('require-module-import', require('require-module-import').resolved);`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                // On any other environment, use the ESM version.
                default: "./dist/index.js",
                node: {
                    // On older version of Node.js, where "module-sync" and require(esm) are
                    // not supported, use the CJS version to avoid dual-package hazard.
                    // When package authors think it's time to drop support for older versions of
                    // the ESM version
                    default: "./dist/index.cjs",
                    // On new version of Node.js, both require() and import get
                    // Node.js, they can remove the exports conditions and just use "main": "index.js".
                    "module-sync": "./dist/index.mjs",
                },
            },
            type: "module",
        });

        const fixturePath = join(__dirname, "../../__fixtures__/module-conditions");

        const moduleConditionsFixture = readdirSync(fixturePath);

        for (const file of moduleConditionsFixture) {
            cpSync(`${fixturePath}/${file}`, `${temporaryDirectoryPath}/node_modules/${file}`, {
                recursive: true,
            });
        }

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            nodeOptions: ["--experimental-require-module"],
        });

        expect(binProcess.exitCode).toBe(0);

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjs).toBe(`'use strict';

console.log("import-module-require", require("import-module-require").resolved);
console.log("module-and-import", require("module-and-import").resolved);
console.log("module-and-require", require("module-and-require").resolved);
console.log("module-import-require", require("module-import-require").resolved);
console.log("module-only", require("module-only").resolved);
console.log("module-require-import", require("module-require-import").resolved);
console.log("require-module-import", require("require-module-import").resolved);
`);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjs).toBe(`const resolved$6 = "module";

const resolved$5 = "module";

const resolved$4 = "module";

const resolved$3 = "module";

const resolved$2 = "module";

const resolved$1 = "module";

const resolved = "module";

console.log("import-module-require", resolved$6);
console.log("module-and-import", resolved$5);
console.log("module-and-require", resolved$4);
console.log("module-import-require", resolved$3);
console.log("module-only", resolved$2);
console.log("module-require-import", resolved$1);
console.log("require-module-import", resolved);
`);
    });

    it("should generate proper assets with custom extensions from outputExtensionMap", async () => {
        expect.assertions(7);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value = 'index';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                outputExtensionMap: {
                    cjs: "c.js",
                    esm: "m.js",
                },
            },
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: {
                        default: "./dist/index.m.js",
                        types: "./dist/index.d.mts",
                    },
                    require: {
                        default: "./dist/index.c.js",
                        types: "./dist/index.d.cts",
                    },
                },
            },
            main: "./dist/index.c.js",
            module: "./dist/index.m.js",
            types: "./dist/index.d.ts",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const files = readdirSync(join(temporaryDirectoryPath, "dist"));

        expect(files).toHaveLength(5);

        assertContainFiles(join(temporaryDirectoryPath, "dist"), ["index.c.js", "index.m.js", "index.d.cts", "index.d.mts", "index.d.ts"]);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.c.js`);

        expect(cjsContent).toMatchSnapshot("cjs output");

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.m.js`);

        expect(mjsContent).toMatchSnapshot("mjs output");

        const dtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dtsContent).toMatchSnapshot("dts output");
    });

    it("should throw an error for invalid key in outputExtensionMap", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "export default 'test'");

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: "./dist/index.cjs",
        });

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                outputExtensionMap: {
                    // @ts-expect-error - invalid key
                    foo: "bar",
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.exitCode).toBe(1);
        expect(binProcess.stderr).toContain("Invalid output extension map: foo must be \"cjs\" or \"esm\"");
    });

    it("should throw a TypeError for non-string value in outputExtensionMap", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "export default 'test'");

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: "./dist/index.cjs",
        });

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                outputExtensionMap: {
                    // @ts-expect-error - invalid value type
                    cjs: { js: "c.js" },
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.exitCode).toBe(1);
        expect(binProcess.stderr).toContain("Invalid output extension map: cjs must be a string");
    });

    it("should throw an error for value starting with a dot in outputExtensionMap", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "export default 'test'");

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: "./dist/index.cjs",
        });

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                outputExtensionMap: {
                    cjs: ".cjs",
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.exitCode).toBe(1);
        expect(binProcess.stderr).toContain("Invalid output extension map: cjs must not start with a dot.");
    });

    it("should throw an error when outputExtensionMap values are the same", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "export default 'test'");

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: "./dist/index.cjs",
        });

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                outputExtensionMap: {
                    cjs: "same.js",
                    esm: "same.js", // Same value as cjs
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.exitCode).toBe(1);
        expect(binProcess.stderr).toContain("Invalid output extension map: esm must be different from the other key");
    });

    it("should ignore export keys with wildcard patterns when using ignoreExportKeys", async () => {
        expect.assertions(5);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "export default 'main-export'");
        writeFileSync(`${temporaryDirectoryPath}/src/icons/icon1.svg`, "<svg>icon1</svg>");
        writeFileSync(`${temporaryDirectoryPath}/src/icons/icon2.svg`, "<svg>icon2</svg>");
        writeFileSync(`${temporaryDirectoryPath}/src/icons/subfolder/icon3.svg`, "<svg>icon3</svg>");

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": "./dist/index.js",
                "./icons/*": "./dist/icons/*",
            },
        });

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                ignoreExportKeys: ["icons"],
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Should only build the main export, not the icons
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.js`)).toBe(true);

        // Icons should not be built due to ignoreExportKeys
        expect(existsSync(`${temporaryDirectoryPath}/dist/icons/icon1.svg`)).toBe(false);
        expect(existsSync(`${temporaryDirectoryPath}/dist/icons/icon2.svg`)).toBe(false);
    });

    it("should build export keys with wildcard patterns when not using ignoreExportKeys", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "export default 'main-export'");
        writeFileSync(`${temporaryDirectoryPath}/src/icons/icon1.svg`, "<svg>icon1</svg>");
        writeFileSync(`${temporaryDirectoryPath}/src/icons/icon2.svg`, "<svg>icon2</svg>");
        writeFileSync(`${temporaryDirectoryPath}/src/icons/subfolder/icon3.svg`, "<svg>icon3</svg>");

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": "./dist/index.js",
                "./icons2/*": "./dist/icons2/*",
            },
        });

        await createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stdout).toContain("Could not find entrypoint for `./dist/icons/*`");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should support separate source files for browser and server patterns", async () => {
        expect.assertions(6);

        writeFileSync(`${temporaryDirectoryPath}/src/index.tsx`, `export default 'index';`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.browser.tsx`, `export const isSSR = process.env.SSR === 'true'; export default 'browser';`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.server.tsx`, `export const isSSR = process.env.SSR === 'true'; export default 'server';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath, {
            preset: "solid",
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    browser: "./dist/index.browser.cjs",
                    node: "./dist/index.server.cjs",
                    types: "./dist/index.d.ts",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            name: "test-package",
            types: "./dist/index.d.ts",
            typesVersions: {
                "*": {
                    ".": ["./dist/index.browser.d.ts", "./dist/index.server.d.ts", "./dist/index.d.ts"],
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const browserContent = readFileSync(`${temporaryDirectoryPath}/dist/index.browser.cjs`);

        expect(browserContent).toContain("browser");

        const serverContent = readFileSync(`${temporaryDirectoryPath}/dist/index.server.cjs`);

        expect(serverContent).toContain("server");

        // Verify separate builds by checking replace values
        // process.env.SSR === 'true' is replaced with false for browser, true for server
        expect(browserContent).toContain("const isSSR = false");
        expect(serverContent).toContain("const isSSR = true");
    });

    it("should support same source file with different outputs (browser/server patterns)", async () => {
        expect.assertions(6);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.tsx`,
            `export const env = process.env.NODE_ENV;
export const isServer = process.env.SSR === 'true';
export default 'index';`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath, {
            preset: "solid",
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    browser: "./dist/index.browser.cjs",
                    node: "./dist/index.server.cjs",
                    types: "./dist/index.d.ts",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            name: "test-package",
            types: "./dist/index.d.ts",
            typesVersions: {
                "*": {
                    ".": ["./dist/index.browser.d.ts", "./dist/index.server.d.ts", "./dist/index.d.ts"],
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const browserContent = readFileSync(`${temporaryDirectoryPath}/dist/index.browser.cjs`);

        expect(browserContent).toContain("index");
        // process.env.SSR === 'true' is replaced with "false" for browser, "true" for server
        // Rollup evaluates "false" === 'true' to false, "true" === 'true' to true
        expect(browserContent).toContain("const isServer = false");

        const serverContent = readFileSync(`${temporaryDirectoryPath}/dist/index.server.cjs`);

        expect(serverContent).toContain("index");
        // process.env.SSR === 'true' is replaced with "false" for browser, "true" for server
        // Rollup evaluates "false" === 'true' to false, "true" === 'true' to true
        expect(serverContent).toContain("const isServer = true");
    });

    it("should inject SolidJS environment variables using array join pattern", async () => {
        expect.assertions(12);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.tsx`,
            `export const isDev = process.env.DEV === 'true';
export const isProd = process.env.PROD === 'true';
export const isSSR = process.env.SSR === 'true';
export const nodeEnv = process.env.NODE_ENV;
export const importMetaDev = import.meta.env.DEV === true;
export const importMetaProd = import.meta.env.PROD === true;
export const importMetaSSR = import.meta.env.SSR === true;
export default 'solid';`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath, {
            preset: "solid",
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    browser: "./dist/index.browser.mjs",
                    node: "./dist/index.server.mjs",
                    types: "./dist/index.d.ts",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            name: "test-package",
            types: "./dist/index.d.ts",
            typesVersions: {
                "*": {
                    ".": ["./dist/index.browser.d.ts", "./dist/index.server.d.ts", "./dist/index.d.ts"],
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Check browser build (should have DEV=true, PROD=false, SSR=false)
        // The replace plugin replaces process.env.* with stringified values, which Rollup then evaluates
        const browserContent = readFileSync(`${temporaryDirectoryPath}/dist/index.browser.mjs`);

        // Values are replaced and evaluated by Rollup
        expect(browserContent).toContain("const isDev = true");
        expect(browserContent).toContain("const isProd = false");
        expect(browserContent).toContain("const isSSR = false");
        expect(browserContent).toContain("const nodeEnv = \"development\"");
        // import.meta.env values are replaced with boolean literals (not stringified)
        expect(browserContent).toContain("const importMetaDev = true");
        expect(browserContent).toContain("const importMetaProd = false");
        expect(browserContent).toContain("const importMetaSSR = false");

        // Check server build (should have SSR=true)
        const serverContent = readFileSync(`${temporaryDirectoryPath}/dist/index.server.mjs`);

        expect(serverContent).toContain("const isSSR = true");
        expect(serverContent).toContain("const importMetaSSR = true");
        expect(serverContent).toContain("const importMetaDev = true");
    });

    it("should support nested conditions (browser.development)", async () => {
        expect.assertions(6);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.tsx`,
            `export const env = process.env.NODE_ENV;
export const isDev = process.env.DEV === 'true';
export default 'index';`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath, {
            preset: "solid",
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    browser: {
                        default: "./dist/index.browser.cjs",
                        development: "./dist/index.development.cjs",
                    },
                    node: "./dist/index.server.cjs",
                    types: "./dist/index.d.ts",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            name: "test-package",
            types: "./dist/index.d.ts",
            typesVersions: {
                "*": {
                    ".": ["./dist/index.development.d.ts", "./dist/index.browser.d.ts", "./dist/index.server.d.ts", "./dist/index.d.ts"],
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const developmentContent = readFileSync(`${temporaryDirectoryPath}/dist/index.development.cjs`);

        expect(developmentContent).toContain("index");
        expect(developmentContent).toMatch("const env = \"development\"");
        // process.env.DEV is replaced and evaluated by Rollup
        expect(developmentContent).toContain("const isDev = true");

        const browserContent = readFileSync(`${temporaryDirectoryPath}/dist/index.browser.cjs`);

        expect(browserContent).toContain("index");
    });

    it("should support workerd condition with separate source file", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const runtime = 'node';`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.workerd.ts`, `export const runtime = 'workerd';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    node: "./dist/index.js",
                    types: "./dist/index.d.ts",
                    workerd: "./dist/index.workerd.js",
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const workerdContent = readFileSync(`${temporaryDirectoryPath}/dist/index.workerd.js`);

        expect(workerdContent).toContain("workerd");

        const nodeContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(nodeContent).toContain("node");
    });

    it("should not generate .d.js files for declaration-only entries", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value = 'test';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                    types: "./dist/index.d.ts",
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const files = readdirSync(join(temporaryDirectoryPath, "dist"));

        // Should not have any .d.js files
        const dJsFiles = files.filter((file) => file.endsWith(".d.js"));

        expect(dJsFiles).toHaveLength(0);

        // Should have declaration files but not .d.js files
        expect(files.some((file) => file.endsWith(".d.ts"))).toBe(true);
    });

    it("should create separate builds for entries with different types (browser vs server)", async () => {
        expect.assertions(7);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value = 'base';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    browser: "./dist/index.browser.js",
                    node: "./dist/index.server.js",
                    types: "./dist/index.d.ts",
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const files = readdirSync(join(temporaryDirectoryPath, "dist"));

        // Should have separate files for browser and server
        expect(files).toContain("index.browser.js");
        expect(files).toContain("index.server.js");

        // Verify they are separate builds (should not import each other incorrectly)
        const browserContent = readFileSync(`${temporaryDirectoryPath}/dist/index.browser.js`);
        const serverContent = readFileSync(`${temporaryDirectoryPath}/dist/index.server.js`);

        expect(browserContent).toContain("value");
        expect(serverContent).toContain("value");

        // Should not have .d.js files
        const dJsFiles = files.filter((file) => file.endsWith(".d.js"));

        expect(dJsFiles).toHaveLength(0);
    });

    it("should group entries by environment, runtime, and type correctly", async () => {
        expect.assertions(7);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export const value = 'test';
export const nodeEnv = process.env.NODE_ENV;
export const isDev = process.env.DEV === 'true';`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath, {
            preset: "solid",
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    browser: {
                        default: "./dist/index.browser.mjs",
                        development: "./dist/index.development.mjs",
                    },
                    node: "./dist/index.server.mjs",
                    types: "./dist/index.d.ts",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            name: "test-package",
            types: "./dist/index.d.ts",
            typesVersions: {
                "*": {
                    ".": ["./dist/index.development.d.ts", "./dist/index.browser.d.ts", "./dist/index.server.d.ts", "./dist/index.d.ts"],
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const files = readdirSync(join(temporaryDirectoryPath, "dist"));

        // Should have separate files for each type
        expect(files).toContain("index.development.mjs");
        expect(files).toContain("index.browser.mjs");
        expect(files).toContain("index.server.mjs");

        // Verify development build has correct environment variables
        // Note: process.env.NODE_ENV is replaced with "development", so we check for the replaced value
        const developmentContent = readFileSync(`${temporaryDirectoryPath}/dist/index.development.mjs`);

        expect(developmentContent).toMatch(/nodeEnv.*"development"/);
        expect(developmentContent).toMatch(/isDev.*true/);
    });

    it("should not generate .d.js files even when entry names end with .d", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value = 'test';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                    types: "./dist/index.d.ts",
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const files = readdirSync(join(temporaryDirectoryPath, "dist"));
        const dJsFiles = files.filter((file) => file.endsWith(".d.js") || file.includes(".d.js"));

        // Should not have any .d.js files
        expect(dJsFiles).toHaveLength(0);
    });
});
