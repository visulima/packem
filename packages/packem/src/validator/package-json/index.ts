import loadPackageJson from "../../config/utils/load-package-json";
import type { BuildContext } from "@visulima/packem-share/types";
import type { InternalBuildOptions } from "../../types";
import validateDependencies from "./validate-dependencies";
import validateEngines from "./validate-engines";
import validatePackageEntries from "./validate-package-entries";
import validatePackageFields from "./validate-package-fields";

const validator = (context: BuildContext<InternalBuildOptions>): void => {
    const { packageJson } = loadPackageJson(context.options.rootDir);

    context.pkg = packageJson;

    validateDependencies(context);
    validateEngines(context);
    validatePackageFields(context);
    validatePackageEntries(context);
};

export default validator;
