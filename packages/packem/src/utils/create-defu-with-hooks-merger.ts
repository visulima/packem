import { createDefu } from "defu";

/**
 * Creates a custom defu instance that properly merges hooks objects instead of overwriting them.
 * This is necessary because defu's default behavior overwrites objects, but hooks need to be merged
 * so that hooks from both presets and user configs are preserved.
 *
 * @returns A custom defu function that merges hooks objects
 * @example
 * ```typescript
 * const customDefu = createDefuWithHooksMerger();
 * const merged = customDefu(userConfig, presetConfig, autoPreset);
 * // hooks from all configs are now merged instead of overwritten
 * ```
 */
export const createDefuWithHooksMerger = (): ReturnType<typeof createDefu> => {
    return createDefu((obj, key, value) => {
        // For hooks property, merge the hooks object instead of overwriting
        if (key === "hooks" && typeof obj[key] === "object" && obj[key] !== null && typeof value === "object" && value !== null) {
            // Merge hooks: spread both objects, with later hooks taking precedence
            obj[key] = {
                ...obj[key],
                ...value,
            };
            return true; // Indicate custom merging was applied
        }
        return false; // Use default merging for other properties
    });
};
