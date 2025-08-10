import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { readFile } from "@visulima/fs";
// eslint-disable-next-line import/no-extraneous-dependencies
import mime from "mime";
import type { Plugin, PluginContext } from "rollup";

// Minimal SVG tiny data URI utilities
const REGEX = {
    quotes: /"/g,
    urlHexPairs: /%[\dA-F]{2}/g,
    whitespace: /\s+/g,
};

const specialHexEncode = (match: string): string => {
    switch (match) {
        case "%2F": { return "/";
        }
        case "%3A": { return ":";
        }
        case "%3D": { return "=";
        }
        case "%20": { return " ";
        }
        default: { return match.toLowerCase();
        }
    }
};

const collapseWhitespace = (input: string): string => input.trim().replaceAll(REGEX.whitespace, " ");
const dataUriPayload = (input: string): string => encodeURIComponent(input).replaceAll(REGEX.urlHexPairs, specialHexEncode);

const svgToTinyDataUri = (svgString: string): string => {
    const withoutBom = svgString.startsWith("\uFEFF") ? svgString.slice(1) : svgString;
    const body = collapseWhitespace(withoutBom).replaceAll(REGEX.quotes, "'");

    return `data:image/svg+xml,${dataUriPayload(body)}`;
};

export type DataUriPluginOptions = {
    exclude?: FilterPattern;
    include?: FilterPattern;
    /** Encode spaces for use in srcset attribute */
    srcset?: boolean;
};

export const dataUriPlugin = (options: DataUriPluginOptions = {}): Plugin => {
    const filter = createFilter(options.include ?? [/\?data-uri$/], options.exclude);

    return {
        async load(this: PluginContext, id: string) {
            if (!filter(id) || !id.endsWith("?data-uri")) {
                return undefined;
            }

            const cleanId = id.replace(/\?data-uri$/, "");

            this.addWatchFile(cleanId);

            const type = mime.getType(cleanId) || "application/octet-stream";

            if (type === "image/svg+xml") {
                const svg = (await readFile(cleanId, { buffer: false })) as string;
                const uri = options.srcset ? svgToTinyDataUri(svg).replaceAll(" ", "%20") : svgToTinyDataUri(svg);

                return `export default "${uri}"`;
            }

            const buf = (await readFile(cleanId, { buffer: true })) as unknown as Uint8Array;
            const base64 = Buffer.from(buf).toString("base64");
            const prefix = type.startsWith("text/") ? `data:${type};charset=utf-8;base64,` : `data:${type};base64,`;
            const uri = `${prefix}${base64}`;

            return `export default "${uri}"`;
        },
        name: "packem:data-uri",
    };
};

export default dataUriPlugin;
