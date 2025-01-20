import { readJsonSync, writeJsonSync } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import { dirname, join } from "@visulima/path";
import type { Plugin } from "rollup";
import { coerce, valid } from "semver";

import type { BuildContext } from "../../types";

let logDisplayed = false;

export type Node10CompatibilityOptions = {
    typeScriptVersion?: string;
    writeToPackageJson?: boolean;
};

export const node10CompatibilityPlugin = (
    logger: BuildContext["logger"],
    entries: BuildContext["options"]["entries"],
    outDirectory: string,
    rootDirectory: string,
    mode: "console" | "file",
    typeScriptVersion: string,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Plugin => {
    if (typeScriptVersion !== "*" && valid(coerce(typeScriptVersion)) === null) {
        throw new Error("Invalid typeScriptVersion option. It must be a valid semver range.");
    }

    return {
        name: "packem:node10-compatibility",
        writeBundle() {
            if (!logDisplayed) {
                logger.info({
                    message: "Declaration node10 compatibility mode is enabled.",
                    prefix: "plugin:packem:node10-compatibility",
                });

                logDisplayed = true;
            }

            const typesVersions: Record<string, string[]> = {};

            for (const entry of entries) {
                for (const exportKey of entry.exportKey as Set<string>) {
                    if (exportKey.includes("/*")) {
                        typesVersions[exportKey as string] = ["./" + join(outDirectory, dirname(entry.name as string), "*.d.ts")];
                    } else {
                        typesVersions[exportKey as string] = [
                            ...(typesVersions[exportKey as string] ?? []),
                            "./" + join(outDirectory, (entry.name as string) + ".d.ts"),
                        ];
                    }
                }
            }

            const rootPackageJsonPath = join(rootDirectory, "package.json");
            const packageJson = readJsonSync(rootPackageJsonPath) as PackageJson;

            if (mode === "file" && Object.keys(typesVersions).length > 0) {
                writeJsonSync(
                    rootPackageJsonPath,
                    {
                        ...packageJson,
                        typesVersions: {
                            ...packageJson.typesVersions,
                            [typeScriptVersion]: typesVersions,
                        },
                    },
                    {
                        detectIndent: true,
                    },
                );

                logger.info({
                    message: `Your package.json "typesVersions" field has been updated.`,
                    prefix: "plugin:packem:node10-compatibility",
                });
            } else if (Object.keys(typesVersions).length > 0) {
                logger.info({
                    message: `Please add the following field into your package.json to enable node 10 compatibility:\n\n${JSON.stringify({ typesVersions: { "*": typesVersions } }, null, 4)}\n`,
                    prefix: "plugin:packem:node10-compatibility",
                });
            }
        },
    };
};
