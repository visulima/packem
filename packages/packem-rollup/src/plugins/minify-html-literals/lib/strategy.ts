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

const optimizationLevelFrom = (level: CleanCSS.Options["level"]) => {
    const defaultLevel = {
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

    return level as any;
}

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
    processConditionalComments: true,
    removeAttributeQuotes: false,
    removeComments: true,
    removeEmptyAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true,
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
        const output = new CleanCSS(<OptionsOutput>adjustedOptions).minify(css);

        if (output.errors && output.errors.length > 0) {
            throw new Error(output.errors.join("\n\n"));
        }

        if (adjustedOptions.level[OptimizationLevel.One].tidySelectors) {
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
            const matches = [...result.matchAll(/<svg/g)].reverse();

            for (const match of matches) {
                const startTagIndex = match.index!;
                const closeTagIndex = result.indexOf("</svg", startTagIndex);

                if (closeTagIndex === -1) {
                    // Malformed SVG without a closing tag
                    continue;
                }

                const start = result.slice(0, Math.max(0, startTagIndex));
                let svg = result.substring(startTagIndex, closeTagIndex);
                const end = result.slice(Math.max(0, closeTagIndex));

                svg = svg.replaceAll(/\r?\n/g, "");
                result = start + svg + end;
            }
        }

        if (adjustedMinifyCSSOptions && adjustedMinifyCSSOptions.level[OptimizationLevel.One].tidySelectors) {
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

            for (let index = parts.length - 1; index >= 0; index--) {
                const part = parts[index];

                if (part !== undefined) {
                    parts.splice(index, 1, ...part.split(withoutSemicolon));
                }
            }
        }

        return parts;
    },
};

export const adjustMinifyCSSOptions = (options: CleanCSS.Options = {}) => {
    const level = optimizationLevelFrom(options.level);
    const originalTransform = typeof options.level === "object" && options.level[1] && options.level[1].transform;

    level[OptimizationLevel.One].transform = (property: string, value: string) => {
        if (value.startsWith("@TEMPLATE_EXPRESSION") && !value.endsWith(";")) {
            // The CSS minifier has removed the semicolon from the placeholder
            // and we need to add it back.
            return (value = `${value};`);
        }

        return originalTransform ? originalTransform(property, value) : value;
    };

    return {
        ...options,
        level,
    };
}

const fixCleanCssTidySelectors = (original: string, result: string) => {
    const regex = /(:.+\((.*)\))\s*\{/g;
    let match: RegExpMatchArray | null;

    while ((match = regex.exec(original)) != undefined) {
        const pseudoClass = match[1];
        const parameters = match[2];

        if (!pseudoClass || !parameters || !/\s/.test(parameters)) {
            continue;
        }

        const parametersWithoutSpaces = parameters.replaceAll(/\s/g, "");
        const resultPseudoClass = pseudoClass.replace(parameters, parametersWithoutSpaces);
        const resultStartIndex = result.indexOf(resultPseudoClass);

        if (resultStartIndex === -1) {
            continue;
        }

        const resultEndIndex = resultStartIndex + resultPseudoClass.length;

        // Restore the original pseudo class with spaces
        result = result.slice(0, Math.max(0, resultStartIndex)) + pseudoClass + result.slice(Math.max(0, resultEndIndex));
    }

    return result;
}
