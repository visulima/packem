import type { NormalizedPackageJson } from "@visulima/package";

import type { BuildConfig } from "../../../types";

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value !== "";

const overwriteWithPublishConfig = (packageJson: NormalizedPackageJson, declaration?: BuildConfig["declaration"]): NormalizedPackageJson => {
    const { publishConfig } = packageJson;

    if (!publishConfig) {
        return packageJson;
    }

    /* eslint-disable no-param-reassign -- intentionally overlaying publishConfig fields onto the package.json the caller owns. */
    if (publishConfig.bin && (typeof publishConfig.bin === "object" || typeof publishConfig.bin === "string")) {
        packageJson.bin = publishConfig.bin as NormalizedPackageJson["bin"];
    }

    if (isNonEmptyString(publishConfig.type)) {
        packageJson.type = publishConfig.type as NormalizedPackageJson["type"];
    }

    if (isNonEmptyString(publishConfig.main)) {
        packageJson.main = publishConfig.main;
    }

    if (isNonEmptyString(publishConfig.module)) {
        packageJson.module = publishConfig.module;
    }

    if (declaration === undefined && isNonEmptyString(publishConfig.types)) {
        packageJson.types = publishConfig.types;
    } else if (declaration === undefined && isNonEmptyString(publishConfig.typings)) {
        packageJson.typings = publishConfig.typings;
    }

    if (publishConfig.exports && typeof publishConfig.exports === "object") {
        packageJson.exports = publishConfig.exports as NormalizedPackageJson["exports"];
    }
    /* eslint-enable no-param-reassign -- end publishConfig overlay. */

    return packageJson;
};

export default overwriteWithPublishConfig;
