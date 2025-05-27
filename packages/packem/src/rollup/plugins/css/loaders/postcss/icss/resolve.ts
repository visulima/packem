import type { CSSImports } from "icss-utils";
import type { ProcessOptions } from "postcss";
import type Processor from "postcss/lib/processor";

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

    for await (const [url, values] of Object.entries(icssImports)) {
        const exports = await load(url, file, extensions, processor, options);

        for (const [k, v] of Object.entries(values)) {
            // eslint-disable-next-line antfu/no-cjs-exports,import/no-commonjs
            imports[k] = exports[v] as string;
        }
    }

    return imports;
};

export default resolve;
