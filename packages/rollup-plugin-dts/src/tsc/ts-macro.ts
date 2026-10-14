/* eslint-disable import/no-dynamic-require -- the optional `@ts-macro/tsc` tooling is loaded at runtime from the path where it is installed */
import { createRequire } from "node:module";

import { createDebug } from "obug";
import type Ts from "typescript";

import type { CustomLanguage } from "../custom-language";

const debug = createDebug("rollup-plugin-dts:ts-macro");
const require = createRequire(import.meta.url);

type VolarPluginResult = ReturnType<NonNullable<CustomLanguage["createVolarPlugins"]>>;

interface TsMacroModule {
    getLanguagePlugins: (ts: typeof Ts, options: Ts.CompilerOptions, tsMacroOptions: unknown) => VolarPluginResult;
}

interface TsMacroOptionsModule {
    getOptions: (ts: typeof Ts, rootDir: string) => unknown;
}

const loadTsMacroLanguageTools = (): {
    getOptions: TsMacroOptionsModule["getOptions"];
    tsMacro: TsMacroModule;
    volarTypeScript: typeof import("@volar/typescript");
} => {
    debug("loading ts-macro language tools");

    try {
        const tsMacroPath = require.resolve("@ts-macro/tsc");
        const volarTypeScript = require(require.resolve("@volar/typescript", { paths: [tsMacroPath] })) as typeof import("@volar/typescript");
        const tsMacro = require(require.resolve("@ts-macro/language-plugin", { paths: [tsMacroPath] })) as TsMacroModule;
        const { getOptions } = require(require.resolve("@ts-macro/language-plugin/options", { paths: [tsMacroPath] })) as TsMacroOptionsModule;

        return { getOptions, tsMacro, volarTypeScript };
    } catch (error) {
        debug("ts-macro language tools not found", error);
        throw new Error("Failed to load ts-macro language tools. Please manually install @ts-macro/tsc.", { cause: error });
    }
};

// Identity of the ts-macro language. It takes no options, so one id covers every build that enables it.
const TS_MACRO_LANGUAGE_ID = "ts-macro";

/**
 * Creates the Volar-based language definition for ts-macro. The `tsMacro` option of the plugin is a
 * shortcut for `customLanguages: [createTsMacroLanguage()]`.
 */
const createTsMacroLanguage = (): CustomLanguage => {
    const { getOptions, tsMacro, volarTypeScript } = loadTsMacroLanguageTools();

    return {
        createVolarPlugins(ts: typeof Ts, options: Ts.CreateProgramOptions) {
            const $rootDir = options.options.$rootDir as string;

            return tsMacro.getLanguagePlugins(ts, options.options, getOptions(ts, $rootDir));
        },
        extensionPatterns: [],
        id: TS_MACRO_LANGUAGE_ID,
        tsFileExtensionInfos: [],
        volarTypeScript,
    };
};

export { TS_MACRO_LANGUAGE_ID };

export default createTsMacroLanguage;
