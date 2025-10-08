/**
 * Ported from https://github.com/lit/lit/tree/main/packages/labs/rollup-plugin-minify-html-literals
 *
 * BSD-3-Clause License
 *
 * Copyright (c) 2024 Google LLC
 */
import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import type { Pail } from "@visulima/pail";
import type { Plugin } from "rollup";

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
    logger: Pail;
}): Plugin => {
    if (!minifyHTMLLiterals) {
        // eslint-disable-next-line no-param-reassign
        minifyHTMLLiterals = minify.minifyHTMLLiterals;
    }

    const filter = createFilter(include, exclude);

    const minifyOptions = <minify.DefaultOptions>options || {};

    return {
        name: "packem:minify-html-literals",
        async transform(code: string, id: string) {
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
