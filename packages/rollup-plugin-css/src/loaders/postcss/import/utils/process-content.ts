import type { AcceptedPlugin, LazyResult, Postcss, ProcessOptions, Result } from "postcss";

import postcssNoop from "../../noop";
import type { ImportOptions } from "../types";

const runPostcss = async (
    postcss: Postcss,
    content: string,
    filename: string,
    plugins: AcceptedPlugin[],
    parsers: ProcessOptions["parser"][],
    index?: number,
): Promise<LazyResult> => {
    if (index === undefined) {
        // eslint-disable-next-line no-param-reassign
        index = 0;
    }

    if (plugins.length === 0) {
        plugins.push(postcssNoop());
    }

    return await postcss(plugins)
        .process(content, {
            from: filename,

            parser: parsers[index],
        })
        .catch(async (error: unknown) => {
            // If there's an error, try the next parser
            // eslint-disable-next-line no-param-reassign,no-plusplus
            (index as number)++;

            // If there are no parsers left, throw it
            if (index === parsers.length) {
                throw error;
            }

            return await runPostcss(postcss, content, filename, plugins, parsers, index);
        });
};

const processContent = async (result: Result, content: string, filename: string, options: ImportOptions, postcss: Postcss): Promise<LazyResult> => {
    const { plugins } = options;

    const parserList = [];

    // Syntax support:
    if (result.opts.syntax?.parse) {
        parserList.push(result.opts.syntax.parse);
    }

    // Parser support:
    if (result.opts.parser) {
        parserList.push(result.opts.parser);
    }

    // Try the default as a last resort:
    parserList.push(undefined);

    return await runPostcss(postcss, content, filename, plugins, parserList);
};

export default processContent;
