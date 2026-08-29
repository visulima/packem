import { normalizePath } from "@rollup/pluginutils";
import { bold, cyan, green, magenta, yellow } from "@visulima/colorize";
import type { Memoized } from "@visulima/packem-share";
import { memoizeByKey } from "@visulima/packem-share";
import type { Plugin } from "rollup";
import { compare } from "semver";

import { destroyPackageInfoCache, getPackageInfo, packagePathRegex } from "./utils/get-package-info";

const formatImporter: Memoized<(importer: string, cwd: string) => Promise<string>> = memoizeByKey(async (importer: string, cwd: string) => {
    const normalized = normalizePath(importer);

    if (packagePathRegex.test(normalized)) {
        const packageInfo = await getPackageInfo(normalized);

        if (packageInfo) {
            return `${packageInfo.name}@${packageInfo.version}`;
        }
    }

    return normalized.replace(`${normalizePath(cwd)}/`, "");
})();

/**
 * Collected duplicated-package information, keyed by package name, then version,
 * then the resolved package directory, with the set of importers as the leaf value.
 *
 * ```plaintext
 * Map {
 *   "axios" => Map {
 *     "1.4.0"  => Map { "[dir]" => Set { "packages/pkg2/index.js" } },
 *     "0.27.2" => Map { "[dir]" => Set { "packages/pkg1/index.js" } }
 *   }
 * }
 * ```
 */
// eslint-disable-next-line import/exports-last -- referenced by the helpers and options type defined below
export type PackagesInfo = Map<
    // pkg name
    string,
    Map<
        // pkg version
        string,
        Map<
            // pkg directory
            string,
            // importers
            Set<string>
        >
    >
>;

// eslint-disable-next-line import/exports-last -- public options type consumed before the plugin factory below
export interface DetectDuplicatedPluginOptions {
    /** Build a custom message from the collected duplicates instead of the default report. */
    customErrorMessage?: (packageToVersionsMap: PackagesInfo) => string;

    /**
     * Whether to report duplicated deps that are pulled in transitively by another dep under node_modules.
     * When `false`, only duplicates imported directly by your own source are reported.
     * @default true
     */
    deep?: boolean;

    /**
     * Duplicated dependencies to ignore. Pass `*` as a version to ignore all versions, e.g. `{ axios: ["0.17.4", "1.4.0"] }`.
     * @default {} (ignore nothing)
     */
    ignore?: Record<string, string[]>;

    /**
     * Make the build fail when duplicated deps exist.
     * @default false
     */
    throwErrorWhenDuplicated?: boolean;
}

const sortImporters = (importers: Set<string>): Set<string> => new Set([...importers].toSorted((a, b) => a.localeCompare(b)));

const sortDirectoryMap = (directoryMap: Map<string, Set<string>>): Map<string, Set<string>> =>
    new Map([...directoryMap].toSorted((a, b) => a[0].localeCompare(b[0])).map(([directory, importers]) => [directory, sortImporters(importers)]));

const sortVersionMap = (versionMap: Map<string, Map<string, Set<string>>>): Map<string, Map<string, Set<string>>> =>
    new Map([...versionMap].toSorted((a, b) => compare(a[0], b[0])).map(([version, directoryMap]) => [version, sortDirectoryMap(directoryMap)]));

const sortPackagesInfo = (packagesInfo: PackagesInfo): PackagesInfo =>
    new Map([...packagesInfo].toSorted((a, b) => a[0].localeCompare(b[0])).map(([name, versionMap]) => [name, sortVersionMap(versionMap)]));

const addImporter = (packagesInfo: PackagesInfo, name: string, version: string, directory: string, importer: string): void => {
    let versionMap = packagesInfo.get(name);

    if (!versionMap) {
        versionMap = new Map();
        packagesInfo.set(name, versionMap);
    }

    let directoryMap = versionMap.get(version);

    if (!directoryMap) {
        directoryMap = new Map();
        versionMap.set(version, directoryMap);
    }

    let importers = directoryMap.get(directory);

    if (!importers) {
        importers = new Set();
        directoryMap.set(directory, importers);
    }

    importers.add(importer);
};

const formatDuplicatedPackage = (duplicatedPackage: string, versions: string[], packagesInfo: PackagesInfo, cwd: string): string[] => {
    const longestVersionLength = Math.max(0, ...versions.map((version) => version.length));

    const colorizeImporters = (importers: string[], version: string): string =>
        importers
            // ignore self import
            .filter((importer) => importer !== `${duplicatedPackage}@${version}`)
            .map((name) => green(name))
            .join(", ");

    const lines: string[] = [`\n  ${magenta(duplicatedPackage)}:`];

    for (const version of versions) {
        const directoryMap = packagesInfo.get(duplicatedPackage)?.get(version);

        if (!directoryMap) {
            continue;
        }

        const versionLabel = bold(yellow(version.padEnd(longestVersionLength, " ")));

        if (directoryMap.size === 1) {
            const [importers] = [...directoryMap.values()];
            const importerList = importers ? [...importers] : [];

            lines.push(`    - ${versionLabel} imported by ${colorizeImporters(importerList, version)}`);

            continue;
        }

        lines.push(`    - ${versionLabel}`);

        for (const [directory, importers] of directoryMap) {
            const formattedDirectory = bold(cyan(directory.replace(normalizePath(cwd), ".")));

            lines.push(`      - ${formattedDirectory} imported by ${colorizeImporters([...importers], version)}`);
        }
    }

    return lines;
};

export const detectDuplicatedPlugin = (
    logger: Console,
    cwd: string,
    { customErrorMessage, deep = true, ignore = {}, throwErrorWhenDuplicated = false }: DetectDuplicatedPluginOptions = {},
): Plugin =>
    <Plugin>{
        async buildEnd() {
            // Build the duplicate map from the fully-resolved module graph rather
            // than observing `resolveId`. This is robust to packem's resolution
            // cache (which skips `resolveId` on warm builds), adds no extra
            // resolution work, and never accumulates state across watch rebuilds.
            const collected: PackagesInfo = new Map();

            await Promise.all(
                [...this.getModuleIds()].map(async (id) => {
                    const moduleInfo = this.getModuleInfo(id);

                    // Skip modules that aren't part of the emitted bundle: externals
                    // and anything tree-shaken away (`isIncluded === false`), so we
                    // don't report duplicates that never actually ship.
                    if (moduleInfo === null || moduleInfo.isExternal || moduleInfo.isIncluded === false) {
                        return;
                    }

                    const packageInfo = await getPackageInfo(id);

                    if (!packageInfo) {
                        return;
                    }

                    const { directory, name, version } = packageInfo;

                    // Consider both static and dynamic (`import()`) importers so a
                    // dependency that is only reachable lazily is still detected.
                    for (const importer of [...moduleInfo.importers, ...moduleInfo.dynamicImporters]) {
                        const normalizedImporter = normalizePath(importer);

                        // In shallow mode, ignore duplicates only pulled in transitively
                        // by another dependency under node_modules.
                        if (!deep && packagePathRegex.test(normalizedImporter)) {
                            continue;
                        }

                        // eslint-disable-next-line no-await-in-loop -- importers per module are few; formatImporter is memoized.
                        addImporter(collected, name, version, directory, await formatImporter(normalizedImporter, cwd));
                    }
                }),
            );

            destroyPackageInfoCache();
            formatImporter.destroy();

            const packagesInfo = sortPackagesInfo(collected);

            // analyze duplicated packages
            const duplicatedDependencies: Record<string, string[]> = {};
            const issuePackagesMap = new Map<string, string[]>();

            for (const [packageName, versionMap] of packagesInfo) {
                const directoryMaps = [...versionMap.values()];
                // multiple versions, or one version and multiple directories
                const isDuplicated = directoryMaps.length > 1 || (directoryMaps.length === 1 && (directoryMaps[0]?.size ?? 0) > 1);

                if (!isDuplicated) {
                    continue;
                }

                duplicatedDependencies[packageName] = [...versionMap.keys()];

                for (const version of versionMap.keys()) {
                    const ignoredVersions = ignore[packageName];
                    const isPass = ignoredVersions !== undefined && (ignoredVersions.includes("*") || ignoredVersions.includes(version));

                    if (!isPass) {
                        const newIssueVersions = issuePackagesMap.get(packageName) ?? [];

                        newIssueVersions.push(version);
                        issuePackagesMap.set(packageName, newIssueVersions);
                    }
                }
            }

            if (issuePackagesMap.size === 0) {
                return;
            }

            const coloredDuplicatedPackageNames = [...issuePackagesMap.keys()].map((name) => magenta(name)).join(", ");
            const outputMessages = [`packages ${coloredDuplicatedPackageNames} is bundled multiple times!`];

            for (const [duplicatedPackage, versions] of issuePackagesMap) {
                outputMessages.push(...formatDuplicatedPackage(duplicatedPackage, versions, packagesInfo, cwd));
            }

            const message = customErrorMessage ? customErrorMessage(packagesInfo) : outputMessages.join("\n");

            if (throwErrorWhenDuplicated) {
                logger.error(message);
                logger.info(`Fix this error by eliminating the duplicated dependencies or adjusting the ${magenta("ignore")} option.`);
                logger.info(`You can copy the following duplicated dependencies as the value of the ${magenta("ignore")} option:`);
                logger.info(`\n${JSON.stringify(duplicatedDependencies, undefined, 4)}\n`);

                this.error("Duplicated dependencies detected.");
            }

            logger.warn(message);
        },
        name: "packem:detect-duplicated",
    };
