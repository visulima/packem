/* eslint-disable import/exports-last, import/no-dynamic-require -- the optional `vue-tsc` tooling is loaded at runtime from the path where it is installed, and the helpers are grouped with the exported factory */
import { createRequire } from "node:module";

import { createDebug } from "obug";
import type Ts from "typescript";

import type { CustomLanguage } from "../custom-language";
import { RE_VUE } from "../filename";
import { stableKey } from "./context.js";

const debug = createDebug("rollup-plugin-dts:vue");
const require = createRequire(import.meta.url);

// Internal only: the public option type stays a plain record so the declarations do not import Vue.
type RawVueCompilerOptions = import("@vue/language-core").RawVueCompilerOptions;

export interface VueLanguageOptions {
    /**
     * Overrides for `vueCompilerOptions`, such as `fallthroughAttributes`. They are merged over the
     * `vueCompilerOptions` found in the tsconfig, so a value set here wins over the same key there.
     */
    vueCompilerOptions?: Record<string, unknown>;
}

const loadVueLanguageTools = (): {
    volarTypeScript: typeof import("@volar/typescript");
    vue: typeof import("@vue/language-core");
} => {
    debug("loading vue language tools");

    try {
        const vueTscPath = require.resolve("vue-tsc");
        const volarTypeScript = require(require.resolve("@volar/typescript", { paths: [vueTscPath] })) as typeof import("@volar/typescript");
        const vue = require(require.resolve("@vue/language-core", { paths: [vueTscPath] })) as typeof import("@vue/language-core");

        return { volarTypeScript, vue };
    } catch (error) {
        debug("vue language tools not found", error);
        throw new Error("Failed to load vue language tools. Please manually install vue-tsc.", { cause: error });
    }
};

/**
 * Identity of the vue language for the given options: builds with equal options share one program cache. Options that cannot
 * be encoded faithfully (such as functions) have no identity, so their builds do not share a cache.
 */
export const vueLanguageId = (userOptions: VueLanguageOptions): string | undefined => {
    const key = stableKey(userOptions);

    return key === undefined ? undefined : `vue:${key}`;
};

/**
 * Creates the Volar-based language definition for `.vue` single-file components.
 * The `vue` option of the plugin is a shortcut for `customLanguages: [createVueLanguage()]`.
 */
export const createVueLanguage = (userOptions: VueLanguageOptions = {}): CustomLanguage => {
    const { volarTypeScript, vue } = loadVueLanguageTools();

    return {
        createVolarPlugins(ts: typeof Ts, options: Ts.CreateProgramOptions) {
            const $rootDir = options.options.$rootDir as string;
            const $configRaw = options.options.$configRaw as (Ts.TsConfigSourceFile & { vueCompilerOptions?: Partial<RawVueCompilerOptions> }) | undefined;

            const resolver = new vue.CompilerOptionsResolver(ts, (fileName) => ts.sys.readFile(fileName));

            resolver.addConfig({ ...$configRaw?.vueCompilerOptions, ...userOptions.vueCompilerOptions }, $rootDir);

            return [vue.createVueLanguagePlugin<string>(ts, options.options, resolver.build(), (id) => id)];
        },
        extensionPatterns: [RE_VUE],
        id: vueLanguageId(userOptions),
        toTsFilename: (id: string): string => id.replace(RE_VUE, ".vue.ts"),
        tsFileExtensionInfos: [
            {
                extension: "vue",
                isMixedContent: true,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-assignment -- `ScriptKind.Deferred` is `7`; a value import would evaluate `typescript` at load time, which TypeScript 7 does not allow
                scriptKind: 7 satisfies Ts.ScriptKind.Deferred,
            },
        ],
        volarTypeScript,
    };
};
