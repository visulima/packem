import { SourceMapGenerator } from "source-map-js";

import type { Extracted } from "../loaders/types";
import { mm } from "./sourcemap";

interface Concatenated {
    css: string;
    map: SourceMapGenerator;
}

/**
 * Concatenates multiple CSS data objects into a single unified object with source map support.
 *
 * This utility function merges CSS content from multiple sources while
 * properly handling source maps and metadata. It's used during the build
 * process to combine CSS from different modules or chunks while preserving
 * accurate source mapping information for debugging.
 *
 * The function:
 * - Concatenates CSS content with newline separators
 * - Merges source maps from all inputs
 * - Adjusts line/column mappings for the combined output
 * - Preserves source content for debugging
 * @param extracted Array of extracted CSS data objects to concatenate
 * @returns Promise resolving to concatenated CSS with merged source maps
 * @example
 * ```typescript
 * const extracted = [
 *   { css: '.header {}', map: headerSourceMap },
 *   { css: '.footer {}', map: footerSourceMap }
 * ];
 *
 * const result = await concat(extracted);
 * // Result: Combined CSS with properly merged source maps
 * ```
 */
const concat = async (extracted: Extracted[]): Promise<Concatenated> => {
    const sm = new SourceMapGenerator({ file: "" });
    const content = [];

    let offset = 0;

    for await (const { css, map } of extracted) {
        content.push(css);
        const mapModifier = mm(map);

        const data = mapModifier.toObject();

        if (!data) {
            continue;
        }

        const consumer = mapModifier.toConsumer();

        if (!consumer) {
            continue;
        }

        consumer.eachMapping((item) => {
            sm.addMapping({
                generated: { column: item.generatedColumn, line: offset + item.generatedLine },
                name: item.name,
                original: { column: item.originalColumn as number, line: item.originalLine as number },
                source: item.source,
            });
        });

        if (data.sourcesContent) {
            for (const source of data.sources) {
                sm.setSourceContent(source, consumer.sourceContentFor(source, true));
            }
        }

        offset += css.split("\n").length;
    }

    return {
        css: content.join("\n"),
        map: sm,
    };
};

export default concat;
