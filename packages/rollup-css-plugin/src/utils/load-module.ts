import { createRequire } from "node:module";

import { interopDefault, loadModule as mllyLoadModule } from "mlly";

import type { ResolveOptions } from "./resolve";
import { resolve } from "./resolve";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loaded: Record<string, any> = {};
const extensions = [".js", ".mjs", ".cjs", ".json"];

// Helper function to load module from resolved path
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadModuleFromPath = async (resolvedPath: string, require: NodeRequire): Promise<any> => {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadModule = async (moduleId: string, cwd: string): Promise<any> => {
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

    const require = createRequire(import.meta.url);

    try {
        const resolvedPath = resolve([moduleId, `./${moduleId}`], options);

        // Skip data URLs as they can't handle relative imports
        if (resolvedPath.startsWith("data:")) {
            console.warn(`Skipping data URL module: ${moduleId}`);
            // eslint-disable-next-line unicorn/no-null
            loaded[moduleId] = null;

            return undefined;
        }

        loaded[moduleId] = await loadModuleFromPath(resolvedPath, require);
    } catch (error) {
        console.warn("Failed to resolve or load module:", error);
        // eslint-disable-next-line unicorn/no-null
        loaded[moduleId] = null;

        return undefined;
    }

    const module = loaded[moduleId];

    return module?.default ?? module;
};

export default loadModule;
