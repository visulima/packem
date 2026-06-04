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

const safeMtime = async (file: string): Promise<number> => {
    try {
        const stats = await stat(file);

        return stats.mtimeMs;
    } catch {
        return 0;
    }
};

// The stop directory only depends on `cwd`, which is constant for the whole
// build, yet loadConfig runs once per CSS file. Memoize the (potentially two)
// directory-tree walks per cwd so we don't repeat the FS traversal per file.
const stopDirectoryCache = new Map<string, Promise<string | undefined>>();

const computeStopDirectory = async (cwd: string): Promise<string | undefined> => {
    try {
        const foundMonorepoRoot = await findMonorepoRoot(cwd);

        return foundMonorepoRoot.path;
    } catch {
        try {
            return await findPackageRoot(cwd);
        } catch {
            return undefined;
        }
    }
};

const resolveStopDirectory = async (cwd: string): Promise<string | undefined> => {
    let cached = stopDirectoryCache.get(cwd);

    if (!cached) {
        cached = computeStopDirectory(cwd);
        stopDirectoryCache.set(cwd, cached);
    }

    return cached;
};

const normalizeConfig = async (postcssConfig: Result, cwd: string, logger: RollupLogger): Promise<Result> => {
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
};

const loadOrCachePostcssConfig = async (
    options: PostCSSConfigLoaderOptions,
    cwd: string,
    environment: Environment,
    logger: RollupLogger,
    searchPath: string,
    stopDirectory: string | undefined,
): Promise<Result> => {
    const cached = configCache.get(searchPath);

    if (cached) {
        const currentMtime = await safeMtime(cached.result.file);

        if (currentMtime > 0 && currentMtime <= cached.mtime) {
            return cached.result;
        }

        // File changed or disappeared, clear and reload below.
        configCache.delete(searchPath);
    }

    const postcssConfig = await postcssrc(
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

    // Cache the fully-normalized result so a per-file cache hit can return it
    // directly without re-running ensurePCSSPlugins/ensurePCSSOption each time.
    const result = await normalizeConfig(postcssConfig, cwd, logger);

    const mtime = await safeMtime(postcssConfig.file);

    configCache.set(searchPath, { mtime, result });

    return result;
};

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

    const stopDirectory = await resolveStopDirectory(cwd);

    try {
        return await loadOrCachePostcssConfig(options, cwd, environment, logger, searchPath, stopDirectory);
    } catch (error) {
        if (error instanceof Error && error.message.includes("No PostCSS Config found in")) {
            return { file: "", options: {}, plugins: [] };
        }

        throw error;
    }
};

export default loadConfig;
