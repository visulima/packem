import type { BuildContext } from "@visulima/packem-share/types";

import loadPackageJson from "../../config/utils/load-package-json";
import type { InternalBuildOptions } from "../../types";
import validateDependencies from "./validate-dependencies";
import validateEngines from "./validate-engines";
import validateJarFileExports from "./validate-jar-file-exports";
import validatePackageEntries from "./validate-package-entries";
import validatePackageFields from "./validate-package-fields";

const validator = async (context: BuildContext<InternalBuildOptions>): Promise<void> => {
    const { packageJson } = loadPackageJson(context.options.rootDir);

    context.pkg = packageJson;

    validateDependencies(context);
    validateEngines(context);
    validatePackageFields(context);
    validatePackageEntries(context);
    
    // JAR file exports validation runs after build entries are populated
    // This is called from the builder after build is complete
};

/**
 * Validates JAR file exports after build is complete.
 * This should be called from the builder after build entries are populated.
 */
export const validateJarFileExportsAfterBuild = async (context: BuildContext<InternalBuildOptions>): Promise<void> => {
    await validateJarFileExports(context);
};

export default validator;
