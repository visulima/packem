import { normalizePath } from "@rollup/pluginutils";
import { parsePackageJson } from "@visulima/package/package-json";
import type { Memoized } from "@visulima/packem-share";
import { memoizeByKey } from "@visulima/packem-share";
import { dirname, join } from "@visulima/path";

// eslint-disable-next-line import/exports-last -- consumed by the helpers and the plugin module below
export interface PackageInfo {
    directory: string;
    name: string;
    version: string;
}

// eslint-disable-next-line import/exports-last, sonarjs/super-linear-regex -- consumed below; inputs are resolved filesystem ids of bounded length, not user-controlled DoS vectors.
export const packagePathRegex = /.*\/node_modules\/(?:@[^/]+\/)?[^/]+/;

/**
 * Read and normalize the `package.json` for a resolved package directory.
 * Memoized by the package root, so each `package.json` is read at most once
 * per build regardless of how many of its files are in the module graph.
 */
const readPackageInfo: Memoized<(packageRoot: string) => Promise<PackageInfo | undefined>> = memoizeByKey(
    async (packageRoot: string): Promise<PackageInfo | undefined> => {
        const packageJsonPath = join(packageRoot, "package.json");

        try {
            const packageJson = (await parsePackageJson(packageJsonPath)) as { name: string; version: string };

            return {
                directory: dirname(packageJsonPath),
                name: packageJson.name,
                version: packageJson.version,
            };
        } catch {
            return undefined;
        }
    },
)();

export const getPackageInfo = async (id: string): Promise<PackageInfo | undefined> => {
    const normalizedId = normalizePath(id);
    const match = packagePathRegex.exec(normalizedId);

    if (!match) {
        return undefined;
    }

    const info = await readPackageInfo(match[0]);

    if (info) {
        return info;
    }

    // Some packages publish a `dist` with a nested `node_modules` folder; fall
    // back to the outer package root in that case.
    const lastIndex = normalizedId.lastIndexOf("node_modules");

    if (lastIndex <= 0) {
        return undefined;
    }

    const outerMatch = packagePathRegex.exec(normalizedId.slice(0, lastIndex - 1));

    if (!outerMatch) {
        return undefined;
    }

    return readPackageInfo(outerMatch[0]);
};

export const destroyPackageInfoCache = (): void => {
    readPackageInfo.destroy();
};
