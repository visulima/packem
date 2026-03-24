import { writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";

import { readFile, writeFile, writeJson } from "@visulima/fs";
import { join } from "@visulima/path";
import { execaNode } from "execa";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

describe("packem externals", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        await createPackemConfig(temporaryDirectoryPath);
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should handle externals with peerDependenciesMeta", async () => {
        expect.assertions(5);

        await installPackage(temporaryDirectoryPath, "typescript");
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import a from 'peer-dep'
import b from 'peer-dep-meta'

export default a + b
`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "^4.4.3",
            },
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
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
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).not.toContain("Inlined implicit external");

        const mjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs output");

        const cjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");
    });

    it("should bundle 'devDependencies' that are used inside the code and are not marked as external", async () => {
        expect.assertions(8);

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "detect-indent");
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import detectIndentFn from "detect-indent";

const { indent: dIndent } = detectIndentFn("  file");

export const indent = dIndent;
`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "detect-indent": "^7.0.1",
                typescript: "^4.4.3",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                moduleResolution: "bundler",
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("Inlined implicit external");

        const mjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs output");

        const cjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");

        const dCtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toMatchSnapshot("cjs dts output");

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toMatchSnapshot("mjs dts output");

        const dContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).toMatchSnapshot("dts output");
    });

    it("should inline types from optional peer dependencies in DTS output automatically", async () => {
        expect.assertions(8);

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "detect-indent");
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import detectIndentFn from "detect-indent";

const { indent: dIndent } = detectIndentFn("  file");

export const indent = dIndent;
`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "detect-indent": "^7.0.1",
                typescript: "^4.4.3",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            peerDependencies: {
                "detect-indent": "*",
            },
            peerDependenciesMeta: {
                "detect-indent": {
                    optional: true,
                },
            },
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                moduleResolution: "bundler",
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // JS output should still have the external import (peer dep stays external for JS)
        const mjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toContain("detect-indent");

        const cjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toContain("detect-indent");

        // DTS output should NOT have an import from detect-indent (types are auto-inlined for optional peers)
        const dCtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).not.toContain("detect-indent");

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).not.toContain("detect-indent");

        const dContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).not.toContain("detect-indent");

        // The inlined type should be present
        expect(dMtsContent).toContain("indent");
    });

    it("should inline types from namespaced optional peer dependencies in DTS output automatically", async () => {
        expect.assertions(8);

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "@svgr/core");
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import { transform as svgrTransform } from "@svgr/core";

export const transform = svgrTransform;
`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "@svgr/core": "*",
                typescript: "^4.4.3",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            peerDependencies: {
                "@svgr/core": "*",
            },
            peerDependenciesMeta: {
                "@svgr/core": {
                    optional: true,
                },
            },
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                moduleResolution: "bundler",
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // JS output should still have the external import
        const mjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toContain("@svgr/core");

        const cjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toContain("@svgr/core");

        // DTS output should have the transform type inlined (not just `import type` from @svgr/core)
        const dCtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toContain("transform");

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toContain("transform");

        // DTS should contain resolved type signatures, not just a re-export
        expect(dMtsContent).toMatch(/declare const transform/u);

        const dContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dContent).toMatchSnapshot("dts output");
    });

    it("should not resolve .js to .ts in externalized dependency", async () => {
        expect.assertions(4);

        await installPackage(temporaryDirectoryPath, "typescript");
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import "dep/file.js";

export const foo = "bar";
`,
        );
        await writeFile(join(temporaryDirectoryPath, "node_modules", "dep", "file.js"), "module.exports.foo = function() {};");
        await writeJson(join(temporaryDirectoryPath, "node_modules", "dep", "package.json"), {
            name: "dep",
            version: "1.0.0",
        });
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                dep: "*",
            },
            devDependencies: {
                typescript: "^4.4.3",
            },
            main: "./dist/index.js",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stderr).toBe("");

        const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

        // Should import from .js, not .ts
        expect(content).toMatch(/import ['"]dep\/file\.js['"]/);
        expect(content).not.toMatch("file.ts");
    });

    it("should add explicit extensions to externalized package imports", async () => {
        expect.assertions(4);

        await installPackage(temporaryDirectoryPath, "typescript");
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `// Import without extension - works in tsx, breaks in Node
import { foo } from 'external-pkg/file-without-ext';

console.log(foo);
`,
        );
        await mkdir(`${temporaryDirectoryPath}/node_modules/external-pkg`, { recursive: true });
        await writeFileSync(`${temporaryDirectoryPath}/node_modules/external-pkg/file-without-ext.js`, "export const foo = 'bar';");
        await writeJson(`${temporaryDirectoryPath}/node_modules/external-pkg/package.json`, {
            name: "external-pkg",
            type: "module",
        });
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                "external-pkg": "*",
            },
            devDependencies: {
                typescript: "^4.4.3",
            },
            main: "./dist/index.js",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stderr).toBe("");

        const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

        // packem should rewrite import to have explicit .js extension
        expect(content).toMatch("'external-pkg/file-without-ext.js'");

        // Verify it actually runs in Node.js
        const { exitCode } = await execaNode("dist/index.js", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(exitCode).toBe(0);
    });

    it("should keep original import for package with exports (no subpaths)", async () => {
        expect.assertions(3);

        await installPackage(temporaryDirectoryPath, "typescript");
        await mkdir(`${temporaryDirectoryPath}/node_modules/pkg-with-exports`, { recursive: true });
        await writeFileSync(`${temporaryDirectoryPath}/node_modules/pkg-with-exports/file.js`, "export const foo = 'bar';");
        await writeJson(`${temporaryDirectoryPath}/node_modules/pkg-with-exports/package.json`, {
            exports: {
                import: "./index.js",
                require: "./index.cjs",
            },
            name: "pkg-with-exports",
            type: "module",
        });
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import { foo } from 'pkg-with-exports/file';

console.log(foo);
`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                "pkg-with-exports": "*",
            },
            devDependencies: {
                typescript: "^4.4.3",
            },
            main: "./dist/index.js",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stderr).toBe("");

        const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

        // Should NOT add extension - package has exports (conditions object)
        expect(content).toMatch("'pkg-with-exports/file'");
    });

    it("should keep original import for package with subpaths exports when subpath is defined", async () => {
        expect.assertions(3);

        await installPackage(temporaryDirectoryPath, "typescript");
        await mkdir(`${temporaryDirectoryPath}/node_modules/pkg-with-subpaths`, { recursive: true });
        await writeFileSync(`${temporaryDirectoryPath}/node_modules/pkg-with-subpaths/utils.js`, "export const foo = 'bar';");
        await writeJson(`${temporaryDirectoryPath}/node_modules/pkg-with-subpaths/package.json`, {
            exports: {
                ".": "./index.js",
                "./utils": "./utils.js",
            },
            name: "pkg-with-subpaths",
            type: "module",
        });
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import { foo } from 'pkg-with-subpaths/utils';

console.log(foo);
`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                "pkg-with-subpaths": "*",
            },
            devDependencies: {
                typescript: "^4.4.3",
            },
            main: "./dist/index.js",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stderr).toBe("");

        const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

        // Should NOT add extension - subpath is defined in exports
        expect(content).toMatch("'pkg-with-subpaths/utils'");
    });

    it("should keep original import for package with subpaths exports when subpath is undefined", async () => {
        expect.assertions(3);

        await installPackage(temporaryDirectoryPath, "typescript");
        await mkdir(`${temporaryDirectoryPath}/node_modules/pkg-with-subpaths`, { recursive: true });
        await writeFileSync(`${temporaryDirectoryPath}/node_modules/pkg-with-subpaths/other.js`, "export const foo = 'bar';");
        await writeJson(`${temporaryDirectoryPath}/node_modules/pkg-with-subpaths/package.json`, {
            exports: {
                ".": "./index.js",
                "./utils": "./utils.js",
            },
            name: "pkg-with-subpaths",
            type: "module",
        });
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import { foo } from 'pkg-with-subpaths/other';

console.log(foo);
`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                "pkg-with-subpaths": "*",
            },
            devDependencies: {
                typescript: "^4.4.3",
            },
            main: "./dist/index.js",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stderr).toBe("");

        const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

        // Should NOT add extension - package has exports field (even though subpath not defined)
        // Node.js will error at runtime if trying to access undefined subpath
        expect(content).toMatch("'pkg-with-subpaths/other'");
    });

    it("should resolve import with double extension (.min.js) correctly", async () => {
        expect.assertions(4);

        await installPackage(temporaryDirectoryPath, "typescript");
        await mkdir(`${temporaryDirectoryPath}/node_modules/external-pkg`, { recursive: true });
        await writeFileSync(`${temporaryDirectoryPath}/node_modules/external-pkg/lib.min.js`, "export default 'minified';");
        await writeJson(`${temporaryDirectoryPath}/node_modules/external-pkg/package.json`, {
            name: "external-pkg",
            type: "module",
        });
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import lib from 'external-pkg/lib.min';

console.log(lib);
`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                "external-pkg": "*",
            },
            devDependencies: {
                typescript: "^4.4.3",
            },
            main: "./dist/index.js",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stderr).toBe("");

        const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

        // Should add .js extension to lib.min
        expect(content).toMatch("'external-pkg/lib.min.js'");

        // Verify it actually runs in Node.js
        const { exitCode } = await execaNode("dist/index.js", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(exitCode).toBe(0);
    });

    it("should resolve directory import to index.js", async () => {
        expect.assertions(4);

        await installPackage(temporaryDirectoryPath, "typescript");
        await mkdir(`${temporaryDirectoryPath}/node_modules/external-pkg/utils`, { recursive: true });
        await writeFileSync(`${temporaryDirectoryPath}/node_modules/external-pkg/utils/index.js`, "export default 'utils';");
        await writeJson(`${temporaryDirectoryPath}/node_modules/external-pkg/package.json`, {
            name: "external-pkg",
            type: "module",
        });
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import utils from 'external-pkg/utils';

console.log(utils);
`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                "external-pkg": "*",
            },
            devDependencies: {
                typescript: "^4.4.3",
            },
            main: "./dist/index.js",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stderr).toBe("");

        const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

        // Should resolve directory to index.js
        expect(content).toMatch("'external-pkg/utils/index.js'");

        // Verify it actually runs in Node.js
        const { exitCode } = await execaNode("dist/index.js", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(exitCode).toBe(0);
    });

    it("should add explicit extensions to externalized package subpath imports without exports", async () => {
        expect.assertions(3);

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "postgraphile");
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import { TagsFilePlugin } from 'postgraphile/plugins';

console.log(TagsFilePlugin);
`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                postgraphile: "*",
            },
            devDependencies: {
                typescript: "^4.4.3",
            },
            main: "./dist/index.js",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });

        const binProcess = await execPackem("build", ["--debug"], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stderr).toBe("");

        const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

        // Should add explicit .js extension to postgraphile/plugins import
        // postgraphile doesn't have exports field for /plugins subpath, so the plugin should rewrite it
        expect(content).toMatch(/import.*['"]postgraphile\/plugins\.js['"]/);
    });

    it("should inline types from peer dependencies when rollup.dts.resolve is configured", async () => {
        expect.assertions(12);

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "detect-indent");
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import detectIndentFn from "detect-indent";

const { indent: dIndent } = detectIndentFn("  file");

export const indent = dIndent;
`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "detect-indent": "^7.0.1",
                typescript: "^4.4.3",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            peerDependencies: {
                "detect-indent": "*",
            },
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    dts: {
                        resolve: ["detect-indent"],
                    },
                },
            },
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                moduleResolution: "bundler",
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // JS output should still have the external import (peer dep stays external for JS)
        const mjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toContain("detect-indent");

        const cjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toContain("detect-indent");

        // ESM DTS output should NOT have an import from detect-indent (types are inlined)
        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).not.toContain("from 'detect-indent'");
        expect(dMtsContent).not.toContain('from "detect-indent"');
        expect(dMtsContent).toContain("indent");

        // CJS DTS output should NOT have an import from detect-indent (types are inlined)
        const dCtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).not.toContain("from 'detect-indent'");
        expect(dCtsContent).not.toContain('from "detect-indent"');
        expect(dCtsContent).toContain("indent");

        // Default DTS output should NOT have an import from detect-indent (types are inlined)
        const dTsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).not.toContain("from 'detect-indent'");
        expect(dTsContent).not.toContain('from "detect-indent"');
    });
});
