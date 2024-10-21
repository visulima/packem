import { browserslistToTargets, transform } from "lightningcss";

import type { LoaderContext } from "../loaders/types";
import type { ExtractedData, InternalStyleOptions } from "../types";
import type { Minifier } from "./types";

const lightningcssMinifier: Minifier<NonNullable<InternalStyleOptions["lightningcss"]>> = {
    async handler(
        data: ExtractedData,
        sourceMap: LoaderContext["sourceMap"],
        options: NonNullable<InternalStyleOptions["lightningcss"]>,
    ): Promise<ExtractedData> {
        const result = transform({
            ...options,
            code: Buffer.from(data.css),
            cssModules: undefined,
            filename: data.name,
            inputSourceMap: data.map,
            minify: true,
            sourceMap: Boolean(sourceMap),
            targets: browserslistToTargets(this.browserTargets),
        });

        if (result.warnings.length > 0) {
            this.warn("warnings when minifying css:\n" + result.warnings.map((w) => w.message).join("\n"));
        }

        return {
            ...data,
            css: result.code.toString(),
            map: "map" in result ? result.map?.toString() : undefined,
        };
    },
    name: "lightningcss",
};

// eslint-disable-next-line import/no-unused-modules
export default lightningcssMinifier;
