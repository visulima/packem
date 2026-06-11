import ensureAutoModules from "../loaders/utils/ensure-auto-modules";
import type { AutoModules } from "../types";

/** Shape of a loader's `modules` option (boolean toggle or object with an `include` matcher). */
export type ModulesOption = boolean | { include?: AutoModules } | undefined;

/**
 * Resolves whether CSS modules processing should be enabled for a file, applying
 * the shared cascade used by every loader:
 *
 * 1. `modules: boolean` → use it directly.
 * 2. `modules: object` → match `modules.include` against the file id.
 * 3. otherwise, when `modules` is unset and `autoModules` is configured → match `autoModules`.
 * @param modules The loader's `modules` option.
 * @param autoModules The plugin-level `autoModules` configuration.
 * @param id File identifier/path to test.
 * @returns Whether CSS modules should be enabled for this file.
 */
const detectCssModules = (modules: ModulesOption, autoModules: AutoModules | undefined, id: string): boolean => {
    if (typeof modules === "boolean") {
        return modules;
    }

    if (typeof modules === "object") {
        return ensureAutoModules(modules.include, id);
    }

    if (autoModules) {
        return ensureAutoModules(autoModules, id);
    }

    return false;
};

export default detectCssModules;
