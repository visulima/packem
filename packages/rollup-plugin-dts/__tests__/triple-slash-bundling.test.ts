import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rollupBuild } from "@sxzz/test-utils";
import type { OutputChunk } from "rollup";
import { rollup } from "rollup";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dts } from "../src/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (...segments: string[]) => path.resolve(dirname, "fixtures/triple-slash-bundling", ...segments);
const temporaryDirectory = path.join(dirname, "temp/triple-slash-bundling");

// Diagnostics of the given declaration files, checked with `skipLibCheck` off so the `.d.ts` files are type-checked too.
const diagnosticsOf = (files: string[]): ts.Diagnostic[] => {
    const program = ts.createProgram(files, { noEmit: true, skipLibCheck: false, types: [] });

    return [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics(), ...program.getGlobalDiagnostics()];
};

const build = (entry: string) =>
    rollupBuild(fixture(entry), [
        dts({
            dtsInput: true,
            emitDtsOnly: true,
            sourcemap: false,
            tsconfig: false,
        }),
    ]);

const OUTER_DIRECTIVE_RE = /\/\/\/ <reference path="[^"]*outer\.d\.ts" \/>/u;
const MISSING_DIRECTIVE_RE = /\/\/\/ <reference path="[^"]*missing\.d\.ts" \/>/u;
const MODULE_DIRECTIVE_RE = /\/\/\/ <reference path="[^"]*module\.d\.ts" \/>/u;
const IMPORT_TYPE_DIRECTIVE_RE = /\/\/\/ <reference path="[^"]*import-type\.d\.ts" \/>/u;
const STRING_MODULE_DIRECTIVE_RE = /\/\/\/ <reference path="[^"]*string-module\.d\.ts" \/>/u;
const SHARED_OWNER_FILE_RE = /^common-.*\.d\.ts$/u;
const SHARED_OWNER_DIRECTIVE_RE = /\/\/\/ <reference path="\.\/common-[^"]+\.d\.ts" \/>/u;

const countOf = (text: string, needle: string): number => text.split(needle).length - 1;

describe("triple-slash reference bundling", () => {
    it("inlines a referenced global script into a script output without wrapping it", async () => {
        expect.assertions(6);

        const { snapshot } = await build("script-entry/index.d.ts");

        expect(snapshot).toContain("interface Foo");
        expect(snapshot).toContain("type Maybe = Foo | undefined;");
        // `declare` semantics are kept: the script output is already global
        expect(snapshot).toContain("declare function makeFoo(): Foo;");
        expect(snapshot).toContain("declare const VERSION: string;");
        expect(snapshot).not.toContain("declare global");
        // the consumed directive is removed, not rebased
        expect(snapshot).not.toContain("reference path");
    });

    it("inlines with source maps enabled", async () => {
        expect.assertions(2);

        const { snapshot } = await rollupBuild(fixture("module-entry/index.d.ts"), [
            dts({ dtsInput: true, emitDtsOnly: true, sourcemap: true, tsconfig: false }),
        ]);

        expect(snapshot).toContain("declare global {");
        expect(snapshot).toContain("interface Foo");
    });

    it("wraps the inlined declarations in `declare global` when the output is a module", async () => {
        expect.assertions(5);

        const { snapshot } = await build("module-entry/index.d.ts");

        expect(snapshot).toContain("declare global {");
        expect(snapshot).toContain("interface Foo");
        // `declare` is dropped inside the ambient `declare global` block
        expect(snapshot).toContain("function makeFoo(): Foo;");
        expect(snapshot).not.toContain("declare function makeFoo");
        expect(snapshot).not.toContain("reference path");
    });

    it("inlines a script referenced by several modules once", async () => {
        expect.assertions(3);

        const { snapshot } = await build("dedupe-entry/index.d.ts");

        expect(countOf(snapshot, "interface Foo")).toBe(1);
        expect(countOf(snapshot, "declare global {")).toBe(1);
        expect(countOf(snapshot, "reference path")).toBe(0);
    });

    it("keeps a reference to a script that has a directive of its own (limit: no transitive inlining)", async () => {
        expect.assertions(3);

        const { snapshot } = await build("transitive/index.d.ts");

        // rebased to the output location, which is the test working directory here
        expect(snapshot).toMatch(OUTER_DIRECTIVE_RE);
        expect(snapshot).not.toContain("interface Outer");
        expect(snapshot).not.toContain("interface Inner");
    });

    describe("several entries referencing one script", () => {
        beforeAll(async () => {
            await rm(temporaryDirectory, { force: true, recursive: true });
            await mkdir(temporaryDirectory, { recursive: true });
        });

        afterAll(async () => {
            await rm(temporaryDirectory, { force: true, recursive: true });
        });

        it("inlines the shared script into one chunk and references that chunk from the others", async () => {
            expect.assertions(6);

            const bundle = await rollup({
                input: { a: fixture("dedupe-entry/a.d.ts"), b: fixture("dedupe-entry/b.d.ts") },
                plugins: [dts({ dtsInput: true, emitDtsOnly: true, sourcemap: false, tsconfig: false })],
            });

            await bundle.write({ dir: temporaryDirectory, format: "es" });
            await bundle.close();

            const aCode = await readFile(path.join(temporaryDirectory, "a.d.ts"), "utf8");
            const bCode = await readFile(path.join(temporaryDirectory, "b.d.ts"), "utf8");

            // `a` sorts first, so it owns the copy of the script; `b` points at it instead of declaring it again.
            expect(aCode).toContain("interface Foo");
            expect(bCode).not.toContain("interface Foo");
            expect(bCode).toContain('/// <reference path="./a.d.ts" />');
            expect(bCode).not.toContain("declare global");
            // Both entries load together without duplicate declarations.
            expect(diagnosticsOf([path.join(temporaryDirectory, "a.d.ts"), path.join(temporaryDirectory, "b.d.ts")])).toHaveLength(0);
            // `b` alone still sees `Foo` and `Maybe` through the reference.
            expect(diagnosticsOf([path.join(temporaryDirectory, "b.d.ts")])).toHaveLength(0);
        });

        it("hands the shared script to the chunk both entries already import", async () => {
            expect.assertions(6);

            const outputDirectory = path.join(temporaryDirectory, "shared-owner");

            const bundle = await rollup({
                input: { a: fixture("shared-owner/a.d.ts"), b: fixture("shared-owner/b.d.ts") },
                plugins: [dts({ dtsInput: true, emitDtsOnly: true, sourcemap: false, tsconfig: false })],
            });

            const { output } = await bundle.write({ dir: outputDirectory, format: "es" });

            await bundle.close();

            const chunks = output.filter((item): item is OutputChunk => item.type === "chunk");
            const codeOf = (name: string): string => chunks.find((chunk) => chunk.fileName === name)?.code ?? "";
            const owner = chunks.find((chunk) => chunk.code.includes("interface Foo"));

            // `common` is imported by both entries, so it sits below them in the import order and owns the copy.
            expect(owner?.fileName).toMatch(SHARED_OWNER_FILE_RE);
            expect(codeOf("a.d.ts")).toMatch(SHARED_OWNER_DIRECTIVE_RE);
            expect(codeOf("b.d.ts")).toMatch(SHARED_OWNER_DIRECTIVE_RE);
            // Owner names are placeholders until rollup assigns hashes; none may survive into the directive.
            expect(chunks.some((chunk) => chunk.code.includes("!~{"))).toBe(false);
            // Each entry, on its own, still loads cleanly through the shared chunk.
            expect(diagnosticsOf([path.join(outputDirectory, "a.d.ts")])).toHaveLength(0);
            expect(diagnosticsOf([path.join(outputDirectory, "b.d.ts")])).toHaveLength(0);
        });
    });

    describe("rendering the same bundle again", () => {
        beforeAll(async () => {
            await rm(temporaryDirectory, { force: true, recursive: true });
            await mkdir(temporaryDirectory, { recursive: true });
        });

        afterAll(async () => {
            await rm(temporaryDirectory, { force: true, recursive: true });
        });

        it("keeps the reference directives in a second generate of the same bundle", async () => {
            expect.assertions(2);

            const bundle = await rollup({
                input: fixture("fallback/index.d.ts"),
                plugins: [dts({ dtsInput: true, emitDtsOnly: true, sourcemap: false, tsconfig: false })],
            });

            const first = await bundle.generate({ format: "es" });
            const second = await bundle.generate({ format: "es" });

            await bundle.close();

            expect(first.output[0].code).toContain('/// <reference types="node" />');
            expect(second.output[0].code).toContain('/// <reference types="node" />');
        });

        it("drops a directive that a re-transformed module no longer has", async () => {
            expect.assertions(2);

            const entry = path.join(temporaryDirectory, "rebuild.d.ts");
            const plugin = dts({ dtsInput: true, emitDtsOnly: true, sourcemap: false, tsconfig: false });

            await writeFile(entry, '/// <reference types="node" />\n\nexport declare const value: number;\n');

            const first = await rollup({ input: entry, plugins: [plugin] });

            const firstOutput = await first.generate({ format: "es" });

            expect(firstOutput.output[0].code).toContain('/// <reference types="node" />');

            // Simulates watch mode: the module is re-transformed with its directive removed, the rest of the bundle is cached.
            await writeFile(entry, "export declare const value: number;\n");

            const second = await rollup({ cache: first.cache, input: entry, plugins: [plugin] });
            const secondOutput = await second.generate({ format: "es" });

            expect(secondOutput.output[0].code).not.toContain("reference types");

            await second.close();
            await first.close();
        });
    });

    it("keeps missing, module, unsafe-script, types and lib references", async () => {
        expect.assertions(8);

        const { snapshot } = await build("fallback/index.d.ts");

        expect(snapshot).toMatch(MISSING_DIRECTIVE_RE);
        // a file with exports is a module, not a global script
        expect(snapshot).toMatch(MODULE_DIRECTIVE_RE);
        // scripts with an `import()` type or a string-named module are not inlined
        expect(snapshot).toMatch(IMPORT_TYPE_DIRECTIVE_RE);
        expect(snapshot).toMatch(STRING_MODULE_DIRECTIVE_RE);
        expect(snapshot).toContain('/// <reference types="node" />');
        expect(snapshot).toContain('/// <reference lib="es2015" />');
        expect(snapshot).not.toContain("declare global");
        expect(snapshot).not.toContain("interface Wrapped");
    });
});
