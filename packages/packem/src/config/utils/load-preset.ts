import type { Jiti } from "jiti";

import type { BuildConfig, BuildPreset } from "../../types";
import { createReactPreset } from "../preset/react";
import { createSolidPreset } from "../preset/solid";
import { createSveltePreset } from "../preset/svelte";
import { createVuePreset } from "../preset/vue";

const loadPreset = async (preset: BuildPreset | string, jiti: Jiti): Promise<BuildConfig> => {
    switch (preset) {
        case "none": {
            return {};
        }
        case "react": {
            // eslint-disable-next-line no-param-reassign
            preset = createReactPreset();

            break;
        }
        case "solid": {
            // eslint-disable-next-line no-param-reassign
            preset = createSolidPreset();

            break;
        }
        case "svelte": {
            // eslint-disable-next-line no-param-reassign
            preset = createSveltePreset();

            break;
        }
        case "vue": {
            // eslint-disable-next-line no-param-reassign
            preset = createVuePreset();

            break;
        }
        default: {
            if (typeof preset === "string") {
                // eslint-disable-next-line no-param-reassign
                preset = await jiti.import(preset) || {};
            }
        }
    }

    if (typeof preset === "function") {
        // eslint-disable-next-line no-param-reassign
        preset = preset();
    }

    return preset as BuildConfig;
};

export default loadPreset;
