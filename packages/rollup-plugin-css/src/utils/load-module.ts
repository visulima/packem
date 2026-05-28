import { createRequire } from "node:module";

import type { RollupLogger } from "@visulima/packem-share/utils";
import { interopDefault, loadModule as mllyLoadModule } from "mlly";

import type { ResolveOptions } from "./resolve";
import { resolve } from "./resolve";

type Require = (id: string) => unknown;

const loaded: Record<string, unknown> = {};
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
    if (loaded[moduleId]) {
        return loaded[moduleId];
    }

    if (loaded[moduleId] === null) {
        return undefined;
    }

    const options: ResolveOptions = {
        baseDirs: [cwd],
        caller: "Module loader",
        extensions,
        symlinks: false,
    };

    const require = createRequire(import.meta.url) as unknown as Require;

    try {
        const resolvedPath = resolve([moduleId, `./${moduleId}`], options);

        // Skip data URLs as they can't handle relative imports
        if (resolvedPath.startsWith("data:")) {
            logger.warn({ message: `Skipping data URL module: ${moduleId}`, module: moduleId, plugin: "css" });

            // eslint-disable-next-line unicorn/no-null
            loaded[moduleId] = null;

            return undefined;
        }

        loaded[moduleId] = await loadModuleFromPath(resolvedPath, require);
    } catch (error) {
        logger.warn({
            message: `Failed to resolve or load module: ${error instanceof Error ? error.message : String(error)}`,
            module: moduleId,
            plugin: "css",
        });

        // eslint-disable-next-line unicorn/no-null
        loaded[moduleId] = null;

        return undefined;
    }

    const module = loaded[moduleId] as { default?: unknown } | undefined;

    return module?.default ?? module;
};

export default loadModule;
