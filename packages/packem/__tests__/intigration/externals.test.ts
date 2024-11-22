import { rm } from "node:fs/promises";

import { readFile, writeFile } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

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
        await createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });

        const binProcess = await execPackemSync("build", [], {
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

        const binProcess = await execPackemSync("build", [], {
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

    it("should not bundle 'devDependencies' that are used inside the code and are marked as external with 'peerDependencies' and 'peerDependenciesMeta'", async () => {
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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });
        console.log(binProcess.stdout);
        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).not.toContain("Inlined implicit external");

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

    it("should not bundle 'devDependencies' that are namespaced and used inside the code and are marked as external with 'peerDependencies' and 'peerDependenciesMeta'", async () => {
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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });
        console.log(binProcess.stdout);
        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).not.toContain("Inlined implicit external");

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
});
