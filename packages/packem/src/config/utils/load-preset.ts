import type { Jiti } from "jiti";

import type { BuildConfig, BuildPreset } from "../../types";

const loadPreset = async (preset: BuildPreset | string, jiti: Jiti): Promise<BuildConfig> => {
    switch (preset) {
        case "none": {
            return {};
        }
        case "preact": {
            const { createPreactPreset } = await import("../preset/preact");

            // eslint-disable-next-line no-param-reassign
            preset = createPreactPreset();

            break;
        }
        case "react": {
            const { createReactPreset } = await import("../preset/react");

            // eslint-disable-next-line no-param-reassign
            preset = createReactPreset();

            break;
        }
        case "solid": {
            const { createSolidPreset } = await import("../preset/solid");

            // eslint-disable-next-line no-param-reassign
            preset = createSolidPreset();

            break;
        }
        case "svelte": {
            const { createSveltePreset } = await import("../preset/svelte");

            // eslint-disable-next-line no-param-reassign
            preset = createSveltePreset();

            break;
        }
        case "vue": {
            const { createVuePreset } = await import("../preset/vue");

            // eslint-disable-next-line no-param-reassign
            preset = createVuePreset();

            break;
        }
        default: {
            if (typeof preset === "string") {
                // eslint-disable-next-line no-param-reassign
                preset = (await jiti.import(preset)) || {};
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
