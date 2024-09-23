import { isAccessibleSync } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import { parsePackageJson } from "@visulima/package/package-json";
import { join } from "@visulima/path";

const loadPackageJson = (
    rootDirectory: string,
): {
    packageJson: PackageJson;
    packageJsonPath: string;
} => {
    const packageJsonPath = join(rootDirectory, "package.json");

    if (!isAccessibleSync(packageJsonPath)) {
        throw new Error("package.json not found at " + packageJsonPath);
    }

    const packageJson = parsePackageJson(packageJsonPath);

    return {
        packageJson,
        packageJsonPath,
    };
};

export default loadPackageJson;
