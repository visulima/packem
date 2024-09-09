import type { BuildContext } from "../../types";
import validateDependencies from "./validate-dependencies";
import validatePackageEntries from "./validate-package-entries";
import validatePackageFields from "./validate-package-fields";

const validator = (context: BuildContext): void => {
    validateDependencies(context);
    validatePackageFields(context);
    validatePackageEntries(context);
};

export default validator;
