import { isAccessibleSync } from "@visulima/fs";
import type { NormalizedPackageJson } from "@visulima/package";
import { parsePackageJsonSync } from "@visulima/package/package-json";
import { join } from "@visulima/path";

const loadPackageJson = (
    rootDirectory: string,
): {
    packageJson: NormalizedPackageJson;
    packageJsonPath: string;
} => {
    const packageJsonPath = join(rootDirectory, "package.json");

    if (!isAccessibleSync(packageJsonPath)) {
        throw new Error(`package.json not found at ${packageJsonPath}`);
    }

    const packageJson = parsePackageJsonSync(packageJsonPath, {
        resolveCatalogs: true,
    });

    if (packageJson.publishConfig) {
        Object.assign(packageJson, packageJson.publishConfig);
    }

    return {
        packageJson,
        packageJsonPath,
    };
};

export default loadPackageJson;
