/**
 * Modified copy of https://github.com/rollup/rollup/blob/master/build-plugins/generate-license-file.ts
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2017 these people -> https://github.com/rollup/rollup/graphs/contributors
 */
import { readFileSync, writeFileSync } from "@visulima/fs";
import type { Pail } from "@visulima/pail";
import type { Plugin } from "rollup";
import licensePlugin from "rollup-plugin-license";

const sortLicenses = (licenses: Set<string>) => {
    const withParenthesis: string[] = [];
    const noParenthesis: string[] = [];

    licenses.forEach((l: string) => {
        if (l.startsWith("(")) {
            withParenthesis.push(l);
        } else {
            noParenthesis.push(l);
        }
    });

    // eslint-disable-next-line @typescript-eslint/require-array-sort-compare,etc/no-assign-mutated-array
    return [...noParenthesis.sort(), ...withParenthesis.sort()];
};

const replaceContentWithin = (content: string, marker: string, replacement: string): string | undefined => {
    /** Replaces the content within the comments and re appends/prepends the comments to the replacement for follow-up workflow runs. */
    // eslint-disable-next-line @rushstack/security/no-unsafe-regexp,security/detect-non-literal-regexp
    const regex = new RegExp(`(<!-- ${marker} -->)[\\s\\S]*?(<!-- ${marker} -->)`, "g");

    if (!regex.test(content)) {
        return undefined;
    }

    return content.replace(regex, `$1\n${replacement}\n$2`);
};

export interface LicenseOptions {
    dependenciesMarker?: string;
    dependenciesTemplate?: (licenses: string[], dependencyLicenseTexts: string, packageName: string | undefined) => string;
    dtsMarker?: string;
    dtsTemplate?: (licenses: string[], dependencyLicenseTexts: string, packageName: string | undefined) => string;
    path?: string;
}

export const license = ({
    dtsMarker,
    licenseFilePath,
    licenseTemplate,
    logger,
    marker,
    mode,
    packageName,
}: {
    dtsMarker?: string; // this is needed to replace license marker that are bundled with packem
    licenseFilePath: string;
    licenseTemplate: (licenses: string[], dependencyLicenseTexts: string, packageName: string | undefined) => string;
    logger: Pail;
    marker: string;
    mode: "dependencies" | "types";
    packageName: string | undefined;
}): Plugin =>
    licensePlugin({
        // eslint-disable-next-line sonarjs/cognitive-complexity
        thirdParty(dependencies) {
            const licenses = new Set<string>();

            const dependencyLicenseTexts = dependencies
                // eslint-disable-next-line etc/no-assign-mutated-array
                .sort(({ name: nameA }, { name: nameB }) => ((nameA || 0) > (nameB || 0) ? 1 : (nameB || 0) > (nameA || 0) ? -1 : 0))
                .map(({ author, contributors, license: dependencyLicense, licenseText, maintainers, name, repository }) => {
                    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                    let text = "## " + name + "\n";

                    if (dependencyLicense) {
                        text += `License: ${dependencyLicense}\n`;
                    }

                    const names = new Set();

                    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
                    for (const person of [author, ...maintainers, ...contributors]) {
                        const personName = typeof person === "string" ? person : person?.name;

                        if (personName) {
                            names.add(personName);
                        }
                    }

                    if (names.size > 0) {
                        text += `By: ${[...names].join(", ")}\n`;
                    }

                    if (repository) {
                        text += `Repository: ${typeof repository === "string" ? repository : repository.url}\n`;
                    }

                    if (licenseText) {
                        text +=
                            "\n" +
                            licenseText
                                .trim()
                                .replaceAll(/\r\n|\r/g, "\n")
                                .replaceAll(`<!-- ${marker} -->`, "")
                                .replaceAll(dtsMarker ? `<!-- ${dtsMarker} -->` : "", "")
                                .trim()
                                .split("\n")
                                .map((line) => {
                                    if (!line) {
                                        return ">";
                                    }

                                    return `> ${line}`;
                                })
                                .join("\n") +
                            "\n";
                    }

                    if (dependencyLicense) {
                        licenses.add(dependencyLicense);
                    }

                    return text;
                })
                .join("\n---------------------------------------\n\n");

            if (dependencyLicenseTexts === "") {
                logger.info({
                    message: "No dependencies license information found.",
                    prefix: "plugin:license:" + mode,
                });

                return;
            }

            const licenseText = licenseTemplate(sortLicenses(licenses), dependencyLicenseTexts, packageName);

            try {
                const existingLicenseText = readFileSync(licenseFilePath);

                const content = replaceContentWithin(existingLicenseText, marker, licenseText);

                if (!content) {
                    logger.error({
                        message: `Could not find the license marker: <!-- ${marker} --> in ${licenseFilePath}`,
                        prefix: "plugin:license:" + mode,
                    });

                    return;
                }

                if (existingLicenseText !== content) {
                    writeFileSync(licenseFilePath, content);

                    logger.info({
                        message: `${licenseFilePath} updated.`,
                        prefix: "plugin:license:" + mode,
                    });
                }
            } catch (error) {
                logger.error(error);
            }
        },
    });
