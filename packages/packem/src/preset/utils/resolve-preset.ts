import type { BuildConfig, BuildPreset } from "../../types";
import tryRequire from "../../utils/try-require";
import autoPreset from "../auto";

const resolvePreset = (preset: BuildPreset | "auto" | "none" | (NonNullable<unknown> & string), rootDirectory: string): BuildConfig => {
    if (preset === "auto") {
        // eslint-disable-next-line no-param-reassign
        preset = autoPreset;
    } else if (preset === "none") {
        return {};
    } else if (typeof preset === "string") {
        // eslint-disable-next-line no-param-reassign
        preset = tryRequire(preset, rootDirectory);
    }

    if (typeof preset === "function") {
        // eslint-disable-next-line no-param-reassign
        preset = preset();
    }

    return preset as BuildConfig;
};

export default resolvePreset;
