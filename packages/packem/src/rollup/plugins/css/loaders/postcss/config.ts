import { parse, resolve } from "@visulima/path";
import type { Result } from "postcss-load-config";
import postcssrc from "postcss-load-config";

import type { PostCSSConfigLoaderOptions } from "../../types";
import { ensurePCSSOption, ensurePCSSPlugins } from "../../utils/options";

let configCache: Result | undefined;

export default async (id: string, config?: PostCSSConfigLoaderOptions | false): Promise<Result> => {
    if (!config) {
        return { file: "", options: {}, plugins: [] };
    }

    const { dir } = parse(id);

    const searchPath = config.path ? resolve(config.path) : dir;

    try {
        let postcssConfig: Result;

        if (configCache) {
            postcssConfig = configCache;
        } else {
            postcssConfig = await postcssrc(
                {
                    cwd: process.cwd(),
                    env: process.env.NODE_ENV ?? "development",
                    ...config.ctx,
                },
                searchPath,
            );

            configCache = postcssConfig;
        }

        const result: Result = { file: postcssConfig.file, options: postcssConfig.options, plugins: ensurePCSSPlugins(postcssConfig.plugins) };

        if (result.options.parser) {
            result.options.parser = ensurePCSSOption(result.options.parser, "parser");
        }

        if (result.options.syntax) {
            result.options.syntax = ensurePCSSOption(result.options.syntax, "syntax");
        }

        if (result.options.stringifier) {
            result.options.stringifier = ensurePCSSOption(result.options.stringifier, "stringifier");
        }

        return result;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        if (error.message.includes("No PostCSS Config found in")) {
            return { file: "", options: {}, plugins: [] };
        }

        throw error;
    }
};