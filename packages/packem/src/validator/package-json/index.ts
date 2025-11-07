import type { BuildContext } from "@visulima/packem-share/types";

import loadPackageJson from "../../config/utils/load-package-json";
import type { InternalBuildOptions } from "../../types";
import validateDependencies from "./validate-dependencies";
import validateEngines from "./validate-engines";
import validateJsrExports from "./validate-jsr-exports";
import validatePackageEntries from "./validate-package-entries";
import validatePackageFields from "./validate-package-fields";

const validator = async (context: BuildContext<InternalBuildOptions>): Promise<void> => {
    const { packageJson } = loadPackageJson(context.options.rootDir);

    context.pkg = packageJson;

    validateDependencies(context);
    validateEngines(context);
    validatePackageFields(context);
    validatePackageEntries(context);
    
    // JSR.io exports validation runs after build entries are populated
    // This is called from the builder after build is complete
};

/**
 * Validates JSR.io exports after build is complete.
 * This should be called from the builder after build entries are populated.
 * 
 * JSR.io (Deno's JavaScript Registry) requires that all exports in package.json
 * reference existing files. This validator ensures compatibility with JSR.io publishing.
 */
export const validateJsrExportsAfterBuild = async (context: BuildContext<InternalBuildOptions>): Promise<void> => {
    await validateJsrExports(context);
};

export default validator;
