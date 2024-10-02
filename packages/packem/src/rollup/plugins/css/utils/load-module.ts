import { createRequire } from "node:module";

import type { ResolveOptions } from "./resolve";
import { resolveSync } from "./resolve";

const require = createRequire(import.meta.url);

const loaded: Record<string, unknown> = {};

const options: ResolveOptions = {
    basedirs: [process.cwd()],
    caller: "Module loader",
    extensions: [".js", ".mjs", ".cjs", ".json"],
    packageFilter: (package_) => package_,
    preserveSymlinks: false,
};

export default (moduleId: string): unknown => {
    // eslint-disable-next-line security/detect-object-injection
    if (loaded[moduleId]) {
        // eslint-disable-next-line security/detect-object-injection
        return loaded[moduleId];
    }

    // eslint-disable-next-line security/detect-object-injection
    if (loaded[moduleId] === null) {
        return null;
    }

    try {
        // eslint-disable-next-line security/detect-object-injection,import/no-dynamic-require,security/detect-non-literal-require
        loaded[moduleId] = require(resolveSync([moduleId, `./${moduleId}`], options));
    } catch {
        // eslint-disable-next-line security/detect-object-injection
        loaded[moduleId] = null;

        return null;
    }

    // eslint-disable-next-line security/detect-object-injection
    return loaded[moduleId];
}
