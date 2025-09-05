import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { readFile } from "@visulima/fs";
import type { Plugin } from "rollup";

export interface RawLoaderOptions {
    exclude?: FilterPattern;
    include?: FilterPattern;
}

export const rawPlugin = (options: RawLoaderOptions): Plugin => {
    const filter = createFilter(options.include, options.exclude);

    return <Plugin>{
        async load(id) {
            if (id.includes("?raw")) {
                const cleanId = id.split("?")[0] as string;

                try {
                    const content = await readFile(cleanId);

                    // Normalize line endings only on Windows: convert \r\n to \n
                    return process.platform === "win32"
                        ? content.replaceAll("\r\n", "\n")
                        : content;
                } catch {
                    this.error(`Failed to read file: ${cleanId}`);
                }
            }

            // eslint-disable-next-line unicorn/no-null
            return null;
        },
        name: "packem:raw",

        transform(code, id) {
            // Check if the file has ?raw query parameter
            const isRawQuery = id.includes("?raw");
            const cleanId = isRawQuery ? id.split("?")[0] : id;

            if (filter(cleanId) || isRawQuery) {
                // Normalize line endings only on Windows for .txt and .data files
                const normalizedCode
                    = process.platform === "win32" ? code.replaceAll("\r\n", "\n") : code;

                return {
                    code: `const data = ${JSON.stringify(normalizedCode)};\nexport default data;`,
                    // eslint-disable-next-line unicorn/no-null
                    map: null,
                };
            }

            // eslint-disable-next-line unicorn/no-null
            return null;
        },
    };
};
