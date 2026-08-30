/**
 * Ported from https://github.com/lit/lit/tree/main/packages/labs/rollup-plugin-minify-html-literals
 *
 * BSD-3-Clause License
 *
 * Copyright (c) 2024 Google LLC
 */
import type { SourceMapOptions } from "magic-string";
import MagicString from "magic-string";

import type { Template, TemplatePart } from "./models.js";
import type { ParseLiteralsOptions } from "./parse-literals.js";
import { parseLiterals } from "./parse-literals.js";
import type { Strategy } from "./strategy.js";
import { defaultMinifyOptions, defaultStrategy } from "./strategy.js";

/**
 * Options for &lt;code>minifyHTMLLiterals()&lt;/code>.
 */
export type Options = DefaultOptions | CustomOptions;

/**
 * Options for &lt;code>minifyHTMLLiterals()&lt;/code>, using default html-minifier
 * strategy.
 */
export interface DefaultOptions extends BaseOptions {
    /**
     * &lt;code>html-minifier&lt;/code> options to use. Defaults to
     * &lt;code>defaultMinifyOptions&lt;/code>, for production-ready minification.
     */
    minifyOptions?: Partial<typeof defaultMinifyOptions>;
}

/**
 * Options for &lt;code>minifyHTMLLiterals()&lt;/code>, using a custom strategy.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Strategy is generic over arbitrary minifier options
export interface CustomOptions<S extends Strategy<any, any> = Strategy<any, any>> extends BaseOptions {
    /**
     * HTML minification options.
     */
    minifyOptions?: S extends Strategy<infer O> ? Partial<O> : never;

    /**
     * Override the default strategy for how to minify HTML. The default is to
     * use &lt;code>html-minifier&lt;/code>.
     */
    strategy: S;
}

/**
 * Options for &lt;code>minifyHTMLLiterals()&lt;/code>.
 */
export interface BaseOptions {
    /**
     * The name of the file. This is used to determine how to parse the source
     * code and for source map filenames. It may be a base name, relative, or
     * absolute path.
     */
    fileName?: string;

    /**
     * Override how source maps are generated. Set to false to disable source map
     * generation.
     * @param ms the MagicString instance with code modifications
     * @param fileName the name or path of the file
     * @returns a v3 SourceMap or undefined
     */
    generateSourceMap?: ((ms: MagicStringLike, fileName: string) => SourceMap | undefined) | false;

    /**
     * The MagicString-like constructor to use. MagicString is used to replace
     * strings and generate source maps.
     *
     * Override if you want to set your own version of MagicString or change how
     * strings are overridden. Use &lt;code>generateSourceMap&lt;/code> if you want to
     * change how source maps are created.
     */
    MagicString?: new (source: string) => MagicStringLike;

    /**
     * Override how template literals are parsed from a source string.
     */
    parseLiterals?: typeof parseLiterals;

    /**
     * Options for &lt;code>parseLiterals()&lt;/code>.
     */
    parseLiteralsOptions?: Partial<ParseLiteralsOptions>;

    /**
     * Determines whether or not a template should be minified. The default is to
     * minify all tagged template whose tag name contains "html" (case
     * insensitive).
     * @param template the template to check
     * @returns true if the template should be minified
     */
    shouldMinify?: (template: Template) => boolean;

    /**
     * Determines whether or not a CSS template should be minified. The default is
     * to minify all tagged template whose tag name contains "css" (case
     * insensitive).
     * @param template the template to check
     * @returns true if the template should be minified
     */
    shouldMinifyCSS?: (template: Template) => boolean;

    /**
     * Override custom validation or set to false to disable validation. This is
     * only useful when implementing your own strategy that may return
     * unexpected results.
     */
    validate?: Validation | false;
}

/**
 * A MagicString-like instance. &lt;code>minify-html-literals&lt;/code> only uses a
 * subset of the MagicString API to overwrite the source code and generate
 * source maps.
 */
export interface MagicStringLike {
    generateMap: (options?: Partial<SourceMapOptions>) => SourceMap;
    overwrite: (start: number, end: number, content: string) => unknown;
    toString: () => string;
}

/**
 * A v3 SourceMap.
 *
 * &lt;code>magic-string> incorrectly declares the SourceMap type with a version
 * string instead of a number, so &lt;code>minify-html-literals&lt;/code> declares
 * its own type.
 */
export interface SourceMap {
    file?: string;
    mappings: string;
    names: string[];
    sources: string[];
    sourcesContent?: string[];
    toString: () => string;
    toUrl: () => string;
    version: number;
}

/**
 * Validation that is executed when minifying HTML to ensure there are no
 * unexpected errors. This is to alleviate hard-to-troubleshoot errors such as
 * undefined errors.
 */
export interface Validation {
    /**
     * Throws an error if &lt;code>strategy.splitHTMLByPlaceholder()&lt;/code> does not
     * return an HTML part string for each template part.
     * @param parts the template parts that generated the strings
     * @param htmlParts the split HTML strings
     */
    ensureHTMLPartsValid: (parts: TemplatePart[], htmlParts: string[]) => void;

    /**
     * Throws an error if &lt;code>strategy.getPlaceholder()&lt;/code> does not return
     * a valid placeholder string.
     * @param placeholder the placeholder to check
     */
    ensurePlaceholderValid: (placeholder: unknown) => void;
}

/**
 * The result of a call to &lt;code>minifyHTMLLiterals()&lt;/code>.
 */
export interface Result {
    /**
     * The minified code.
     */
    code: string;

    /**
     * Optional v3 SourceMap for the code.
     */
    map: SourceMap | undefined;
}

/**
 * The default method to generate a SourceMap. It will generate the SourceMap
 * from the provided MagicString instance using "fileName.map" as the file and
 * "fileName" as the source.
 * @param ms the MagicString instance carrying code overwrites/replacements
 * @param fileName the name or path of the source file used for the map "file" + "source" entries
 * @returns a v3 SourceMap describing the transformations
 */
export const defaultGenerateSourceMap = (ms: MagicStringLike, fileName: string): SourceMap =>
    ms.generateMap({
        file: `${fileName}.map`,
        hires: true,
        source: fileName,
    });

/**
 * The default method to determine whether or not to minify a template. It will
 * return true for all tagged templates whose tag name contains "html" (case
 * insensitive).
 * @param template the template to check
 * @returns true if the template should be minified
 */
export const defaultShouldMinify = (template: Template): boolean => {
    const tag = template.tag?.toLowerCase();

    return !!tag && (tag.includes("html") || tag.includes("svg"));
};

/**
 * The default method to determine whether or not to minify a CSS template. It
 * will return true for all tagged templates whose tag name contains "css" (case
 * insensitive).
 * @param template the template to check
 * @returns true if the template should be minified
 */
export const defaultShouldMinifyCSS = (template: Template): boolean => !!template.tag && template.tag.toLowerCase().includes("css");

export const defaultValidation: Validation = {
    ensureHTMLPartsValid(parts, htmlParts): void {
        if (parts.length !== htmlParts.length) {
            throw new Error("splitHTMLByPlaceholder() must return same number of strings as template parts");
        }
    },
    ensurePlaceholderValid(placeholder): void {
        if (typeof placeholder !== "string" || placeholder.length === 0) {
            throw new Error("getPlaceholder() must return a non-empty string");
        }
    },
};

/**
 * Minifies all HTML template literals in the provided source string.
 * @param source the source code
 * @param options minification options
 * @returns the minified code, or null if no minification occurred.
 */
export async function minifyHTMLLiterals(source: string, options?: DefaultOptions): Promise<Result | null | undefined>;

/**
 * Minifies all HTML template literals in the provided source string.
 * @param source the source code
 * @param options minification options
 * @returns the minified code, or null if no minification occurred.
 */
export async function minifyHTMLLiterals<S extends Strategy>(source: string, options?: CustomOptions<S>): Promise<Result | undefined>;
// eslint-disable-next-line sonarjs/cognitive-complexity
export async function minifyHTMLLiterals(source: string, options: Options = {}): Promise<Result | undefined> {
    /* eslint-disable no-param-reassign -- options is a single config object explicitly populated with defaults */
    options.minifyOptions = {
        ...defaultMinifyOptions,
        ...options.minifyOptions,
    };
    options.MagicString ??= MagicString;
    options.parseLiterals ??= parseLiterals;
    options.shouldMinify ??= defaultShouldMinify;
    options.shouldMinifyCSS ??= defaultShouldMinifyCSS;
    options.parseLiteralsOptions = {
        fileName: options.fileName,
        ...options.parseLiteralsOptions,
    };
    /* eslint-enable no-param-reassign */

    const templates = options.parseLiterals(source, options.parseLiteralsOptions);
    const strategy = ((options as CustomOptions).strategy as Strategy | undefined) ?? defaultStrategy;
    const { shouldMinify, shouldMinifyCSS } = options;
    let validate: Validation | undefined;

    if (options.validate !== false) {
        validate = options.validate ?? defaultValidation;
    }

    const ms = new options.MagicString(source);

    for (const template of templates) {
        const isMinifyHTML = shouldMinify(template);
        const isMinifyCSS = !!strategy.minifyCSS && shouldMinifyCSS(template);

        if (isMinifyHTML || isMinifyCSS) {
            const placeholder = strategy.getPlaceholder(template.parts);

            if (validate) {
                validate.ensurePlaceholderValid(placeholder);
            }

            const combined = strategy.combineHTMLStrings(template.parts, placeholder);
            let min: string;

            if (isMinifyCSS) {
                const allMinifyOptions = options.minifyOptions as Record<string, unknown> | undefined;
                const minifyCSSOptions = allMinifyOptions?.minifyCSS;

                if (typeof minifyCSSOptions === "function") {
                    const result = (minifyCSSOptions as (css: string) => string | Promise<string>)(combined);

                    // eslint-disable-next-line no-await-in-loop -- sequential per-template minification by design
                    min = typeof result === "string" ? result : await result;
                } else if (minifyCSSOptions === false) {
                    min = combined;
                } else {
                    const cssOptions = typeof minifyCSSOptions === "object" && minifyCSSOptions !== null ? minifyCSSOptions : undefined;
                    const minifyCSSFunction = strategy.minifyCSS as ((css: string, options?: unknown) => string | Promise<string>) | undefined;

                    if (!minifyCSSFunction) {
                        throw new Error("Strategy does not implement minifyCSS but minifyCSS was requested");
                    }

                    const cssResult = minifyCSSFunction(combined, cssOptions);

                    // eslint-disable-next-line no-await-in-loop -- sequential per-template minification by design
                    min = typeof cssResult === "string" ? cssResult : await cssResult;
                }
            } else {
                const htmlResult = (strategy.minifyHTML as (html: string, options?: unknown) => string | Promise<string>)(combined, options.minifyOptions);

                // eslint-disable-next-line no-await-in-loop -- sequential per-template minification by design
                min = typeof htmlResult === "string" ? htmlResult : await htmlResult;
            }

            const minParts = strategy.splitHTMLByPlaceholder(min, placeholder);

            if (validate) {
                validate.ensureHTMLPartsValid(template.parts, minParts);
            }

            template.parts.forEach((part, index) => {
                if (part.start < part.end && minParts[index] !== undefined) {
                    // Only overwrite if the literal part has text content
                    ms.overwrite(part.start, part.end, minParts[index]);
                }
            });
        }
    }

    const sourceMin = ms.toString();

    if (source === sourceMin) {
        return undefined;
    }

    let map: SourceMap | undefined;

    if (options.generateSourceMap !== false) {
        const generateSourceMap = options.generateSourceMap ?? defaultGenerateSourceMap;

        map = generateSourceMap(ms, options.fileName ?? "");
    }

    return {
        code: sourceMin,
        map,
    };
}
