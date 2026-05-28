import type { CSSImports } from "icss-utils";
import type { ProcessOptions, Processor } from "postcss";

import type { Load } from "./load";

const resolve = async (
    icssImports: CSSImports,
    load: Load,
    file: string,
    extensions: string[],
    processor: Processor,
    options?: ProcessOptions,
): Promise<Record<string, string>> => {
    const imports: Record<string, string> = {};

    for (const [url, values] of Object.entries(icssImports)) {
        // eslint-disable-next-line no-await-in-loop
        const exports = await load(url, file, extensions, processor, options);

        for (const [k, v] of Object.entries(values)) {
            // eslint-disable-next-line import/no-commonjs
            imports[k] = exports[v] as string;
        }
    }

    return imports;
};

export default resolve;
