import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { readFile } from "@visulima/fs";
import type { Plugin } from "rollup";

export interface RawLoaderOptions {
    exclude?: FilterPattern;
    include?: FilterPattern;
}

export const rawPlugin = (options: RawLoaderOptions): Plugin => {
    const filterFn = createFilter(options.include, options.exclude);

    return <Plugin>{
        load: {
            filter: {
                id: /\?raw/,
            },
            async handler(id) {
                // Double-check that this is actually a ?raw request
                // (filter should catch this, but this is a safety check)
                if (!id.includes("?raw")) {
                    return undefined;
                }

                const cleanId = id.split("?")[0] as string;

                try {
                    const content = await readFile(cleanId);

                    // Normalize line endings only on Windows: convert \r\n to \n
                    return process.platform === "win32" ? content.replaceAll("\r\n", "\n") : content;
                } catch {
                    // Return undefined instead of erroring to let other plugins handle it
                    return undefined;
                }
            },
        },
        name: "packem:raw",

        transform: {
            filter: {
                id: (id: string) => {
                    if (id.includes("?raw")) {
                        return true;
                    }

                    return filterFn(id);
                },
            },
            handler(code, id) {
                // Check if the file has ?raw query parameter
                const isRawQuery = id.includes("?raw");
                const cleanId = isRawQuery ? id.split("?")[0] : id;

                if (isRawQuery) {
                    // Normalize line endings only on Windows for .txt and .data files
                    const normalizedCode = process.platform === "win32" ? code.replaceAll("\r\n", "\n") : code;

                    return {
                        code: `const data = ${JSON.stringify(normalizedCode)};\nexport default data;`,
                        // eslint-disable-next-line unicorn/no-null
                        map: null,
                    };
                }

                // Process files that match include/exclude pattern
                if (filterFn(cleanId)) {
                    // Normalize line endings only on Windows for .txt and .data files
                    const normalizedCode = process.platform === "win32" ? code.replaceAll("\r\n", "\n") : code;

                    return {
                        code: `const data = ${JSON.stringify(normalizedCode)};\nexport default data;`,
                        // eslint-disable-next-line unicorn/no-null
                        map: null,
                    };
                }

                // eslint-disable-next-line unicorn/no-null
                return null;
            },
        },
    };
};
