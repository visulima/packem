import { stat } from "node:fs/promises";

import { findMonorepoRoot, findPackageRoot } from "@visulima/package";
import type { Environment } from "@visulima/packem-share/types";
import type { RollupLogger } from "@visulima/packem-share/utils";
import { parse, resolve } from "@visulima/path";
import type { Result } from "postcss-load-config";
import postcssrc from "postcss-load-config";

import type { PostCSSConfigLoaderOptions } from "../../types";
import { ensurePCSSOption, ensurePCSSPlugins } from "../../utils/options";

// Cache keyed by config file path, storing the loaded result and the mtime
// at the time it was cached so watch-mode changes are detected.
const configCache = new Map<string, { mtime: number; result: Result }>();

const loadConfig = async (
    id: string,
    cwd: string,
    environment: Environment,
    logger: RollupLogger,
    options?: PostCSSConfigLoaderOptions | false,
): Promise<Result> => {
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

        const cached = configCache.get(searchPath);

        if (cached) {
            // Re-validate the cached entry against the config file's current mtime.
            let currentMtime = 0;

            try {
                const stats = await stat(cached.result.file);

                currentMtime = stats.mtimeMs;
            } catch {
                // Config file disappeared — fall through to reload.
            }

            if (currentMtime > 0 && currentMtime <= cached.mtime) {
                postcssConfig = cached.result;
            } else {
                // File changed or disappeared, clear and reload below.
                configCache.delete(searchPath);
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

                let mtime = 0;

                try {
                    const stats = await stat(postcssConfig.file);

                    mtime = stats.mtimeMs;
                } catch {
                    // No config file on disk (e.g. programmatic config).
                }

                configCache.set(searchPath, { mtime, result: postcssConfig });
            }
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

            let mtime = 0;

            try {
                const stats = await stat(postcssConfig.file);

                mtime = stats.mtimeMs;
            } catch {
                // No config file on disk (e.g. programmatic config).
            }

            configCache.set(searchPath, { mtime, result: postcssConfig });
        }

        const result: Result = {
            file: postcssConfig.file,
            options: postcssConfig.options,
            plugins: await ensurePCSSPlugins(postcssConfig.plugins, cwd, logger),
        };

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
