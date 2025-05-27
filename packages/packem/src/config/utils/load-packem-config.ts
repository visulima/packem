import type { Jiti } from "jiti";

import type { BuildConfig, BuildConfigFunction, Environment, Mode } from "../../types";
import findPackemFile from "./find-packem-file";

const loadPackemConfig = async (
    jiti: Jiti,
    rootDirectory: string,
    environment: Environment,
    mode: Mode,
    configPath?: string,
): Promise<{
    config: BuildConfig;
    path: string;
}> => {
    const packemConfigFilePath = await findPackemFile(rootDirectory, configPath);

    let buildConfig = (await jiti.import(packemConfigFilePath, { default: true, try: true }) || {}) as BuildConfig | BuildConfigFunction;

    if (typeof buildConfig === "function") {
        buildConfig = await buildConfig(environment, mode);
    }

    return {
        config: buildConfig,
        path: packemConfigFilePath,
    };
};

export default loadPackemConfig;
