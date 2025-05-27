import { interopDefault, loadModule } from "mlly";

import type { ResolveOptions } from "./resolve";
import { resolve } from "./resolve";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loaded: Record<string, any> = {};
const extensions = [".js", ".mjs", ".cjs", ".json"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async (moduleId: string, cwd: string): Promise<any> => {
    if (loaded[moduleId]) {
        return loaded[moduleId];
    }

    if (loaded[moduleId] === undefined) {
        return undefined;
    }

    const options: ResolveOptions = {
        baseDirs: [cwd],
        caller: "Module loader",
        extensions,
        symlinks: false,
    };

    try {
        // eslint-disable-next-line import/no-dynamic-require,security/detect-non-literal-require,@typescript-eslint/no-require-imports,global-require,unicorn/prefer-module
        loaded[moduleId] = require(resolve([moduleId, `./${moduleId}`], options));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        if (error.code === "ERR_REQUIRE_ESM") {
            try {
                loaded[moduleId] = interopDefault(await loadModule(resolve([moduleId, `./${moduleId}`], options)));
            } catch {
                // continue
            }
        } else {
            loaded[moduleId] = undefined;

            return undefined;
        }
    }

    const module = loaded[moduleId];

    return module?.default ?? module;
};
