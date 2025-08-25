import type { AutoModules } from "../../types";

// CSS modules auto-detection pattern based on Vite's implementation
// eslint-disable-next-line no-secrets/no-secrets
// https://github.com/vitejs/vite/blob/37af8a7be417f1fb2cf9a0d5e9ad90b76ff211b4/packages/vite/src/node/plugins/css.ts#L185

/** RegExp pattern to detect CSS module files by naming convention */
// eslint-disable-next-line regexp/no-unused-capturing-group
const MODULE_FILE_PATTERN = /\.module\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

/**
 * Determines if CSS modules should be enabled for a given file.
 *
 * This function checks various conditions to decide whether CSS modules
 * processing should be applied to a file:
 *
 * 1. If AutoModules is undefined, defaults to true (enable modules)
 * 2. If AutoModules is a function, calls it with the file ID
 * 3. If AutoModules is a RegExp, tests it against the file ID
 * 4. If AutoModules is true, uses the default module file pattern
 * 5. If AutoModules is false, modules are disabled
 *
 * The default pattern matches files with `.module.` in their name,
 * following the convention used by Vite and other build tools.
 * @param am AutoModules configuration (function, RegExp, boolean, or undefined)
 * @param id File identifier/path to test
 * @returns True if CSS modules should be enabled for this file
 * @example
 * ```typescript
 * // Function-based detection
 * ensureAutoModules((id) => id.includes('.module.'), 'styles.module.css') // true
 *
 * // RegExp-based detection
 * ensureAutoModules(/\.module\./, 'styles.module.css') // true
 *
 * // Boolean enable with default pattern
 * ensureAutoModules(true, 'styles.module.css') // true
 * ensureAutoModules(true, 'styles.css') // false
 *
 * // Boolean disable
 * ensureAutoModules(false, 'styles.module.css') // false
 *
 * // Undefined defaults to true with pattern check
 * ensureAutoModules(undefined, 'styles.module.css') // true
 * ```
 */
const ensureAutoModules = (am: AutoModules | undefined, id: string): boolean => {
    if (am === undefined) {
        return true;
    }

    if (typeof am === "function") {
        return am(id);
    }

    if (am instanceof RegExp) {
        return am.test(id);
    }

    return am && MODULE_FILE_PATTERN.test(id);
};

export default ensureAutoModules;
