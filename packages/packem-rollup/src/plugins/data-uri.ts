import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { readFile } from "@visulima/fs";
import { svgToCssDataUri, svgToTinyDataUri } from "@visulima/packem-share";
// eslint-disable-next-line import/no-extraneous-dependencies
import mime from "mime";
import type { Plugin, PluginContext } from "rollup";

export type DataUriPluginOptions = {
    exclude?: FilterPattern;
    include?: FilterPattern;
    /** Encode spaces for use in srcset attribute */
    srcset?: boolean;
};

/**
 * Data URI plugin that converts files to data URIs for inline embedding.
 *
 * Query parameters:
 * - ?data-uri - Basic data URI conversion
 * - ?data-uri and encoding=css - Use CSS-optimized SVG encoding
 * - ?data-uri and encoding=tiny - Use tiny SVG encoding (default)
 * - ?data-uri and srcset - Encode spaces as %20 for srcset compatibility
 *
 * Examples:
 * - ./icon.svg?data-uri - Tiny SVG encoding
 * - ./icon.svg?data-uri and encoding=css - CSS-optimized SVG encoding
 * - ./icon.svg?data-uri and srcset - Tiny SVG with srcset compatibility
 * - ./icon.svg?data-uri and encoding=css and srcset - CSS encoding with srcset compatibility
 */
export const dataUriPlugin = (options: DataUriPluginOptions = {}): Plugin => {
    // Create filter function for include/exclude patterns
    const filterFn = createFilter(options.include ?? [/\?data-uri/], options.exclude);
    const idFilter = (id: string) => filterFn(id);

    return {
        load: {
            filter: {
                // @ts-expect-error - Rollup's StringFilter type doesn't properly accept function types from createFilter
                id: idFilter,
            },
            async handler(this: PluginContext, id: string) {
                if (!id.includes("?data-uri")) {
                    return undefined;
                }

            // Parse query parameters
            const url = new URL(id, "file://");
            const cleanId = url.pathname;
            const encoding = url.searchParams.get("encoding") || "tiny";
            const srcset = url.searchParams.has("srcset") || options.srcset;

            this.addWatchFile(cleanId);

            const type = mime.getType(cleanId) || "application/octet-stream";

            if (type === "image/svg+xml") {
                const svg = (await readFile(cleanId, { buffer: false })) as string;
                const svgUri = encoding === "css" ? svgToCssDataUri(svg) : svgToTinyDataUri(svg);
                const uri = srcset ? svgUri.replaceAll(" ", "%20") : svgUri;

                return `export default "${uri}"`;
            }

            const buf = (await readFile(cleanId, { buffer: true })) as unknown as Uint8Array;
            const base64 = Buffer.from(buf).toString("base64");
            const prefix = type.startsWith("text/") ? `data:${type};charset=utf-8;base64,` : `data:${type};base64,`;
            const uri = `${prefix}${base64}`;

            return `export default "${uri}"`;
            },
        },
        name: "packem:data-uri",
    };
};

export default dataUriPlugin;
