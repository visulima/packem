import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";
import temporaryDirectory from "../helpers/temporary-directory";

/**
 * `(module (func (export "add") (param i32 i32) (result i32) (i32.add (local.get 0) (local.get 1))))`
 *
 * Kept as base64 so the fixture needs no build step and no checked-in binary. The byte
 * level detail is asserted in the reader's own unit tests; here the module only has to be
 * a valid one.
 */
const ADD_WASM = Buffer.from("AGFzbQEAAAABBwFgAn9/AX8DAgEABwcBA2FkZAAACgkBBwAgACABags=", "base64");

/** Either runtime loader the asset mode can emit, depending on the target environment. */
const ASSET_LOADER = /readFileSync|fetch\(/;

/** The preserved specifier, in whichever quote style the bundler picked. */
const PRESERVED_IMPORT = /from ["']\.\/add\.wasm["']/;

describe("packem wasm", () => {
    let temporaryDirectoryPath: string;

    beforeEach(() => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    /** Writes the shared scaffolding every case needs, and returns the built ESM output path. */
    const scaffold = async (source: string): Promise<string> => {
        writeFileSync(`${temporaryDirectoryPath}/src/add.wasm`, ADD_WASM);
        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, source);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: { typescript: "*" },
            module: "./dist/index.mjs",
        });

        return `${temporaryDirectoryPath}/dist/index.mjs`;
    };

    it("should expose WebAssembly exports as named exports (ESM integration)", async () => {
        expect.assertions(4);

        await createPackemConfig(temporaryDirectoryPath);

        const output = await scaffold(`import { add } from "./add.wasm";

export const sum = add(2, 3);`);

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath, reject: false });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const built = readFileSync(output);

        expect(built).toContain("WebAssembly.Instance");

        // The module is small, so it inlines: the built file runs with no sidecar asset.
        const { sum } = (await import(output)) as { sum: number };

        expect(sum).toBe(5);
    });

    it("should bind a compiled module for a source phase import", async () => {
        expect.assertions(4);

        await createPackemConfig(temporaryDirectoryPath);

        const output = await scaffold(`import source addModule from "./add.wasm";

export const isModule = addModule instanceof WebAssembly.Module;
export const result = new WebAssembly.Instance(addModule).exports.add(20, 22);`);

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath, reject: false });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const { isModule, result } = (await import(output)) as { isModule: boolean; result: number };

        expect(isModule).toBe(true);
        expect(result).toBe(42);
    });

    it("should keep the @rollup/plugin-wasm default import working", async () => {
        expect.assertions(3);

        await createPackemConfig(temporaryDirectoryPath);

        const output = await scaffold(`import init from "./add.wasm";

export const run = async () => {
    const instance = await init();

    return instance.exports.add(1, 1);
};`);

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath, reject: false });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const { run } = (await import(output)) as { run: () => Promise<number> };

        await expect(run()).resolves.toBe(2);
    });

    it("should emit the module as a separate asset when it exceeds maxFileSize", async () => {
        expect.assertions(4);

        await createPackemConfig(temporaryDirectoryPath, { config: { rollup: { wasm: { maxFileSize: 0 } } } });

        const output = await scaffold(`import { add } from "./add.wasm";

export const sum = add(8, 8);`);

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath, reject: false });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const built = readFileSync(output);

        expect(built).toMatch(ASSET_LOADER);

        const { sum } = (await import(output)) as { sum: number };

        expect(sum).toBe(16);
    });

    it("should resolve an emitted asset from a nested chunk", async () => {
        expect.assertions(4);

        await createPackemConfig(temporaryDirectoryPath, { config: { rollup: { wasm: { maxFileSize: 0 } } } });

        writeFileSync(`${temporaryDirectoryPath}/src/add.wasm`, ADD_WASM);
        writeFileSync(
            `${temporaryDirectoryPath}/src/nested/deep.ts`,
            `import { add } from "../add.wasm";

export const sum = add(2, 3);`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: { typescript: "*" },
            exports: { "./nested/deep": { import: "./dist/nested/deep.mjs" } },
            type: "module",
        });

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath, reject: false });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const output = `${temporaryDirectoryPath}/dist/nested/deep.mjs`;

        expect(existsSync(output)).toBe(true);

        // The chunk sits in dist/nested/ while the asset lands at the dist root, so a
        // chunk-relative "./name.wasm" would resolve to a file that is not there.
        const { sum } = (await import(output)) as { sum: number };

        expect(sum).toBe(5);
    });

    it("should reject a source phase import in preserve mode", async () => {
        expect.assertions(3);

        await createPackemConfig(temporaryDirectoryPath, { config: { rollup: { wasm: { mode: "preserve" } } } });

        const output = await scaffold(`import source addModule from "./add.wasm";

export const isModule = addModule instanceof WebAssembly.Module;`);

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath, reject: false });

        // Preserving the specifier would leave `import source` in the output, which
        // nothing downstream can parse — so this combination fails loudly rather than
        // quietly falling back to inlining the module.
        expect(binProcess.exitCode).not.toBe(0);
        expect(binProcess.stderr).toContain("cannot be combined with the source phase import");

        expect(existsSync(output)).toBe(false);
    });

    it("should survive a second build served from the file cache", async () => {
        expect.assertions(5);

        await createPackemConfig(temporaryDirectoryPath);

        // A source phase import is rewritten to a virtual module id. That id has to be a
        // pure function of the file it stands for: when the second build replays this
        // module's transform from the cache, nothing re-registers it, so an id carrying
        // per-build state (a counter, say) would name a module the process never created
        // and the build would fail with "Could not load".
        const output = await scaffold(`import source addModule from "./add.wasm";

export const result = new WebAssembly.Instance(addModule).exports.add(3, 4);`);

        const first = await execPackem("build", [], { cwd: temporaryDirectoryPath, reject: false });

        expect(first.stderr).toBe("");
        expect(first.exitCode).toBe(0);

        const second = await execPackem("build", [], { cwd: temporaryDirectoryPath, reject: false });

        expect(second.stderr).toBe("");
        expect(second.exitCode).toBe(0);

        const { result } = (await import(`${output}?cached`)) as { result: number };

        expect(result).toBe(7);
    });

    it("should leave the import untouched in preserve mode", async () => {
        expect.assertions(3);

        await createPackemConfig(temporaryDirectoryPath, { config: { rollup: { wasm: { mode: "preserve" } } } });

        const output = await scaffold(`import { add } from "./add.wasm";

export const sum = add(2, 3);`);

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath, reject: false });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const built = readFileSync(output);

        // The specifier survives verbatim for the downstream tool or runtime to resolve.
        // The bundler picks the quote style, so match either.
        expect(built).toMatch(PRESERVED_IMPORT);
    });
});
