import findPackemFile from "./find-packem-file";
import type { BuildConfigFunction, BuildConfig, Environment, Mode } from "../../types";
import type { Jiti } from "jiti";

const loadPackemConfig = async (jiti: Jiti, rootDirectory: string, environment: Environment, mode: Mode, configPath?: string): Promise<{
    config: BuildConfig;
    path: string;
}> => {
    const packemConfigFilePath = await findPackemFile(rootDirectory, configPath);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    let buildConfig = ((await jiti.import(packemConfigFilePath, { default: true, try: true })) || {}) as BuildConfig | BuildConfigFunction;

    if (typeof buildConfig === "function") {
        buildConfig = await buildConfig(environment, mode);
    }

    return {
        config: buildConfig,
        path: packemConfigFilePath,
    };
};

export default loadPackemConfig;
