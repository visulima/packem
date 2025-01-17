import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

describe("shebang", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should preserves existing shebang after successful rollup bundle", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `#!/usr/bin/env node

// eslint-disable-next-line no-console
console.log('Hello, world!');
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs output");
    });

    it("should replaces an existing shebang with a custom shebang", async () => {
        expect.assertions(6);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `#!/usr/bin/env node

// eslint-disable-next-line no-console
console.log('Hello, world!');
`,
        );

        const customShebang = "#!/path/to/custom/interpreter";

        await installPackage(temporaryDirectoryPath, "typescript");

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    shebang: {
                        replace: true,
                        shebang: customShebang,
                    },
                },
            },
        });
        await createTsConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toContain(customShebang);
        expect(cjsContent).toMatchSnapshot("cjs output");

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toContain(customShebang);
        expect(mjsContent).toMatchSnapshot("mjs output");
    });

    it("should retain shebangs defined elsewhere in a file", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `/**
 * Get a shebang to use in node CLIs. Defaults to #!/usr/bin/env node
 * @returns string
 */
function getNodeSheBang() {
	return '#!/usr/bin/env node';
}

export { getNodeSheBang };
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs output");
    });

    it("should retain comments defined after a shebang", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `#!/usr/bin/env node // <-- this thing is a shebang. :)

/**
 * Get a shebang to use in node CLIs. Defaults to #!/usr/bin/env node
 * @returns string
 */
function getNodeSheBang() {
	return '#!/usr/bin/env node';
}

export { getNodeSheBang };
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs output");
    });

    it("should preserve shebang in files without an EOF character", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `#!/usr/bin/env node
// eslint-disable-next-line no-console
for (let i = 0; i < 10; i++) { console.log('🦄');}`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await createTsConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs output");
    });
});
