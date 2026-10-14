import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rollupBuild } from "@sxzz/test-utils";
import type { Plugin } from "rollup";
import type ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { filenameToDts } from "../src/filename.js";
import type { CustomLanguage } from "../src/index.js";
import { createTsMacroLanguage, createVueLanguage, dts, resolveOptions } from "../src/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const RE_CUSTOM = /\.custom$/;
const RE_ASTRO = /\.astro$/;
const RE_TSGO_CUSTOM_UNSUPPORTED = /does not support custom languages/;
const RE_VOLAR_NEEDS_TSC = /require the `tsc` generator/;
const RE_TYPESCRIPT_7 = /TypeScript 7/;

// Builds in one process share a TypeScript program cache, which ignores the vue and tsMacro options.
// A fresh context per build makes each option set take effect.
const isolatedDts = (options: Parameters<typeof dts>[0] = {}): Plugin[] => dts({ newContext: true, ...options });

// A language that needs no Volar: its files are TypeScript once `toTsFilename` maps them.
const createCustomLanguage = (): CustomLanguage => {
    return {
        extensionPatterns: [RE_CUSTOM],
        toTsFilename: (id: string): string => id.replace(RE_CUSTOM, ".custom.ts"),
        tsFileExtensionInfos: [
            {
                extension: "custom",
                isMixedContent: true,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-assignment -- `ScriptKind.Deferred` is `7`
                scriptKind: 7 satisfies ts.ScriptKind.Deferred,
            },
        ],
    };
};

// Moves the `<script>` block of a `.custom` file into the module code before declarations are generated.
const convertCustomToTs = (): Plugin => {
    return {
        name: "convert-custom-to-ts",
        transform: {
            handler(code, id) {
                if (!RE_CUSTOM.test(id)) {
                    return null;
                }

                return code.replace("<script>", "").replace("</script>", "");
            },
            order: "pre",
        },
    };
};

type AstroPlugin = Extract<ReturnType<NonNullable<CustomLanguage["createVolarPlugins"]>>, unknown[]>[number];

// Only called when `@astrojs/ts-plugin` is installed; the Astro test is skipped otherwise.
const createAstroLanguage = (): CustomLanguage => {
    /* eslint-disable import/no-dynamic-require -- the Astro tooling is optional and loaded only when installed */
    const { getLanguagePlugin } = require("@astrojs/ts-plugin/dist/language.js") as { getLanguagePlugin: () => AstroPlugin };
    const plugin = getLanguagePlugin();
    const volarTypeScript = require(require.resolve("@volar/typescript", { paths: [require.resolve("@astrojs/ts-plugin")] })) as CustomLanguage["volarTypeScript"];
    /* eslint-enable import/no-dynamic-require */

    return {
        createVolarPlugins: () => [plugin],
        extensionPatterns: [RE_ASTRO],
        toTsFilename: (id: string): string => id.replace(RE_ASTRO, ".astro.ts"),
        volarTypeScript,
    };
};

const createLogger = () => {
    return {
        error: vi.fn<(...args: unknown[]) => void>(),
        info: vi.fn<(...args: unknown[]) => void>(),
        warn: vi.fn<(...args: unknown[]) => void>(),
    };
};

const hasAstroTsPlugin = ((): boolean => {
    try {
        require.resolve("@astrojs/ts-plugin");

        return true;
    } catch {
        return false;
    }
})();

describe("custom languages", () => {
    describe("vue shortcut", () => {
        it("accepts vueCompilerOptions overrides", async () => {
            expect.assertions(2);

            const root = path.resolve(dirname, "fixtures/vue-sfc-fallthrough");
            const entry = path.resolve(root, "main.ts");

            // `fallthroughAttributes` is set in the tsconfig of this fixture.
            const fromTsconfig = await rollupBuild(entry, [
                isolatedDts({ emitDtsOnly: true, tsconfig: path.resolve(root, "tsconfig.json"), vue: true }),
            ]);
            const fromOverride = await rollupBuild(entry, [
                isolatedDts({ emitDtsOnly: true, tsconfig: false, vue: { vueCompilerOptions: { fallthroughAttributes: true } } }),
            ]);
            const withDefaults = await rollupBuild(entry, [isolatedDts({ emitDtsOnly: true, tsconfig: false, vue: true })]);

            expect(fromOverride.snapshot).toBe(fromTsconfig.snapshot);
            expect(fromOverride.snapshot).not.toBe(withDefaults.snapshot);
        });

        it("lets an override win over the value in the tsconfig", async () => {
            expect.assertions(1);

            const root = path.resolve(dirname, "fixtures/vue-sfc-fallthrough");
            const entry = path.resolve(root, "main.ts");

            const overridden = await rollupBuild(entry, [
                isolatedDts({
                    emitDtsOnly: true,
                    tsconfig: path.resolve(root, "tsconfig.json"),
                    vue: { vueCompilerOptions: { fallthroughAttributes: false } },
                }),
            ]);
            const withDefaults = await rollupBuild(entry, [isolatedDts({ emitDtsOnly: true, tsconfig: false, vue: true })]);

            expect(overridden.snapshot).toBe(withDefaults.snapshot);
        });

        it("keeps the vue shortcut working on the parallel worker", async () => {
            expect.assertions(1);

            const root = path.resolve(dirname, "fixtures/vue-sfc");
            const entry = path.resolve(root, "main.ts");

            // The shortcut is plain data, so it crosses the worker boundary and the worker rebuilds the language itself.
            const inProcess = await rollupBuild(entry, [
                isolatedDts({ compilerOptions: { isolatedDeclarations: false }, emitDtsOnly: true, vue: true }),
            ]);
            const parallel = await rollupBuild(entry, [
                isolatedDts({ compilerOptions: { isolatedDeclarations: false }, emitDtsOnly: true, parallel: true, vue: true }),
            ]);

            expect(parallel.snapshot).toBe(inProcess.snapshot);
        }, 60_000);
    });

    describe("customLanguages", () => {
        it("produces the same declarations as the vue shortcut", async () => {
            expect.assertions(1);

            const root = path.resolve(dirname, "fixtures/vue-sfc");
            const entry = path.resolve(root, "main.ts");

            const shortcut = await rollupBuild(entry, [
                isolatedDts({ compilerOptions: { isolatedDeclarations: false }, emitDtsOnly: true, vue: true }),
            ]);
            const custom = await rollupBuild(entry, [
                isolatedDts({ compilerOptions: { isolatedDeclarations: false }, customLanguages: [createVueLanguage()], emitDtsOnly: true }),
            ]);

            expect(custom.snapshot).toBe(shortcut.snapshot);
        });

        it("produces the same declarations as the tsMacro shortcut", async () => {
            expect.assertions(1);

            const root = path.resolve(dirname, "fixtures/ts-macro");
            const entry = path.resolve(root, "main.ts");
            const tsconfig = path.resolve(root, "tsconfig.json");

            const shortcut = await rollupBuild(entry, [isolatedDts({ emitDtsOnly: true, tsconfig, tsMacro: true })]);
            const custom = await rollupBuild(entry, [isolatedDts({ customLanguages: [createTsMacroLanguage()], emitDtsOnly: true, tsconfig })]);

            expect(custom.snapshot).toBe(shortcut.snapshot);
        });

        it.each(["oxc", "tsc"] as const)("builds a language without Volar with the %s generator", async (generator) => {
            expect.assertions(1);

            const root = path.resolve(dirname, "fixtures/custom-languages/custom");
            const { snapshot } = await rollupBuild(path.resolve(root, "main.ts"), [
                convertCustomToTs(),
                isolatedDts({ customLanguages: [createCustomLanguage()], emitDtsOnly: true, generator }),
            ]);

            expect(snapshot).toMatchSnapshot();
        });

        it.skipIf(!hasAstroTsPlugin)("builds an Astro file through Volar", async () => {
            expect.assertions(1);

            const root = path.resolve(dirname, "fixtures/custom-languages/astro");
            const { snapshot } = await rollupBuild(path.resolve(root, "main.ts"), [
                isolatedDts({ customLanguages: [createAstroLanguage()], emitDtsOnly: true }),
            ]);

            expect(snapshot).toMatchSnapshot();
        });
    });

    describe("validation", () => {
        it("rejects custom languages with the tsgo generator", () => {
            expect.assertions(2);

            expect(() => resolveOptions({ customLanguages: [createCustomLanguage()], generator: "tsgo", tsconfig: false })).toThrow(
                RE_TSGO_CUSTOM_UNSUPPORTED,
            );
            expect(() => resolveOptions({ customLanguages: [createCustomLanguage()], tsconfig: false, tsgo: true })).toThrow(
                RE_TSGO_CUSTOM_UNSUPPORTED,
            );
        });

        it("requires the tsc generator for Volar-based languages", () => {
            expect.assertions(1);

            expect(() => resolveOptions({ customLanguages: [createVueLanguage()], generator: "oxc", tsconfig: false })).toThrow(RE_VOLAR_NEEDS_TSC);
        });

        it("rejects Volar-based languages under TypeScript 7", async () => {
            expect.assertions(1);

            const language = createVueLanguage();
            const tsgoModule = await import("../src/tsgo.js");
            const spy = vi.spyOn(tsgoModule, "isTS70Installed").mockReturnValue(true);

            try {
                expect(() => resolveOptions({ customLanguages: [language], tsconfig: false })).toThrow(RE_TYPESCRIPT_7);
            } finally {
                spy.mockRestore();
            }
        });

        it("rejects Volar-free languages that would default to tsgo under TypeScript 7", async () => {
            expect.assertions(1);

            const tsgoModule = await import("../src/tsgo.js");
            const spy = vi.spyOn(tsgoModule, "isTS70Installed").mockReturnValue(true);

            try {
                expect(() => resolveOptions({ customLanguages: [createCustomLanguage()], tsconfig: false })).toThrow(RE_TSGO_CUSTOM_UNSUPPORTED);
            } finally {
                spy.mockRestore();
            }
        });

        it("runs custom languages in-process when parallel is requested", () => {
            expect.assertions(4);

            const logger = createLogger();
            const withCustom = resolveOptions({ customLanguages: [createCustomLanguage()], logger, parallel: true, tsconfig: false });

            expect(withCustom.parallel).toBe(false);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("`parallel` option is ignored"));

            // The vue shortcut is rebuilt inside the worker from its plain options, so parallel stays on.
            const withVue = resolveOptions({ logger: createLogger(), parallel: true, tsconfig: false, vue: true });

            expect(withVue.parallel).toBe(true);
            expect(withVue.generator).toBe("tsc");
        });

        it("exposes the registered languages through the resolved language context", () => {
            expect.assertions(2);

            const resolved = resolveOptions({ customLanguages: [createCustomLanguage()], tsconfig: false });

            expect(resolved.languageContext.isCustomLanguageFile("/src/foo.custom")).toBe(true);
            expect(resolved.languageContext.isUsingVolar()).toBe(false);
        });
    });

    describe("filenameToDts", () => {
        it("maps custom language files through the language context", () => {
            expect.assertions(2);

            const resolved = resolveOptions({ customLanguages: [createCustomLanguage()], tsconfig: false });

            expect(filenameToDts("/src/foo.custom", resolved.languageContext)).toBe("/src/foo.custom.d.ts");
            // Without a language context, an unknown extension is left alone.
            expect(filenameToDts("/src/foo.custom")).toBe("/src/foo.custom");
        });
    });
});
