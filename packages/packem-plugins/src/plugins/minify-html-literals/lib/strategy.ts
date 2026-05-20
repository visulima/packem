/**
 * Ported from https://github.com/lit/lit/tree/main/packages/labs/rollup-plugin-minify-html-literals
 *
 * BSD-3-Clause License
 *
 * Copyright (c) 2024 Google LLC
 */
import type { OptionsOutput } from "clean-css";
import CleanCSS from "clean-css";
import type { MinifierOptions as HTMLOptions } from "html-minifier-next";
import { minify } from "html-minifier-next";

import type { TemplatePart } from "./models.js";

// Define optimization level constants since the module isn't properly typed
const OptimizationLevel = {
    One: "1",
    Two: "2",
    Zero: "0",
} as const;

type OptimizationLevelKey = (typeof OptimizationLevel)[keyof typeof OptimizationLevel];

type OptimizationLevels = Record<OptimizationLevelKey, Record<string, unknown>>;

const optimizationLevelFrom = (level: CleanCSS.Options["level"]): OptimizationLevels => {
    const defaultLevel: OptimizationLevels = {
        [OptimizationLevel.One]: {
            tidySelectors: false,
            transform: undefined,
        },
        [OptimizationLevel.Two]: {
            tidySelectors: false,
            transform: undefined,
        },
        [OptimizationLevel.Zero]: {},
    };

    if (level === undefined) {
        return defaultLevel;
    }

    if (typeof level === "number") {
        const levelString = level.toString() as OptimizationLevelKey;

        return {
            ...defaultLevel,
            [levelString]: { ...defaultLevel[levelString] },
        };
    }

    return level as unknown as OptimizationLevels;
};

// eslint-disable-next-line sonarjs/slow-regex -- bounded character class with no overlapping quantifiers; input is css from clean-css output, not user controlled
const PSEUDO_CLASS_WITH_ARGS_RE = /(:[^()\s]+\(([^()]*)\))\s*\{/g;
const WHITESPACE_RE = /\s/g;
const HAS_WHITESPACE_RE = /\s/;

const fixCleanCssTidySelectors = (original: string, result: string): string => {
    let next = result;
    const matches = [...original.matchAll(PSEUDO_CLASS_WITH_ARGS_RE)];

    for (const match of matches) {
        const pseudoClass = match[1] as string;
        const parameters = match[2] as string;

        if (!pseudoClass || !parameters || !HAS_WHITESPACE_RE.test(parameters)) {
            continue;
        }

        const parametersWithoutSpaces = parameters.replaceAll(WHITESPACE_RE, "");
        const resultPseudoClass = pseudoClass.replace(parameters, parametersWithoutSpaces);
        const resultStartIndex = next.indexOf(resultPseudoClass);

        if (resultStartIndex === -1) {
            continue;
        }

        const resultEndIndex = resultStartIndex + resultPseudoClass.length;

        // Restore the original pseudo class with spaces
        next = next.slice(0, Math.max(0, resultStartIndex)) + pseudoClass + next.slice(Math.max(0, resultEndIndex));
    }

    return next;
};

/**
 * A strategy on how to minify HTML and optionally CSS.
 * @template O minify HTML options
 * @template C minify CSS options
 */
export interface Strategy<O = unknown, C = unknown> {
    /**
     * Combines the parts' HTML text strings together into a single string using
     * the provided placeholder. The placeholder indicates where a template
     * expression occurs.
     * @param parts the parts to combine
     * @param placeholder the placeholder to use between parts
     * @returns the combined parts' text strings
     */
    combineHTMLStrings: (parts: TemplatePart[], placeholder: string) => string;

    /**
     * Retrieve a placeholder for the given array of template parts. The
     * placeholder returned should be the same if the function is invoked with the
     * same array of parts.
     *
     * The placeholder should be an HTML-compliant string that is not present in
     * any of the parts' text.
     * @param parts the parts to get a placeholder for
     * @returns the placeholder
     */
    getPlaceholder: (parts: TemplatePart[]) => string;

    /**
     * Minifies the provided CSS string.
     * @param css the css to minfiy
     * @param options css minify options
     * @returns minified CSS string
     */
    minifyCSS?: (css: string, options?: C) => string;

    /**
     * Minfies the provided HTML string.
     * @param html the html to minify
     * @param options html minify options
     * @returns minified HTML string
     */
    minifyHTML: (html: string, options?: O) => string | Promise<string>;

    /**
     * Splits a minfied HTML string back into an array of strings from the
     * provided placeholder. The returned array of strings should be the same
     * length as the template parts that were combined to make the HTML string.
     * @param html the html string to split
     * @param placeholder the placeholder to split by
     * @returns an array of html strings
     */
    splitHTMLByPlaceholder: (html: string, placeholder: string) => string[];
}

/**
 * The default &lt;code>clean-css&lt;/code> options, optimized for production
 * minification.
 */
export const defaultMinifyCSSOptions: CleanCSS.Options = {};

/**
 * The default &lt;code>html-minifier&lt;/code> options, optimized for production
 * minification.
 */
export const defaultMinifyOptions: HTMLOptions = {
    caseSensitive: true,
    collapseWhitespace: true,
    decodeEntities: true,
    minifyCSS: defaultMinifyCSSOptions,
    minifyJS: true,
    removeAttributeQuotes: false,
    removeComments: true,
    removeEmptyAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true,
};

export const adjustMinifyCSSOptions = (options: CleanCSS.Options = {}): CleanCSS.Options => {
    const level = optimizationLevelFrom(options.level);
    const originalTransform: ((property: string, value: string) => string) | false
        = typeof options.level === "object" && typeof options.level[1]?.transform === "function" ? options.level[1].transform : false;

    level[OptimizationLevel.One].transform = (property: string, value: string): string => {
        if (value.startsWith("@TEMPLATE_EXPRESSION") && !value.endsWith(";")) {
            // The CSS minifier has removed the semicolon from the placeholder
            // and we need to add it back.
            return `${value};`;
        }

        return originalTransform ? originalTransform(property, value) : value;
    };

    return {
        ...options,
        level: level as unknown as CleanCSS.Options["level"],
    };
};

/**
 * The default strategy. This uses &lt;code>html-minifier&lt;/code> to minify HTML and
 * &lt;code>clean-css&lt;/code> to minify CSS.
 */
export const defaultStrategy: Strategy<HTMLOptions, CleanCSS.Options> = {
    combineHTMLStrings(parts, placeholder) {
        return parts.map((part) => part.text).join(placeholder);
    },
    getPlaceholder(parts) {
        // Using @ and (); will cause the expression not to be removed in CSS.
        // However, sometimes the semicolon can be removed (ex: inline styles).
        // In those cases, we want to make sure that the HTML splitting also
        // accounts for the missing semicolon.
        const suffix = "();";
        let placeholder = "@TEMPLATE_EXPRESSION";

        while (parts.some((part) => part.text.includes(placeholder + suffix))) {
            placeholder += "_";
        }

        return placeholder + suffix;
    },
    minifyCSS(css, options = {}) {
        const adjustedOptions = adjustMinifyCSSOptions(options);
        const output = new CleanCSS(adjustedOptions as OptionsOutput).minify(css);

        if (output.errors.length > 0) {
            throw new Error(output.errors.join("\n\n"));
        }

        const levels = adjustedOptions.level as OptimizationLevels | undefined;

        if (levels?.[OptimizationLevel.One]?.tidySelectors) {
            output.styles = fixCleanCssTidySelectors(css, output.styles);
        }

        return output.styles;
    },
    async minifyHTML(html, options = {}) {
        let minifyCSSOptions: HTMLOptions["minifyCSS"];

        if (options.minifyCSS) {
            minifyCSSOptions = options.minifyCSS !== true && typeof options.minifyCSS !== "function" ? { ...options.minifyCSS } : {};
        } else {
            minifyCSSOptions = false;
        }

        let adjustedMinifyCSSOptions: false | ReturnType<typeof adjustMinifyCSSOptions> = false;

        if (minifyCSSOptions) {
            adjustedMinifyCSSOptions = adjustMinifyCSSOptions(minifyCSSOptions);
        }

        let result = await minify(html, {
            ...options,
            minifyCSS: adjustedMinifyCSSOptions,
        });

        if (options.collapseWhitespace) {
            // html-minifier does not support removing newlines inside <svg>
            // attributes. Support this, but be careful not to remove newlines from
            // supported areas (such as within <pre> and <textarea> tags).
            const matches = [...result.matchAll(/<svg/g)].toReversed();

            for (const match of matches) {
                const startTagIndex = match.index;
                const closeTagIndex = result.indexOf("</svg", startTagIndex);

                if (closeTagIndex === -1) {
                    // Malformed SVG without a closing tag
                    continue;
                }

                const start = result.slice(0, Math.max(0, startTagIndex));
                let svg = result.slice(startTagIndex, closeTagIndex);
                const end = result.slice(Math.max(0, closeTagIndex));

                svg = svg.replaceAll(/\r?\n/g, "");
                result = start + svg + end;
            }
        }

        const adjustedLevels = adjustedMinifyCSSOptions ? (adjustedMinifyCSSOptions.level as OptimizationLevels | undefined) : undefined;

        if (adjustedLevels?.[OptimizationLevel.One]?.tidySelectors) {
            // Fix https://github.com/jakubpawlowicz/clean-css/issues/996
            result = fixCleanCssTidySelectors(html, result);
        }

        return result;
    },
    splitHTMLByPlaceholder(html, placeholder) {
        const parts = html.split(placeholder);

        // Make the last character (a semicolon) optional. See above.
        if (placeholder.endsWith(";")) {
            const withoutSemicolon = placeholder.slice(0, Math.max(0, placeholder.length - 1));

            for (let index = parts.length - 1; index >= 0; index -= 1) {
                const part = parts[index];

                if (part !== undefined) {
                    parts.splice(index, 1, ...part.split(withoutSemicolon));
                }
            }
        }

        return parts;
    },
};
