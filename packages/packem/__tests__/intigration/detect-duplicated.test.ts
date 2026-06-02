import { rm } from "node:fs/promises";

import { writeFile, writeJson } from "@visulima/fs";
import { join } from "@visulima/path";
// eslint-disable-next-line e18e/ban-dependencies -- tempy is core test-runner infra; fs.mkdtemp migration tracked separately
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackem } from "../helpers";

// eslint-disable-next-line no-control-regex -- ANSI escape sequences begin with the U+001B control char.
const ANSI_ESCAPE_REGEX = /\u001B\[[\d;]+m/g;

const stripAnsi = (text: string): string => text.replaceAll(ANSI_ESCAPE_REGEX, "");

/**
 * Scaffolds two top-level packages, each carrying its own nested copy of
 * `dup-dep` at a different version, so the dependency is bundled twice.
 */
const createDuplicateFixture = async (cwd: string): Promise<void> => {
    // The entry must *use* the imported values so the duplicated dependency is
    // actually included in the bundle (not tree-shaken away).
    await writeFile(join(cwd, "src/index.js"), `import a from "consumer-a";\nimport b from "consumer-b";\n\nexport default \`\${a}-\${b}\`;\n`);

    const createConsumer = async (name: string, dupVersion: string): Promise<void> => {
        await writeJson(join(cwd, `node_modules/${name}/package.json`), { main: "index.js", name, type: "module", version: "1.0.0" });
        await writeFile(join(cwd, `node_modules/${name}/index.js`), `import dep from "dup-dep";\n\nexport default dep;\n`);

        await writeJson(join(cwd, `node_modules/${name}/node_modules/dup-dep/package.json`), {
            main: "index.js",
            name: "dup-dep",
            type: "module",
            version: dupVersion,
        });
        await writeFile(join(cwd, `node_modules/${name}/node_modules/dup-dep/index.js`), `export default ${JSON.stringify(dupVersion)};\n`);
    };

    await createConsumer("consumer-a", "1.0.0");
    await createConsumer("consumer-b", "2.0.0");
};

const PACKAGE_JSON_OPTIONS = {
    exports: {
        ".": {
            import: "./dist/index.mjs",
        },
    },
    type: "module" as const,
};

describe("packem detect-duplicated", () => {
    let temporaryDirectoryPath: string;

    beforeEach(() => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should report a dependency that is bundled at multiple versions", async () => {
        expect.assertions(3);

        await createDuplicateFixture(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, PACKAGE_JSON_OPTIONS);
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        const output = stripAnsi(`${String(binProcess.stdout)}\n${String(binProcess.stderr)}`);

        expect(binProcess.exitCode).toBe(0);
        expect(output).toContain("dup-dep is bundled multiple times!");
        expect(output).toContain("dup-dep");
    });

    it("should not report anything when detectDuplicated is disabled", async () => {
        expect.assertions(2);

        await createDuplicateFixture(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, PACKAGE_JSON_OPTIONS);
        await createPackemConfig(temporaryDirectoryPath, { config: { rollup: { detectDuplicated: false } } });

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        const output = stripAnsi(`${String(binProcess.stdout)}\n${String(binProcess.stderr)}`);

        expect(binProcess.exitCode).toBe(0);
        expect(output).not.toContain("bundled multiple times");
    });

    it("should skip packages listed in the ignore option", async () => {
        expect.assertions(2);

        await createDuplicateFixture(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, PACKAGE_JSON_OPTIONS);
        await createPackemConfig(temporaryDirectoryPath, { config: { rollup: { detectDuplicated: { ignore: { "dup-dep": ["*"] } } } } });

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        const output = stripAnsi(`${String(binProcess.stdout)}\n${String(binProcess.stderr)}`);

        expect(binProcess.exitCode).toBe(0);
        expect(output).not.toContain("bundled multiple times");
    });

    it("should fail the build when throwErrorWhenDuplicated is enabled", async () => {
        expect.assertions(2);

        await createDuplicateFixture(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, PACKAGE_JSON_OPTIONS);
        await createPackemConfig(temporaryDirectoryPath, { config: { rollup: { detectDuplicated: { throwErrorWhenDuplicated: true } } } });

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath, reject: false });

        const output = stripAnsi(`${String(binProcess.stdout)}\n${String(binProcess.stderr)}`);

        expect(binProcess.exitCode).not.toBe(0);
        expect(output).toContain("Duplicated dependencies detected.");
    });
});
