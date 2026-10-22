import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rollupBuild } from "@sxzz/test-utils";
import { describe, expect, it, vi } from "vitest";

import { dts } from "../src/index.js";
import { getTsgoPathFromNodeModules } from "../src/tsgo.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (...segments: string[]) => path.resolve(dirname, "fixtures/declaration-bundling", ...segments);

const SOURCE_MAPPING_URL_RE = /sourceMappingURL/u;
const NAMESPACE_BLOCK_RE = /declare namespace simple_d \{\s*export \{ foo \};\s*\}/u;
const IOS_RE = /v: ["']ios["']/u;
const BASE_RE = /v: ["']base["']/u;
const COMPOSITE_ROOT_WARNING_RE = /composite-refs-incremental\/tsconfig\.json/u;

describe("declaration bundling fixes", () => {
    it("bundles `import x = require()` as a namespace import and keeps `export import`", async () => {
        expect.assertions(4);

        const { snapshot } = await rollupBuild(fixture("import-equals/import-equals.ts"), [dts({ emitDtsOnly: true, generator: "oxc" })]);

        // a default import would demand a `default` export that `simple.ts` does not have
        expect(snapshot).toContain("declare namespace simple_d");
        expect(snapshot).toContain("simple_d as simple");
        expect(snapshot).toContain("simple_d as simple2");
        expect(snapshot).toContain("import * as externalVue");
    });

    it("binds the exported value when `import x = require()` targets an `export =` module", async () => {
        expect.assertions(2);

        const { snapshot } = await rollupBuild(fixture("export-assignment/consumer.d.ts"), [dts({ dtsInput: true, emitDtsOnly: true })]);

        expect(snapshot).toContain("declare const f: typeof foo;");
        expect(snapshot).not.toContain("namespace");
    });

    it.each([
        ["freeze: false", { freeze: false }],
        ["generatedCode.symbols", { generatedCode: { symbols: true } }],
        ["both", { freeze: false, generatedCode: { symbols: true } }],
    ])("emits a namespace declaration whatever the rollup namespace shape (%s)", async (_name, output) => {
        expect.assertions(1);

        const { snapshot } = await rollupBuild(fixture("import-equals/import-equals.ts"), [dts({ emitDtsOnly: true, generator: "oxc" })], {}, output);

        expect(snapshot).toMatch(NAMESPACE_BLOCK_RE);
    });

    it("emits a declaration for a namespace re-export", async () => {
        expect.assertions(1);

        const { snapshot } = await rollupBuild(fixture("import-equals/import-equals.ts"), [dts({ emitDtsOnly: true, generator: "oxc" })]);

        expect(snapshot).toMatch(NAMESPACE_BLOCK_RE);
    });

    it("does not let a nested type parameter shadow a same-named import", async () => {
        expect.assertions(3);

        const { snapshot } = await rollupBuild(fixture("type-param-shadow/index.d.ts"), [dts({ dtsInput: true, emitDtsOnly: true })]);

        expect(snapshot).toContain("interface Struct<Fields>");
        expect(snapshot).toContain("interface Str");
        expect(snapshot).toContain("pipe<A, S = never>(this: A, ab: (_: A) => S): S;");
    });

    it("keeps `typeof X` of a global value when the imported `X` is only a type", async () => {
        expect.assertions(2);

        const { snapshot } = await rollupBuild(fixture("typeof-global/index.d.ts"), [dts({ dtsInput: true, emitDtsOnly: true, tsconfig: false })]);

        expect(snapshot).toContain("Response?: typeof Response;");
        expect(snapshot).not.toContain("typeof TypedResponse");
    });

    it("keeps an entry's file doc comment that sits before an import", async () => {
        expect.assertions(3);

        const { snapshot } = await rollupBuild(fixture("file-doc-comment/index.ts"), [dts({ emitDtsOnly: true, generator: "oxc" })]);

        expect(snapshot).toContain("Docs for this entry point.");
        expect(snapshot).toContain("@module");
        expect(snapshot).not.toContain("Inlined module docs.");
    });

    it("resolves relative imports through tsconfig `moduleSuffixes`", async () => {
        expect.assertions(2);

        const { snapshot } = await rollupBuild(fixture("module-suffixes/src/b.ts"), [
            dts({ emitDtsOnly: true, generator: "oxc", tsconfig: fixture("module-suffixes/tsconfig.json") }),
        ]);

        expect(snapshot).toMatch(IOS_RE);
        expect(snapshot).not.toMatch(BASE_RE);
    });
});

describe("sourcemap fixes", () => {
    it("leaves no sourceMappingURL comment when declaration maps are off", async () => {
        expect.assertions(2);

        const { chunks, snapshot } = await rollupBuild(
            fixture("file-doc-comment/index.ts"),
            [dts({ emitDtsOnly: true, generator: "oxc", sourcemap: false })],
            {},
            { sourcemap: true },
        );

        expect(snapshot).not.toMatch(SOURCE_MAPPING_URL_RE);
        expect(chunks.some((chunk) => chunk.fileName.endsWith(".d.ts.map"))).toBe(false);
    });

    it("does not break the output sourcemap for an empty dts chunk", async () => {
        expect.assertions(2);

        const warnings: string[] = [];

        await rollupBuild(
            fixture("empty-chunk/index.ts"),
            [dts({ generator: "oxc" })],
            {
                onLog: (level: string, log: { code?: string }) => {
                    if (level === "warn" && log.code) warnings.push(log.code);
                },
            },
            { preserveModules: true, sourcemap: true },
        );

        expect(warnings).not.toContain("SOURCEMAP_BROKEN");
        expect(warnings).toHaveLength(0);
    });
});

describe("build mode", () => {
    it("does not warn about a solution tsconfig that only holds references", async () => {
        expect.assertions(1);

        const root = path.resolve(dirname, "fixtures/composite-refs-incremental");

        await rm(path.resolve(root, "temp"), { force: true, recursive: true });

        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        try {
            await rollupBuild(
                [path.resolve(root, "dir1/input1.ts"), path.resolve(root, "dir2/input2.ts")],
                [dts({ build: true, compilerOptions: { isolatedDeclarations: false }, tsconfig: path.resolve(root, "tsconfig.json") })],
            );

            expect(warn.mock.calls.map((call) => String(call[0])).filter((message) => COMPOSITE_ROOT_WARNING_RE.test(message))).toStrictEqual([]);
        } finally {
            warn.mockRestore();
        }
    });
});

describe("tsgo", () => {
    it("does not emit declarations next to sources outside the tsconfig directory", async () => {
        expect.assertions(2);

        const stray = fixture("tsgo-outside-root/shared/greet.d.ts");

        await rm(stray, { force: true });

        try {
            const { snapshot } = await rollupBuild(fixture("tsgo-outside-root/pkg/index.ts"), [
                dts({
                    emitDtsOnly: true,
                    generator: "tsgo",
                    tsconfig: fixture("tsgo-outside-root/pkg/tsconfig.json"),
                    tsgo: { path: getTsgoPathFromNodeModules() },
                }),
            ]);

            expect(snapshot).toContain("interface Greeting");
            expect(existsSync(stray)).toBe(false);
        } finally {
            await rm(stray, { force: true });
        }
    });
});
