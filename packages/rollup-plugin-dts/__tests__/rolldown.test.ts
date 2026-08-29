/**
 * Rolldown compatibility test lane for \@visulima/rollup-plugin-dts.
 *
 * Covers the 4 fixtures the plan-012 spike validated under rolldown 1.x, each
 * in both emitDtsOnly modes.  Uses explicit `toContain` assertions (not
 * snapshots) because rolldown embeds //#region comments with absolute paths
 * that make snapshots machine/worktree-sensitive.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { OutputChunk } from "rolldown";
import { rolldown } from "rolldown";
import { afterEach, describe, expect, it } from "vitest";

import { dts } from "../src/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDirectory = path.resolve(dirname, "fixtures");

// #240: JSDoc recovered for a re-export lands on the specifier, so the comment is followed by
// (whitespace and) the exported name. The optional `type ` covers rolldown's inline type modifier.
const REEXPORT_JSDOC_PROBES = [
    /\/\*\* @deprecated Import from `some-other-package` instead\. \*\/\s*legacyHelper\b/u,
    /\/\*\* @deprecated Use `NewOptions` instead\. \*\/\s*type LegacyOptions\b/u,
    /\/\*\* @deprecated Re-exported from an external package\. \*\/\s*(?:type )?Plugin\b/u,
    /\/\*\* @deprecated Also from the same external package\. \*\/\s*(?:type )?RollupOptions\b/u,
    /\/\*\* @deprecated Written inside the braces\. \*\/\s*renamedHelper as aliasedHelper\b/u,
    /\/\*\* @deprecated A local binding exported through a specifier\. \*\/\s*localHelper\b/u,
    /\/\*\* @deprecated The whole namespace is going away\. \*\/\s*\w+ as helpers\b/u,
    /\/\*\* Doc written on the declaration itself\. \*\/\s*(?:type )?DocumentedOptions\b/u,
];

// ---------------------------------------------------------------------------
// Minimal inline helper (mirrors @sxzz/test-utils rolldownBuild but lives
// here so we don't depend on test-utils for the rolldown import path).
// ---------------------------------------------------------------------------
interface BuildResult {
    chunks: OutputChunk[];
    dtsChunks: OutputChunk[];
}

const rolldownBuildHelper = async (input: string | string[] | Record<string, string>, pluginOptions: Parameters<typeof dts>[0] = {}): Promise<BuildResult> => {
    const bundle = await rolldown({
        checks: { pluginTimings: false },
        input,
        onwarn(warning, defaultHandler) {
            if (["UNRESOLVED_IMPORT", "UNUSED_EXTERNAL_IMPORT"].includes(warning.code ?? "")) return;

            defaultHandler(warning);
        },
        plugins: [dts(pluginOptions)],
        treeshake: false,
    });

    const { output } = await bundle.generate({
        format: "esm",
        sourcemap: false,
    });

    const chunks = output.filter((o): o is OutputChunk => o.type === "chunk");
    const dtsChunks = chunks.filter((c) => c.fileName.endsWith(".d.ts") || c.fileName.endsWith(".d.mts") || c.fileName.endsWith(".d.cts"));

    return { chunks, dtsChunks };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dts plugin – rolldown compat", () => {
    afterEach(() => {
        // no temp dirs to clean up (in-memory generate only)
    });

    describe("minimal.ts", () => {
        it("emitDtsOnly: false – does not throw and emits a .d.ts chunk", async () => {
            expect.assertions(2);

            const { dtsChunks } = await rolldownBuildHelper(path.resolve(fixturesDirectory, "minimal.ts"), { emitDtsOnly: false });

            expect(dtsChunks.length).toBeGreaterThan(0);

            expect(dtsChunks[0]?.code).toContain("function foo");
        });

        it("emitDtsOnly: true – does not throw and emits a .d.ts chunk", async () => {
            expect.assertions(2);

            const { dtsChunks } = await rolldownBuildHelper(path.resolve(fixturesDirectory, "minimal.ts"), { emitDtsOnly: true });

            expect(dtsChunks.length).toBeGreaterThan(0);

            expect(dtsChunks[0]?.code).toContain("function foo");
        });
    });

    describe("basic.ts", () => {
        it("emitDtsOnly: false – emits expected declarations", async () => {
            expect.assertions(4);

            const { dtsChunks } = await rolldownBuildHelper(path.resolve(fixturesDirectory, "basic.ts"), { emitDtsOnly: false });

            expect(dtsChunks.length).toBeGreaterThan(0);

            const code = dtsChunks[0]?.code ?? "";

            expect(code).toContain("const foo");
            expect(code).toContain("function fn");
            expect(code).toContain("declare class Cls");
        });

        it("emitDtsOnly: true – emits expected declarations", async () => {
            expect.assertions(4);

            const { dtsChunks } = await rolldownBuildHelper(path.resolve(fixturesDirectory, "basic.ts"), { emitDtsOnly: true });

            expect(dtsChunks.length).toBeGreaterThan(0);

            const code = dtsChunks[0]?.code ?? "";

            expect(code).toContain("const foo");
            expect(code).toContain("function fn");
            expect(code).toContain("declare class Cls");
        });
    });

    describe("function-overloads.ts", () => {
        it("emitDtsOnly: false – emits both overload signatures", async () => {
            expect.assertions(3);

            const { dtsChunks } = await rolldownBuildHelper(path.resolve(fixturesDirectory, "function-overloads.ts"), { emitDtsOnly: false });

            expect(dtsChunks.length).toBeGreaterThan(0);

            const code = dtsChunks[0]?.code ?? "";

            // Both overload signatures must be present
            expect(code).toContain("function useConfig(): Config");
            expect(code).toContain("function useConfig<T>(selector: (config: Config) => T): T");
        });

        it("emitDtsOnly: true – emits both overload signatures", async () => {
            expect.assertions(3);

            const { dtsChunks } = await rolldownBuildHelper(path.resolve(fixturesDirectory, "function-overloads.ts"), { emitDtsOnly: true });

            expect(dtsChunks.length).toBeGreaterThan(0);

            const code = dtsChunks[0]?.code ?? "";

            expect(code).toContain("function useConfig(): Config");
            expect(code).toContain("function useConfig<T>(selector: (config: Config) => T): T");
        });
    });

    describe("cyclic-import/ (multi-entry)", () => {
        it("emitDtsOnly: false – emits .d.ts chunks for both entries", async () => {
            expect.assertions(4);

            const root = path.resolve(fixturesDirectory, "cyclic-import");
            const { dtsChunks } = await rolldownBuildHelper(
                {
                    a: path.resolve(root, "a.ts"),
                    b: path.resolve(root, "b.ts"),
                },
                { emitDtsOnly: false },
            );

            const dtsNames = dtsChunks.map((c) => c.fileName);

            expect(dtsChunks.length).toBeGreaterThan(0);
            expect(dtsNames.some((n) => n.startsWith("a"))).toBe(true);
            expect(dtsNames.some((n) => n.startsWith("b"))).toBe(true);

            const allCode = dtsChunks.map((c) => c.code).join("\n");

            expect(allCode).toContain("SomeInterface");
        });

        it("emitDtsOnly: true – emits .d.ts chunks for both entries", async () => {
            expect.assertions(4);

            const root = path.resolve(fixturesDirectory, "cyclic-import");
            const { dtsChunks } = await rolldownBuildHelper(
                {
                    a: path.resolve(root, "a.ts"),
                    b: path.resolve(root, "b.ts"),
                },
                { emitDtsOnly: true },
            );

            const dtsNames = dtsChunks.map((c) => c.fileName);

            expect(dtsChunks.length).toBeGreaterThan(0);
            expect(dtsNames.some((n) => n.startsWith("a"))).toBe(true);
            expect(dtsNames.some((n) => n.startsWith("b"))).toBe(true);

            const allCode = dtsChunks.map((c) => c.code).join("\n");

            expect(allCode).toContain("SomeInterface");
        });
    });

    // Regression: the virtual-module guard must allow rolldown's runtime
    // module (\0rolldown/runtime.js) to pass through untouched.
    // This is implicitly verified by any of the above tests not crashing with
    // RUNTIME_MODULE_SYMBOL_NOT_FOUND, but we make it explicit here.
    it("virtual-module guard – emitDtsOnly: true does not crash with rolldown runtime", async () => {
        expect.assertions(1);

        // basic.ts in emitDtsOnly mode is the scenario that previously crashed:
        // every non-DTS module returned "export { }" including \0rolldown/runtime.js.
        await expect(rolldownBuildHelper(path.resolve(fixturesDirectory, "basic.ts"), { emitDtsOnly: true })).resolves.not.toThrow();
    });

    // Regression: as of rolldown 1.1.5 only the FIRST declarator of a `var` statement goes
    // through the identifier renamer. When a declaration bound several names at once
    // (`declare const first: T, second: T`) and a later module declared the same names, the
    // 2nd+ binding kept its original name while the export list referenced the renamed one —
    // producing a `.d.ts` that declared `second` twice and exported an undeclared `second$1`.
    // All bindings now live in one array-pattern declarator so every one is renamed.
    // See sxzz/rolldown-plugin-dts@30104ca.
    it("renames every binding of a multi-binding declaration on collision", async () => {
        expect.assertions(2);

        const { dtsChunks } = await rolldownBuildHelper(path.resolve(fixturesDirectory, "multi-binding-collide/index.ts"), { emitDtsOnly: true });
        const code = dtsChunks.map((c) => c.code).join("\n");

        // BOTH bindings of the colliding declaration must be renamed. Before the fix this
        // emitted `declare const first$1: Shape, second: Shape;` — `second` left un-renamed,
        // duplicating the `second` from the other module.
        expect(code).toContain("declare const first$1: Shape, second$1: Shape;");

        // ...and the export list must reference those declared names. Before the fix it
        // exported `second$1`, which no declaration introduced.
        expect(code).toContain("second$1 as bSecond");
    });

    // Regression for #240: leading JSDoc on `export { … } from "…"` was dropped from the emitted
    // declarations. Recovery happens in the shared fake-JS pass, but rolldown lays the chunk out
    // differently from rollup (inline `type X` modifiers instead of a hoisted `export type { … }`,
    // its own renaming), so the by-name re-attachment is pinned here too.
    it("keeps the JSDoc of re-export statements", async () => {
        expect.assertions(REEXPORT_JSDOC_PROBES.length);

        const { dtsChunks } = await rolldownBuildHelper(path.resolve(fixturesDirectory, "jsdoc-reexport/index.ts"), { emitDtsOnly: true, oxc: true });
        const code = dtsChunks.map((c) => c.code).join("\n");

        for (const probe of REEXPORT_JSDOC_PROBES) {
            expect(code).toMatch(probe);
        }
    });
});
