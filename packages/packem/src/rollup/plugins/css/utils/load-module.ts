import { createRequire } from "node:module";

import { interopDefault, loadModule } from "mlly";

import type { ResolveOptions } from "./resolve";
import { resolve } from "./resolve";

const require = createRequire(import.meta.url);

const loaded: Record<string, unknown> = {};
const extensions = [".js", ".mjs", ".cjs", ".json"];

export default async (moduleId: string, cwd: string): Promise<unknown> => {
    // eslint-disable-next-line security/detect-object-injection
    if (loaded[moduleId]) {
        // eslint-disable-next-line security/detect-object-injection
        return loaded[moduleId];
    }

    // eslint-disable-next-line security/detect-object-injection
    if (loaded[moduleId] === null) {
        return undefined;
    }

    const options: ResolveOptions = {
        basedirs: [cwd],
        caller: "Module loader",
        extensions,
        symlinks: false,
    };

    try {
        // eslint-disable-next-line security/detect-object-injection,import/no-dynamic-require,security/detect-non-literal-require
        loaded[moduleId] = require(resolve([moduleId, `./${moduleId}`], options));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        if (error.code === "ERR_REQUIRE_ESM") {
            try {
                // eslint-disable-next-line security/detect-object-injection
                loaded[moduleId] = interopDefault(await loadModule(resolve([moduleId, `./${moduleId}`], options)));
            } catch {
                // continue
            }
        } else {
            // eslint-disable-next-line security/detect-object-injection
            loaded[moduleId] = null;

            return undefined;
        }
    }

    // eslint-disable-next-line security/detect-object-injection
    return loaded[moduleId];
};
