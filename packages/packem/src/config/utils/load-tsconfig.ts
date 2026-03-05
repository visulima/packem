import { isAccessible } from "@visulima/fs";
import type { NormalizedPackageJson } from "@visulima/package";
import { hasPackageJsonAnyDependency } from "@visulima/package";
import type { Pail } from "@visulima/pail";
import { join } from "@visulima/path";
import type { TsConfigResult } from "@visulima/tsconfig";
import { findTsConfig, readTsConfig } from "@visulima/tsconfig";

const loadTsconfig = async (
    rootDirectory: string,
    packageJson: NormalizedPackageJson,
    logger: Pail,
    tsconfigPath?: string,
): Promise<TsConfigResult | undefined> => {
    let tsconfig: TsConfigResult | undefined;

    if (tsconfigPath) {
        const rootTsconfigPath = join(rootDirectory, tsconfigPath);

        if (!await isAccessible(rootTsconfigPath)) {
            throw new Error(`tsconfig.json not found at ${rootTsconfigPath}`);
        }

        tsconfig = {
            config: readTsConfig(rootTsconfigPath),
            path: rootTsconfigPath,
        };

        logger.info("Using tsconfig settings at", rootTsconfigPath);
    } else if (hasPackageJsonAnyDependency(packageJson, ["typescript"])) {
        try {
            tsconfig = await findTsConfig(rootDirectory);

            logger.debug("Using tsconfig settings found at", tsconfig.path);
        } catch {
            logger.info("No tsconfig.json or jsconfig.json found.");
        }
    }

    return tsconfig;
};

export default loadTsconfig;
