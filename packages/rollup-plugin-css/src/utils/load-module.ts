import { createRequire } from "node:module";

import type { RollupLogger } from "@visulima/packem-share/utils";
import { interopDefault, loadModule as mllyLoadModule } from "mlly";

import type { ResolveOptions } from "./resolve";
import { resolve } from "./resolve";

type Require = (id: string) => unknown;

// Cache keyed by `cwd\0moduleId` so the same module id resolved from different
// working directories (e.g. two projects sharing one process) does not collide.
// A `null` value records a previous failure-to-load so we don't retry it.
const loaded = new Map<string, unknown>();
const extensions = [".js", ".mjs", ".cjs", ".json"];

// Helper function to load module from resolved path
const loadModuleFromPath = async (resolvedPath: string, require: Require): Promise<unknown> => {
    try {
        // First try to load as CommonJS using require
        // eslint-disable-next-line import/no-dynamic-require
        return require(resolvedPath);
    } catch (error: unknown) {
        const nodeError = error as NodeJS.ErrnoException;

        if (nodeError.code === "ERR_REQUIRE_ESM") {
            // If it's an ESM module, use mlly to load it
            return interopDefault(await mllyLoadModule(resolvedPath));
        }

        // Re-throw other errors
        throw nodeError;
    }
};

const loadModule = async (moduleId: string, cwd: string, logger: RollupLogger): Promise<unknown> => {
    const cacheKey = `${cwd}\0${moduleId}`;

    if (loaded.has(cacheKey)) {
        const cached = loaded.get(cacheKey);

        if (cached === null) {
            return undefined;
        }

        const cachedModule = cached as { default?: unknown } | undefined;

        return cachedModule?.default ?? cachedModule;
    }

    const options: ResolveOptions = {
        baseDirs: [cwd],
        caller: "Module loader",
        extensions,
        symlinks: false,
    };

    const require: Require = createRequire(import.meta.url);

    try {
        const resolvedPath = resolve([moduleId, `./${moduleId}`], options);

        // Skip data URLs as they can't handle relative imports
        if (resolvedPath.startsWith("data:")) {
            logger.warn({ message: `Skipping data URL module: ${moduleId}`, module: moduleId, plugin: "css" });

            // eslint-disable-next-line unicorn/no-null
            loaded.set(cacheKey, null);

            return undefined;
        }

        loaded.set(cacheKey, await loadModuleFromPath(resolvedPath, require));
    } catch (error) {
        logger.warn({
            message: `Failed to resolve or load module: ${error instanceof Error ? error.message : String(error)}`,
            module: moduleId,
            plugin: "css",
        });

        // eslint-disable-next-line unicorn/no-null
        loaded.set(cacheKey, null);

        return undefined;
    }

    const module = loaded.get(cacheKey) as { default?: unknown } | undefined;

    return module?.default ?? module;
};

export default loadModule;
