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
export const createDefuWithHooksMerger = (): ReturnType<typeof createDefu> => createDefu((object, key, value) => {
    // For hooks property, merge the hooks object instead of overwriting
    // This handles both cases: when obj[key] exists and when it doesn't
    if (key === "hooks" && typeof value === "object" && value !== null && !Array.isArray(value)) {
        // If obj[key] is undefined or null, initialize it as an empty object
        // If obj[key] exists, use it; otherwise start with empty object
        const existingHooks = typeof object[key] === "object" && object[key] !== null && !Array.isArray(object[key]) ? object[key] : {};

        // Merge hooks: spread both objects, with value (source) taking precedence over existing
        // This ensures hooks from all sources are merged
        // Note: In defu, sources are processed from right to left, so we want to preserve
        // hooks from earlier sources (rightmost) when merging later sources (leftmost)
        object[key] = {
            ...existingHooks,
            ...value,
        };

        // #region agent log
        try {
            const fs = require("node:fs");

            fs.appendFileSync(
                "/tmp/defu-merger-called.log",
                `Merger called: key=${key}, existingKeys=${Object.keys(existingHooks).join(",")}, valueKeys=${Object.keys(value).join(",")}, resultKeys=${Object.keys(object[key]).join(",")}\n`,
            );
        } catch {}

        // #endregion
        return true; // Indicate custom merging was applied
    }

    return false; // Use default merging for other properties
});
