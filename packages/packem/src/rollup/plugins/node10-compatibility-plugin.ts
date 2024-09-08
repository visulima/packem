import { readJsonSync, writeJsonSync } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import { join } from "@visulima/path";
import type { Plugin } from "rollup";

import { CHUNKS_PACKEM_FOLDER, SHARED_PACKEM_FOLDER } from "../../constants";
import type { BuildContext } from "../../types";

let logDisplayed = false;

export type Node10CompatibilityOptions = {
    writeToPackageJson?: boolean;
};

export const node10CompatibilityPlugin = (
    logger: BuildContext["logger"],
    buildEntries: BuildContext["buildEntries"],
    outDirectory: string,
    rootDirectory: string,
    mode: "console" | "file",
): Plugin => {
    return {
        name: "packem:node10-compatibility",
        writeBundle() {
            if (!logDisplayed) {
                logger.info({
                    message: "Declaration node10 compatibility mode is enabled.",
                    prefix: "plugin:node10-compatibility",
                });

                logDisplayed = true;
            }

            const typesVersions: string[] = [];

            // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
            for (const entry of buildEntries.filter((bEntry) => !bEntry.chunk)) {
                if (
                    entry.type === "entry" &&
                    entry.path.endsWith(".cjs") &&
                    !entry.path.includes(SHARED_PACKEM_FOLDER) &&
                    !entry.path.includes(CHUNKS_PACKEM_FOLDER)
                ) {
                    typesVersions.push("./" + join(outDirectory, entry.path.replace(/\.cjs$/, ".d.ts")));
                }
            }

            const rootPackageJsonPath = join(rootDirectory, "package.json");
            const packageJson = readJsonSync(rootPackageJsonPath) as PackageJson;

            // eslint-disable-next-line etc/no-assign-mutated-array
            const sortedTypesVersions = typesVersions.sort((a, b) => a.localeCompare(b));

            if (sortedTypesVersions === packageJson.typesVersions?.["*"]?.["*"]) {
                logger.debug({
                    message: "No changes to typesVersions field in package.json",
                    prefix: "plugin:node10-compatibility",
                });

                return;
            }

            if (mode === "file" && typesVersions.length > 0) {
                writeJsonSync(
                    rootPackageJsonPath,
                    {
                        ...packageJson,
                        typesVersions: {
                            ...packageJson.typesVersions,
                            "*": {
                                "*": sortedTypesVersions,
                            },
                        },
                    },
                    {
                        detectIndent: true,
                    },
                );

                logger.info({
                    message: `Your package.json "typesVersions" field has been updated.`,
                    prefix: "plugin:node10-compatibility",
                });
            } else if (typesVersions.length > 0) {
                logger.info({
                    message: `Please add the following field into your package.json to enable node 10 compatibility:\n\n${JSON.stringify({ typesVersions: { "*": { "*": sortedTypesVersions } } }, null, 4)}\n`,
                    prefix: "plugin:node10-compatibility",
                });
            }
        },
    };
};
