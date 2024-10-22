import { parse, resolve } from "@visulima/path";
import type { Result } from "postcss-load-config";
import postcssrc from "postcss-load-config";

import type { Environment } from "../../../../../types";
import type { PostCSSConfigLoaderOptions } from "../../types";
import { ensurePCSSOption, ensurePCSSPlugins } from "../../utils/options";

let configCache: Result | undefined;

const loadConfig = async (id: string, cwd: string, environment: Environment, options?: PostCSSConfigLoaderOptions | false): Promise<Result> => {
    if (!options) {
        return { file: "", options: {}, plugins: [] };
    }

    const { dir } = parse(id);

    const searchPath = options.path ? resolve(options.path) : dir;

    try {
        let postcssConfig: Result;

        if (configCache) {
            postcssConfig = configCache;
        } else {
            postcssConfig = await postcssrc(
                {
                    cwd,
                    env: environment,
                    ...options.ctx,
                },
                searchPath,
            );

            configCache = postcssConfig;
        }

        const result: Result = { file: postcssConfig.file, options: postcssConfig.options, plugins: await ensurePCSSPlugins(postcssConfig.plugins, cwd) };

        if (result.options.parser) {
            result.options.parser = await ensurePCSSOption(result.options.parser, "parser", cwd);
        }

        if (result.options.syntax) {
            result.options.syntax = await ensurePCSSOption(result.options.syntax, "syntax", cwd);
        }

        if (result.options.stringifier) {
            result.options.stringifier = await ensurePCSSOption(result.options.stringifier, "stringifier", cwd);
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

export default loadConfig;
