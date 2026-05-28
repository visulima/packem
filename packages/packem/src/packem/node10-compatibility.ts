import { readJson, writeJson } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import type { BuildContext } from "@visulima/packem-share/types";
import { dirname, join } from "@visulima/path";
import { coerce, valid } from "semver";

import type { InternalBuildOptions } from "../types";

interface LoggerMessage {
    message: unknown;
    prefix?: string;
}

/**
 * Minimal, precisely-typed view of the `@visulima/pail` logger surface used here.
 *
 * `BuildContext["logger"]` is typed `Pail`, which the published `@visulima/pail`
 * types re-export from a non-existent `./pail.d.ts`, so it resolves to an
 * unresolved/`any`-like type. Modelling only the methods we call keeps the call
 * sites strictly typed without an `any` escape.
 * @internal
 */
interface Logger {
    info: (message: LoggerMessage | string, ...arguments_: unknown[]) => void;
}

/**
 * Makes all string arrays unique in a nested object structure.
 * @param object The nested object containing string arrays
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

export type { Node10CompatibilityOptions } from "./node10-compatibility-options";

export const node10Compatibility = async (
    rawLogger: BuildContext<InternalBuildOptions>["logger"],
    entries: BuildContext<InternalBuildOptions>["options"]["entries"],
    outDirectory: string,
    rootDirectory: string,
    mode: "console" | "file",
    typeScriptVersion: string,
): Promise<void> => {
    const logger = rawLogger as unknown as Logger;

    if (typeScriptVersion !== "*" && valid(coerce(typeScriptVersion)) === null) {
        throw new Error("Invalid typeScriptVersion option. It must be a valid semver range.");
    }

    logger.info({
        message: "Declaration node10 compatibility mode is enabled.",
        prefix: "plugin:packem:node10-compatibility",
    });

    const typesVersions: Record<string, string[]> = {};

    for (const entry of entries) {
        if (entry.exportKey === undefined || entry.name === undefined) {
            continue;
        }

        const { name } = entry;

        for (const exportKey of entry.exportKey) {
            typesVersions[exportKey] = exportKey.includes("/*")
                ? [`./${join(outDirectory, dirname(name), "*.d.ts")}`]
                : [...typesVersions[exportKey] ?? [], `./${join(outDirectory, `${name}.d.ts`)}`];
        }
    }

    const rootPackageJsonPath = join(rootDirectory, "package.json");
    const packageJson = await readJson<PackageJson>(rootPackageJsonPath);

    if (mode === "file" && Object.keys(typesVersions).length > 0) {
        // This needs to be done in a synchronous manner
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
            message: `Please add the following field into your package.json to enable node 10 compatibility:\n\n${JSON.stringify({ typesVersions: { "*": typesVersions } }, undefined, 4)}\n`,
            prefix: "plugin:packem:node10-compatibility",
        });
    }
};
