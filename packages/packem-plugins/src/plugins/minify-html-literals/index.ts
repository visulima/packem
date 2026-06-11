/**
 * Ported from https://github.com/lit/lit/tree/main/packages/labs/rollup-plugin-minify-html-literals
 *
 * BSD-3-Clause License
 *
 * Copyright (c) 2024 Google LLC
 */
import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import type { Plugin } from "rollup";

// eslint-disable-next-line import/no-namespace -- exposes the minifier as a namespace so consumers can reference both runtime fn & type
import * as minify from "./lib/minify-html-literals.js";

/**
 * Plugin options.
 */
export interface MinifyHTMLLiteralsOptions {
    /**
     * Pattern or array of patterns of files not to minify.
     */
    exclude?: FilterPattern;

    /**
     * If true, any errors while parsing or minifying will abort the bundle
     * process. Defaults to false, which will only show a warning.
     */
    failOnError?: boolean;

    /**
     * Pattern or array of patterns of files to minify.
     */
    include?: FilterPattern;

    /**
     * Override minify-html-literals function.
     */
    minifyHTMLLiterals?: typeof minify.minifyHTMLLiterals;

    /**
     * Minify options, see
     * https://www.npmjs.com/package/minify-html-literals#options.
     */
    options?: Partial<minify.Options>;
}

export const minifyHTMLLiteralsPlugin = ({
    exclude,
    failOnError = false,
    include,
    logger,
    minifyHTMLLiterals,
    options,
}: MinifyHTMLLiteralsOptions & {
    logger: Console;
}): Plugin => {
    // eslint-disable-next-line no-param-reassign
    minifyHTMLLiterals ??= minify.minifyHTMLLiterals;

    const filter = createFilter(include, exclude);

    const minifyOptions = (options ?? {}) as minify.DefaultOptions;

    return {
        name: "packem:minify-html-literals",
        async transform(code: string, id: string) {
            // Cheap pre-check: the minifier only acts on tagged `html`...`` / `css`...``
            // template literals. With no default `include`, the filter matches every
            // module, so skipping ones that contain no such tag avoids spinning up the
            // full TypeScript parser on irrelevant files.
            if (!code.includes("html`") && !code.includes("css`")) {
                return undefined;
            }

            if (filter(id)) {
                try {
                    const result = await minifyHTMLLiterals(code, {
                        ...minifyOptions,
                        fileName: id,
                    });

                    return result;
                } catch (error: unknown) {
                    // check if Error else treat as string
                    const message = error instanceof Error ? error.message : (error as string);

                    if (failOnError) {
                        this.error(message);
                    } else {
                        logger.warn({
                            message,
                            prefix: "plugin:minify-html-literals",
                        });
                    }
                }
            }

            return undefined;
        },
    };
};

export default minifyHTMLLiteralsPlugin;
