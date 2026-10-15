import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "rollup";
import { rollup } from "rollup";
import { beforeEach, describe, expect, it } from "vitest";

import { getLanguageFingerprint } from "../src/custom-language.js";
import type { Options } from "../src/index.js";
import { dts } from "../src/index.js";
import { countSharedPrograms, getConfigKey, getSharedContext, resetSharedContexts } from "../src/tsc/context.js";
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

    it("has no id when the options hold a function, so the build gets a cache of its own", () => {
        expect.hasAssertions();

        expect(vueLanguageId({ vueCompilerOptions: { resolve: () => 1 } })).toBeUndefined();
        expect(getLanguageFingerprint({ vue: { vueCompilerOptions: { resolve: () => 1 } } })).toBeUndefined();
    });

    it("has no id when the options hold a symbol or a cycle", () => {
        expect.hasAssertions();

        const cyclic: { self?: unknown } = {};

        cyclic.self = cyclic;

        expect(vueLanguageId({ vueCompilerOptions: { marker: Symbol("marker") } })).toBeUndefined();
        expect(vueLanguageId({ vueCompilerOptions: cyclic })).toBeUndefined();
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

    it("drops the least recently used shared cache beyond the cap", () => {
        expect.hasAssertions();

        const oldest = getSharedContext("cap-0");

        for (let index = 1; index <= 8; index += 1) {
            getSharedContext(`cap-${String(index)}`);
        }

        expect(getSharedContext("cap-0")).not.toBe(oldest);
    });
});
