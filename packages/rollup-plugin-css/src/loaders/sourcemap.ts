import { getMap, stripMap } from "../utils/sourcemap";
import type { Loader } from "./types";

/**
 * Source map loader for extracting and processing inline source maps from CSS.
 *
 * This loader:
 * - Extracts inline source maps from CSS comments
 * - Strips source map comments from the CSS content
 * - Provides the extracted source map for further processing
 *
 * This loader always processes files regardless of file type since source maps
 * can be present in any CSS content.
 * @example
 * ```css
 * // Input CSS with inline source map
 * .example { color: red; }
 * //# sourceMappingURL=data:application/json;base64,...
 * ```
 * @example
 * ```css
 * // Output CSS with source map stripped
 * .example { color: red; }
 * ```
 */
const loader: Loader = {
    /** Always process files since source maps can be in any CSS */
    alwaysProcess: true,
    name: "sourcemap",

    /**
     * Processes CSS content to extract and strip inline source maps.
     * @param payload The payload containing CSS code and optional source map
     * @param payload.code CSS content that may contain inline source maps
     * @param payload.map Existing source map (if any)
     * @returns Processed payload with source map stripped from code and extracted as separate map
     */
    async process({ code, map }) {
        return { code: stripMap(code), map: (await getMap(code, this.id)) ?? map };
    },
};

export default loader;
