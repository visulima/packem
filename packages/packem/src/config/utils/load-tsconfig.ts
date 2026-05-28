import { isAccessible } from "@visulima/fs";
import type { NormalizedPackageJson } from "@visulima/package";
import { hasPackageJsonAnyDependency } from "@visulima/package";
import { join } from "@visulima/path";
import type { TsConfigResult } from "@visulima/tsconfig";
import { findTsConfig, readTsConfig } from "@visulima/tsconfig";

/**
 * Minimal structural logger contract. `@visulima/pail`'s shipped `Pail` type
 * re-exports from a non-existent `./pail.d.ts`, so the structural alias below
 * keeps the methods we call fully type-checked without the broken import.
 */
interface Logger {
    debug: (message: string, ...arguments_: unknown[]) => void;
    info: (message: string, ...arguments_: unknown[]) => void;
}

const loadTsconfig = async (
    rootDirectory: string,
    packageJson: NormalizedPackageJson,
    logger: Logger,
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
