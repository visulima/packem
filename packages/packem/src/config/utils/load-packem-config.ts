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

    const imported = await jiti.import<BuildConfig | BuildConfigFunction>(packemConfigFilePath, {
        default: true,
        try: true,
    });

    // `try: true` makes jiti return `undefined` when the config file is absent
    // or fails to load; the project's relaxed `strictNullChecks` hides that
    // `| undefined` from the type checker, so the fallback guard stays.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime jiti `try: true` can yield undefined; relaxed strictNullChecks masks it.
    const resolved: BuildConfig | BuildConfigFunction = imported ?? {};

    const buildConfig: BuildConfig = typeof resolved === "function" ? await resolved(environment, mode) : resolved;

    return {
        config: buildConfig,
        path: packemConfigFilePath,
    };
};

export default loadPackemConfig;
