// eslint-disable-next-line import/no-namespace
import type * as sass from "sass";
// eslint-disable-next-line import/no-namespace
import type * as sassEmbedded from "sass-embedded";

import type { SassApiType } from "../types";

/**
 * Verifies that the implementation and version of Sass is supported by this loader.
 */
const getCompileFunction = async (
    implementation: typeof sass | typeof sassEmbedded,
    apiType: SassApiType,
): Promise<
    ((sassOptions: sass.StringOptions<"sync"> & { data: string }) => sass.CompileResult) | ((sassOptions: sassEmbedded.StringOptions<"sync"> & { data: string }) => sassEmbedded.CompileResult)
> => {
    if (apiType === "modern") {
        return (sassOptions: sass.StringOptions<"sync"> & { data: string }) => {
            const { data, ...rest } = sassOptions;

            return (implementation as typeof sass).compileString(data as string, rest);
        };
    }

    return (sassOptions: sassEmbedded.StringOptions<"sync"> & { data: string }) => {
        const { data, ...rest } = sassOptions;

        return (implementation as typeof sassEmbedded).compileString(data as string, rest);
    };
};

export default getCompileFunction;
