import { createDefu } from "defu";

/**
 * Creates a custom defu instance that properly merges hooks objects instead of overwriting them.
 * This is necessary because defu's default behavior overwrites objects, but hooks need to be merged
 * so that hooks from both presets and user configs are preserved.
 * @returns A custom defu function that merges hooks objects
 * @example
 * ```typescript
 * const customDefu = createDefuWithHooksMerger();
 * const merged = customDefu(userConfig, presetConfig, autoPreset);
 * // hooks from all configs are now merged instead of overwritten
 * ```
 */
// eslint-disable-next-line import/prefer-default-export -- consumed as a named import across modules owned outside this change set; switching to a default export would break those call sites.
export const createDefuWithHooksMerger = (): ReturnType<typeof createDefu> =>
    createDefu((object, key, value) => {
        if (key === "hooks" && typeof value === "object" && value !== null && !Array.isArray(value)) {
            const existingHooks = typeof object[key] === "object" && object[key] !== null && !Array.isArray(object[key]) ? object[key] : {};

            // eslint-disable-next-line no-param-reassign -- defu's custom merger contract requires mutating the accumulator object in place to take effect.
            object[key] = {
                ...existingHooks,
                ...value,
            };

            return true;
        }

        return false;
    });
