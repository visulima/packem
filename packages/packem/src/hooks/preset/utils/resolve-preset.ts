import { createJiti } from "jiti";

import type { BuildConfig, BuildPreset } from "../../../types";
import autoPreset from "../auto";

const resolvePreset = async (preset: BuildPreset | string, rootDirectory: string): Promise<BuildConfig> => {
    if (preset === "auto") {
        // eslint-disable-next-line no-param-reassign
        preset = autoPreset;
    } else if (preset === "none") {
        return {};
    } else if (typeof preset === "string") {
        // eslint-disable-next-line no-param-reassign
        preset = (await createJiti(rootDirectory).import(preset)) || {};
    }

    if (typeof preset === "function") {
        // eslint-disable-next-line no-param-reassign
        preset = preset();
    }

    return preset as BuildConfig;
};

export default resolvePreset;
