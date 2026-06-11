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
    // `findPackemFile` guarantees the path exists (it throws otherwise), so we
    // load *without* jiti's `try: true`. A real syntax/import error in the
    // user's config must surface with a useful message instead of being
    // silently turned into `{}` (which would build with defaults).
    const packemConfigFilePath = await findPackemFile(rootDirectory, configPath);

    const imported = await jiti.import<BuildConfig | BuildConfigFunction>(packemConfigFilePath, {
        default: true,
    });

    // A config file that exports nothing usable still yields a defined module
    // object; the fallback keeps a missing/empty default export building with
    // defaults.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- relaxed strictNullChecks masks the `| undefined` jiti can still produce for an empty module.
    const resolved: BuildConfig | BuildConfigFunction = imported ?? {};

    const buildConfig: BuildConfig = typeof resolved === "function" ? await resolved(environment, mode) : resolved;

    return {
        config: buildConfig,
        path: packemConfigFilePath,
    };
};

export default loadPackemConfig;
