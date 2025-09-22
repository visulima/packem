import type { NormalizedPackageJson } from "@visulima/package";

import type { BuildConfig } from "../../../types";

const overwriteWithPublishConfig = (packageJson: NormalizedPackageJson, declaration?: BuildConfig["declaration"]): NormalizedPackageJson => {
    const { publishConfig } = packageJson;

    if (publishConfig) {
        if (publishConfig.bin && (typeof publishConfig.bin === "object" || typeof publishConfig.bin === "string")) {
            // eslint-disable-next-line no-param-reassign
            packageJson.bin = publishConfig.bin as NormalizedPackageJson["bin"];
        }

        if (publishConfig.type && typeof publishConfig.type === "string" && publishConfig.type !== "") {
            // eslint-disable-next-line no-param-reassign
            packageJson.type = publishConfig.type as NormalizedPackageJson["type"];
        }

        if (publishConfig.main && typeof publishConfig.main === "string" && publishConfig.main !== "") {
            // eslint-disable-next-line no-param-reassign
            packageJson.main = publishConfig.main as NormalizedPackageJson["main"];
        }

        if (publishConfig.module && typeof publishConfig.module === "string" && publishConfig.module !== "") {
            // eslint-disable-next-line no-param-reassign
            packageJson.module = publishConfig.module as NormalizedPackageJson["module"];
        }

        if (declaration === undefined && publishConfig.types && typeof publishConfig.types === "string" && publishConfig.types !== "") {
            // eslint-disable-next-line no-param-reassign
            packageJson.types = publishConfig.types as NormalizedPackageJson["types"];
        } else if (declaration === undefined && publishConfig.typings && typeof publishConfig.typings === "string" && publishConfig.typings !== "") {
            // eslint-disable-next-line no-param-reassign
            packageJson.typings = publishConfig.typings as NormalizedPackageJson["typings"];
        }

        if (publishConfig.exports && typeof publishConfig.exports === "object") {
            // eslint-disable-next-line no-param-reassign
            packageJson.exports = publishConfig.exports as NormalizedPackageJson["exports"];
        }
    }

    return packageJson;
};

export default overwriteWithPublishConfig;
