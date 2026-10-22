/* eslint-disable import/exports-last -- the registry helpers are grouped with the language type they operate on */
import type ts from "typescript";

import createTsMacroLanguage, { TS_MACRO_LANGUAGE_ID } from "./tsc/ts-macro";
import type { VueLanguageOptions } from "./tsc/vue";
import { createVueLanguage, vueLanguageId } from "./tsc/vue";

/**
 * The part of `@volar/typescript` this package uses. It is described structurally, so the published
 * declarations do not import Volar: only projects that register a Volar-based language need it installed.
 */
export interface VolarTypeScript {
    proxyCreateProgram: (...args: never[]) => unknown;
}

/** What a Volar-based language contributes to a program: its language plugins and an optional setup hook. */
export type VolarLanguageResult =
    | unknown[]
    | {
          languagePlugins: unknown[];
          setup?: (language: never) => void;
      };

/**
 * Describes a non-standard source language, such as Vue or Astro.
 *
 * A language supported through Volar needs both `volarTypeScript` and `createVolarPlugins`, and
 * requires the `tsc` generator. A language without Volar also works with the `oxc` generator, for
 * example when its files are already TypeScript after a transform.
 */
export interface CustomLanguage {
    /** Creates the Volar language plugins that understand this language. */
    createVolarPlugins?: (ts: typeof import("typescript"), options: ts.CreateProgramOptions) => VolarLanguageResult;

    /** Patterns that identify files written in this language. */
    extensionPatterns: RegExp[];

    /**
     * Stable identity of the language. Builds in one process share a TypeScript program cache when their
     * languages have the same ids, so change the id whenever the language's behaviour changes. A language
     * without an id is never shared: each build gets its own cache.
     */
    id?: string;

    /** Maps a source filename to the TypeScript filename used for declarations. */
    toTsFilename?: (id: string) => string;

    /** Extra file extensions passed to the TypeScript compiler. */
    tsFileExtensionInfos?: ts.FileExtensionInfo[];

    /** The `@volar/typescript` module that provides `proxyCreateProgram`. */
    volarTypeScript?: VolarTypeScript;
}

type ProxyCreateProgram = (
    ts: typeof import("typescript"),
    original: typeof import("typescript").createProgram,
    create: (ts: typeof import("typescript"), options: ts.CreateProgramOptions) => VolarLanguageResult,
) => typeof import("typescript").createProgram;

/** Whether a language needs the TypeScript compiler API through Volar. */
export const isVolarLanguage = (language: CustomLanguage): boolean => Boolean(language.volarTypeScript ?? language.createVolarPlugins);

/**
 * Builds the full language list from user-provided languages plus the `vue` and `tsMacro`
 * shortcuts. The shortcuts load their Volar tooling while being created, so call this only after
 * the TypeScript 7 check has run.
 */
export const resolveCustomLanguages = ({
    customLanguages = [],
    tsMacro = false,
    vue = false,
}: {
    customLanguages?: CustomLanguage[];
    tsMacro?: boolean;
    vue?: boolean | VueLanguageOptions;
}): CustomLanguage[] => {
    const languages = [...customLanguages];

    if (vue) {
        languages.push(createVueLanguage(typeof vue === "object" ? vue : {}));
    }

    if (tsMacro) {
        languages.push(createTsMacroLanguage());
    }

    return languages;
};

/**
 * Identity of the language set a build uses, which selects the TypeScript program cache it shares. Built from the ids
 * only, so it does not load any language tooling. Empty when no language is used; `undefined` when a language has no id.
 */
export const getLanguageFingerprint = ({
    customLanguages = [],
    tsMacro = false,
    vue = false,
}: {
    customLanguages?: CustomLanguage[];
    tsMacro?: boolean;
    vue?: boolean | VueLanguageOptions;
}): string | undefined => {
    const ids: string[] = [];

    for (const language of customLanguages) {
        if (language.id === undefined) {
            return undefined;
        }

        ids.push(language.id);
    }

    if (vue) {
        ids.push(vueLanguageId(typeof vue === "object" ? vue : {}));
    }

    if (tsMacro) {
        ids.push(TS_MACRO_LANGUAGE_ID);
    }

    return ids.length === 0 ? "" : JSON.stringify(ids);
};

export class LanguageContext {
    public readonly languages: CustomLanguage[];

    public readonly patterns: RegExp[];

    public constructor(languages: CustomLanguage[]) {
        this.languages = languages;
        this.patterns = languages.flatMap((language) => language.extensionPatterns);
    }

    public isCustomLanguageFile(id: string): boolean {
        return this.patterns.some((pattern) => pattern.test(id));
    }

    public isUsingVolar(): boolean {
        return this.languages.some((language) => isVolarLanguage(language));
    }

    public getExtraFileExtensions(): ts.FileExtensionInfo[] | undefined {
        if (this.languages.length === 0) {
            return undefined;
        }

        return this.languages.flatMap((language) => language.tsFileExtensionInfos ?? []);
    }

    /** Returns the `createProgram` to use: a Volar-proxied one when a Volar language is registered. */
    public getCreateProgram(tsModule: typeof import("typescript")): typeof import("typescript").createProgram {
        const volarTypeScript = this.languages.find((language) => language.volarTypeScript)?.volarTypeScript;

        if (!volarTypeScript) {
            return tsModule.createProgram;
        }

        const proxyCreateProgram = volarTypeScript.proxyCreateProgram as ProxyCreateProgram;

        return proxyCreateProgram(tsModule, tsModule.createProgram, (ts, options) => {
            const setups: ((language: never) => void)[] = [];
            const plugins: unknown[] = [];

            for (const language of this.languages) {
                if (!language.createVolarPlugins) {
                    continue;
                }

                const result = language.createVolarPlugins(ts, options);

                if (Array.isArray(result)) {
                    plugins.push(...result);
                } else {
                    if (result.setup) {
                        setups.push(result.setup.bind(result));
                    }

                    plugins.push(...result.languagePlugins);
                }
            }

            const setup =
                setups.length > 0
                    ? (language: never) => {
                          for (const setupFunction of setups) {
                              setupFunction(language);
                          }
                      }
                    : undefined;

            return { languagePlugins: plugins, setup };
        });
    }

    public toTsFilename(id: string): string {
        for (const language of this.languages) {
            if (language.toTsFilename && language.extensionPatterns.some((pattern) => pattern.test(id))) {
                return language.toTsFilename(id);
            }
        }

        return id;
    }
}
