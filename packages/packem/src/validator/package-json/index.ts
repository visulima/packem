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
    
    // JSR.io exports validation - runs after package.json validation
    // If buildEntries are populated (after build), validates against built files
    // Otherwise, validates export structure and path existence
    await validateJsrExports(context);
};

export default validator;
