import { findMonorepoRoot, findPackageRoot } from "@visulima/package";
import type { Environment } from "@visulima/packem-share/types";
import type { RollupLogger } from "@visulima/packem-share/utils";
import { parse, resolve } from "@visulima/path";
import type { Result } from "postcss-load-config";
import postcssrc from "postcss-load-config";

import type { PostCSSConfigLoaderOptions } from "../../types";
import { ensurePCSSOption, ensurePCSSPlugins } from "../../utils/options";

let configCache: Result | undefined;

const loadConfig = async (id: string, cwd: string, environment: Environment, logger: RollupLogger, options?: PostCSSConfigLoaderOptions | false): Promise<Result> => {
    if (!options) {
        return { file: "", options: {}, plugins: [] };
    }

    const { dir } = parse(id);

    const searchPath = options.path ? resolve(options.path) : dir;

    let stopDirectory: string | undefined;

    try {
        const foundMonorepoRoot = await findMonorepoRoot(cwd);

        stopDirectory = foundMonorepoRoot.path;
    } catch {
        try {
            const foundPackageRoot = await findPackageRoot(cwd);

            stopDirectory = foundPackageRoot;
        } catch {
            // Do nothing
        }
    }

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
                {
                    stopDir: stopDirectory,
                },
            );

            configCache = postcssConfig;
        }

        const result: Result = { file: postcssConfig.file, options: postcssConfig.options, plugins: await ensurePCSSPlugins(postcssConfig.plugins, cwd, logger) };

        if (result.options.parser) {
            result.options.parser = await ensurePCSSOption(result.options.parser, "parser", cwd, logger);
        }

        if (result.options.syntax) {
            result.options.syntax = await ensurePCSSOption(result.options.syntax, "syntax", cwd, logger);
        }

        if (result.options.stringifier) {
            result.options.stringifier = await ensurePCSSOption(result.options.stringifier, "stringifier", cwd, logger);
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
