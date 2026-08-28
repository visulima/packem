import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { readFile } from "@visulima/fs";
import { svgToCssDataUri, svgToTinyDataUri } from "@visulima/packem-share";
// eslint-disable-next-line e18e/ban-dependencies -- mime's lookup table covers extensions mrmime does not; the swap is tracked separately
import mime from "mime";
import type { Plugin, PluginContext } from "rollup";

type DataUriPluginOptions = {
    exclude?: FilterPattern;
    include?: FilterPattern;
    /** Encode spaces for use in srcset attribute */
    srcset?: boolean;
};

const DATA_URI_RE = /\?data-uri/;

/**
 * Data URI plugin that converts files to data URIs for inline embedding.
 *
 * Supported query parameters:
 *
 * - `?data-uri` - Basic data URI conversion.
 * - `?data-uri&amp;encoding=css` - Use CSS-optimized SVG encoding.
 * - `?data-uri&amp;encoding=tiny` - Use tiny SVG encoding (default).
 * - `?data-uri&amp;srcset` - Encode spaces as %20 for srcset compatibility.
 *
 * Examples:
 *
 * - `./icon.svg?data-uri` - Tiny SVG encoding.
 * - `./icon.svg?data-uri&amp;encoding=css` - CSS-optimized SVG encoding.
 * - `./icon.svg?data-uri&amp;srcset` - Tiny SVG with srcset compatibility.
 * - `./icon.svg?data-uri&amp;encoding=css&amp;srcset` - CSS encoding with srcset compatibility.
 */
export const dataUriPlugin = (options: DataUriPluginOptions = {}): Plugin => {
    const filter = createFilter(options.include ?? [DATA_URI_RE], options.exclude);

    return {
        async load(this: PluginContext, id: string) {
            if (!filter(id) || !id.includes("?data-uri")) {
                return undefined;
            }

            // Parse query parameters
            const url = new URL(id, "file://");
            const cleanId = url.pathname;
            const encoding = url.searchParams.get("encoding") ?? "tiny";
            const srcset = url.searchParams.has("srcset") || options.srcset;

            this.addWatchFile(cleanId);

            const type = mime.getType(cleanId) ?? "application/octet-stream";

            if (type === "image/svg+xml") {
                const svg = await readFile(cleanId, { buffer: false });
                const svgUri = encoding === "css" ? svgToCssDataUri(svg) : svgToTinyDataUri(svg);
                const uri = srcset ? svgUri.replaceAll(" ", "%20") : svgUri;

                return `export default ${JSON.stringify(uri)}`;
            }

            const buffer = await readFile(cleanId, { buffer: true });
            const base64 = Buffer.from(buffer).toString("base64");
            const prefix = type.startsWith("text/") ? `data:${type};charset=utf-8;base64,` : `data:${type};base64,`;
            const uri = `${prefix}${base64}`;

            return `export default ${JSON.stringify(uri)}`;
        },
        name: "packem:data-uri",
    };
};

export type { DataUriPluginOptions };
