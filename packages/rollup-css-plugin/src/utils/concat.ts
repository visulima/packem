import { SourceMapGenerator } from "source-map-js";

import type { Extracted } from "../loaders/types";
import { mm } from "./sourcemap";

interface Concatenated {
    css: string;
    map: SourceMapGenerator;
}

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
