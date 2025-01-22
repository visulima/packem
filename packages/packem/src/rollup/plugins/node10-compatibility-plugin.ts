import { readJson, writeJson } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import { dirname, join } from "@visulima/path";
import type { Plugin } from "rollup";
import { coerce, valid } from "semver";

import type { BuildContext } from "../../types";

let logDisplayed = false;

const typesVersions: Record<string, string[]> = {};

/**
 * Makes all string arrays unique in a nested object structure.
 *
 * @param object - The nested object containing string arrays
 * @returns A new object with unique values in all string arrays
 */
const uniqueNestedValues = (object: Partial<Record<string, Partial<Record<string, string[]>>>>): Partial<Record<string, Partial<Record<string, string[]>>>> =>
    Object.fromEntries(
        Object.entries(object).map(([key, value]) => {
            if (!value) {
                return [key, {}];
            }

            const innerObject = Object.fromEntries(
                Object.entries(value).map(([innerKey, array]) => {
                    if (!Array.isArray(array)) {
                        return [innerKey, []];
                    }

                    return [innerKey, [...new Set(array)]];
                }),
            );

            return [key, innerObject];
        }),
    );

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
        writeBundle: async (): Promise<void> => {
            if (!logDisplayed) {
                logger.info({
                    message: "Declaration node10 compatibility mode is enabled.",
                    prefix: "plugin:packem:node10-compatibility",
                });

                logDisplayed = true;
            }

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
            const packageJson = (await readJson(rootPackageJsonPath)) as PackageJson;

            if (mode === "file" && Object.keys(typesVersions).length > 0) {
                await writeJson(
                    rootPackageJsonPath,
                    {
                        ...packageJson,
                        typesVersions: uniqueNestedValues({
                            ...packageJson.typesVersions,
                            [typeScriptVersion]: typesVersions,
                        }),
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
