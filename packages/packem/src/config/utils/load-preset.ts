import type { Jiti } from "jiti";

import type { BuildConfig, BuildPreset } from "../../types";
import autoPreset from "../preset/auto";

const loadPreset = async (
    preset: BuildPreset | string,
    jiti: Jiti,
): Promise<BuildConfig> => {
    if (preset === "auto") {
        // eslint-disable-next-line no-param-reassign
        preset = autoPreset;
    } else if (preset === "none") {
        return {};
    } else if (typeof preset === "string") {
        // eslint-disable-next-line no-param-reassign
        preset = await jiti.import(preset) || {};
    }

    if (typeof preset === "function") {
        // eslint-disable-next-line no-param-reassign
        preset = preset();
    }

    return preset as BuildConfig;
};

export default loadPreset;
