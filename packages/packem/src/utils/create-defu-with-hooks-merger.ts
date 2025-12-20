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
export const createDefuWithHooksMerger = (): ReturnType<typeof createDefu> =>
    createDefu((object, key, value) => {
        if (key === "hooks" && typeof value === "object" && value !== null && !Array.isArray(value)) {
            const existingHooks = typeof object[key] === "object" && object[key] !== null && !Array.isArray(object[key]) ? object[key] : {};

            object[key] = {
                ...existingHooks,
                ...value,
            };

            return true;
        }

        return false;
    });
