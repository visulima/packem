import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "rollup";
import { rollup } from "rollup";
import type ts from "typescript";
import { beforeEach, describe, expect, it } from "vitest";

import { getLanguageFingerprint } from "../src/custom-language.js";
import type { Options } from "../src/index.js";
import { dts } from "../src/index.js";
import { countSharedPrograms, getConfigKey, getSharedContext, MAX_SHARED_PROGRAMS, resetSharedContexts } from "../src/tsc/context.js";
import { vueLanguageId } from "../src/tsc/vue.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, "fixtures/program-cache");
const entry = path.resolve(root, "entry.ts");
const stripTsconfig = path.resolve(root, "strip.tsconfig.json");
const keepTsconfig = path.resolve(root, "keep.tsconfig.json");

const RE_HIDDEN = /\bhidden\b/;
const RE_INTERNAL_COMMENT = /@internal/;
const RE_CUSTOM = /\.custom$/;
const PATTERN_G = /a/g;
const PATTERN_I = /a/i;
const PATTERN_OTHER = /b/g;

// `stripInternal` is a program-level option: a program created under it drops `@internal` declarations from the declarations it
// emits. Two builds of the same entry that differ only in their compiler options therefore need separate programs, and the output
// shows which program a build used.
const buildCode = async (plugins: Plugin[]): Promise<string> => {
    const bundle = await rollup({ input: entry, plugins });

    try {
        const { output } = await bundle.generate({ format: "es" });

        return output
            .filter((item) => item.type === "chunk")
            .map((item) => item.code)
            .join("\n");
    } finally {
        await bundle.close();
    }
};

const baseOptions: Options = { emitDtsOnly: true, generator: "tsc", oxc: false };

describe("program cache", () => {
    beforeEach(() => {
        resetSharedContexts();
    });

    it("shares the program between builds with the same tsconfig and options", async () => {
        expect.hasAssertions();

        const first = await buildCode(dts({ ...baseOptions, tsconfig: keepTsconfig }));
        const programCount = countSharedPrograms();
        const second = await buildCode(dts({ ...baseOptions, tsconfig: keepTsconfig }));

        expect(programCount).toBeGreaterThan(0);
        expect(countSharedPrograms()).toBe(programCount);
        expect(second).toBe(first);
    });

    it("does not reuse a program built for another tsconfig", async () => {
        expect.hasAssertions();

        const stripped = await buildCode(dts({ ...baseOptions, tsconfig: stripTsconfig }));
        const kept = await buildCode(dts({ ...baseOptions, tsconfig: keepTsconfig }));

        expect(stripped).not.toMatch(RE_HIDDEN);
        expect(kept).toMatch(RE_HIDDEN);
    });

    it("does not reuse a program built with other compilerOptions for the same tsconfig", async () => {
        expect.hasAssertions();

        const kept = await buildCode(dts({ ...baseOptions, tsconfig: keepTsconfig }));
        const withoutComments = await buildCode(dts({ ...baseOptions, compilerOptions: { removeComments: true }, tsconfig: keepTsconfig }));

        expect(kept).toMatch(RE_INTERNAL_COMMENT);
        expect(withoutComments).not.toMatch(RE_INTERNAL_COMMENT);
    });

    it("does not reuse a program across tsconfigs when a custom language is used", async () => {
        expect.hasAssertions();

        const language = { extensionPatterns: [RE_CUSTOM], id: "program-cache-test" };
        const stripped = await buildCode(dts({ ...baseOptions, customLanguages: [language], tsconfig: stripTsconfig }));
        const kept = await buildCode(dts({ ...baseOptions, customLanguages: [language], tsconfig: keepTsconfig }));

        expect(stripped).not.toMatch(RE_HIDDEN);
        expect(kept).toMatch(RE_HIDDEN);
    });

    it("does not reuse a program across tsconfigs when the vue language is used", async () => {
        expect.hasAssertions();

        const stripped = await buildCode(dts({ ...baseOptions, tsconfig: stripTsconfig, vue: true }));
        const kept = await buildCode(dts({ ...baseOptions, tsconfig: keepTsconfig, vue: true }));

        expect(stripped).not.toMatch(RE_HIDDEN);
        expect(kept).toMatch(RE_HIDDEN);
    });
});

describe("vue language id", () => {
    it("is the same for equal options given in a different key order", () => {
        expect.hasAssertions();

        // The key order of the literals is the point of the test.
        // eslint-disable-next-line perfectionist/sort-objects
        expect(vueLanguageId({ vueCompilerOptions: { a: 1, b: 2 } })).toBe(vueLanguageId({ vueCompilerOptions: { b: 2, a: 1 } }));
    });

    it("tells apart an undefined property from a missing one", () => {
        expect.hasAssertions();

        expect(vueLanguageId({ vueCompilerOptions: undefined })).not.toBe(vueLanguageId({}));
    });

    it("tells apart NaN and null, which JSON.stringify both writes as null", () => {
        expect.hasAssertions();

        expect(vueLanguageId({ vueCompilerOptions: { value: NaN } })).not.toBe(vueLanguageId({ vueCompilerOptions: { value: null } }));
    });

    it("tells apart RegExp values by source and flags", () => {
        expect.hasAssertions();

        const plain = vueLanguageId({ vueCompilerOptions: { pattern: PATTERN_G } });

        expect(plain).not.toBe(vueLanguageId({ vueCompilerOptions: { pattern: PATTERN_I } }));
        expect(plain).not.toBe(vueLanguageId({ vueCompilerOptions: { pattern: PATTERN_OTHER } }));
        expect(plain).not.toBe(vueLanguageId({ vueCompilerOptions: { pattern: {} } }));
        expect(plain).toBe(vueLanguageId({ vueCompilerOptions: { pattern: PATTERN_G } }));
    });

    it("does not let a string collapse into a RegExp with the same text", () => {
        expect.hasAssertions();

        expect(vueLanguageId({ vueCompilerOptions: { pattern: "/a/g" } })).not.toBe(vueLanguageId({ vueCompilerOptions: { pattern: PATTERN_G } }));
    });

    it("keeps the identity of the options when they hold a function, so a repeated build still shares a cache", () => {
        expect.hasAssertions();

        const options = { vueCompilerOptions: { resolve: () => 1 } };

        expect(vueLanguageId(options)).toBe(vueLanguageId(options));
        // Another object with an equal function cannot be told apart from a changed one, so it gets its own id.
        expect(vueLanguageId(options)).not.toBe(vueLanguageId({ vueCompilerOptions: { resolve: () => 1 } }));
        expect(getLanguageFingerprint({ vue: options })).toBe(getLanguageFingerprint({ vue: options }));
    });

    it("keeps the identity of options that hold a symbol or a cycle", () => {
        expect.hasAssertions();

        const cyclic: { self?: unknown; vueCompilerOptions?: Record<string, unknown> } = {};
        const withSymbol = { vueCompilerOptions: { marker: Symbol("marker") } };

        cyclic.self = cyclic;

        expect(vueLanguageId(withSymbol)).toBe(vueLanguageId(withSymbol));
        expect(vueLanguageId(cyclic)).toBe(vueLanguageId(cyclic));
        expect(vueLanguageId(withSymbol)).not.toBe(vueLanguageId({ vueCompilerOptions: { marker: Symbol("marker") } }));
    });

    it("gives the same fingerprint for equal vue options and a different one for other options", () => {
        expect.hasAssertions();

        expect(getLanguageFingerprint({ vue: { vueCompilerOptions: { fallthroughAttributes: true } } })).toBe(
            getLanguageFingerprint({ vue: { vueCompilerOptions: { fallthroughAttributes: true } } }),
        );
        expect(getLanguageFingerprint({ vue: true })).not.toBe(getLanguageFingerprint({ vue: { vueCompilerOptions: { fallthroughAttributes: true } } }));
    });
});

describe("shared cache identity", () => {
    it("gives the same config key for equal raw configurations, whatever their key order", () => {
        expect.hasAssertions();

        const first = getConfigKey({ cwd: root, tsconfig: keepTsconfig, tsconfigRaw: { compilerOptions: { strict: true, target: "ESNext" } } });
        // The key order of the literal is the point of the test.
        // eslint-disable-next-line perfectionist/sort-objects
        const second = getConfigKey({ cwd: root, tsconfig: keepTsconfig, tsconfigRaw: { compilerOptions: { target: "ESNext", strict: true } } });

        expect(first).toBeDefined();
        expect(second).toBe(first);
    });

    it("gives a different config key for another tsconfig path or other compiler options", () => {
        expect.hasAssertions();

        const raw = { compilerOptions: { strict: true } };
        const base = getConfigKey({ cwd: root, tsconfig: keepTsconfig, tsconfigRaw: raw });

        expect(getConfigKey({ cwd: root, tsconfig: stripTsconfig, tsconfigRaw: raw })).not.toBe(base);
        expect(getConfigKey({ cwd: root, tsconfig: keepTsconfig, tsconfigRaw: { compilerOptions: { strict: false } } })).not.toBe(base);
    });

    it("gives a different config key when the files the configuration extends differ", () => {
        expect.hasAssertions();

        const raw = { compilerOptions: { strict: true } };
        const base = getConfigKey({ cwd: root, tsconfig: keepTsconfig, tsconfigChainKey: "chain-a", tsconfigRaw: raw });

        expect(base).not.toBe(getConfigKey({ cwd: root, tsconfig: keepTsconfig, tsconfigChainKey: "chain-b", tsconfigRaw: raw }));
        expect(base).toBe(getConfigKey({ cwd: root, tsconfig: keepTsconfig, tsconfigChainKey: "chain-a", tsconfigRaw: raw }));
    });

    it("keeps the identity of a configuration that holds a function or a cycle", () => {
        expect.hasAssertions();

        const raw = { compilerOptions: { transform: () => 1 } };
        const base = getConfigKey({ cwd: root, tsconfig: keepTsconfig, tsconfigRaw: raw });

        // The same object repeats across the modules of one build, so its programs are shared.
        expect(base).toBe(getConfigKey({ cwd: root, tsconfig: keepTsconfig, tsconfigRaw: raw }));
        // Another object is another configuration, even when it holds an equal function.
        expect(base).not.toBe(getConfigKey({ cwd: root, tsconfig: keepTsconfig, tsconfigRaw: { compilerOptions: { transform: () => 1 } } }));

        const cyclic: { compilerOptions?: unknown } = {};

        cyclic.compilerOptions = cyclic;
        expect(getConfigKey({ cwd: root, tsconfig: keepTsconfig, tsconfigRaw: cyclic })).toBe(
            getConfigKey({ cwd: root, tsconfig: keepTsconfig, tsconfigRaw: cyclic }),
        );
    });
});

describe("shared cache budget", () => {
    it("keeps a cache that holds no programs, however many builds run", () => {
        expect.hasAssertions();

        const oldest = getSharedContext("empty-0");

        for (let index = 1; index <= MAX_SHARED_PROGRAMS; index += 1) {
            getSharedContext(`empty-${String(index)}`);
        }

        expect(getSharedContext("empty-0")).toBe(oldest);
    });

    it("drops the least recently used cache once the retained programs pass the budget", () => {
        expect.hasAssertions();

        const coldest = getSharedContext("programs-0");

        coldest.programs.push(...Array.from({ length: MAX_SHARED_PROGRAMS }, () => ({}) as ts.Program));

        const warm = getSharedContext("programs-1");

        warm.programs.push({} as ts.Program);

        // The next build is what notices that the caches hold one program too many.
        getSharedContext("programs-2");

        expect(getSharedContext("programs-0")).not.toBe(coldest);
        expect(getSharedContext("programs-1")).toBe(warm);
    });
});
