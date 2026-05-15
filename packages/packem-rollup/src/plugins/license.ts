/**
 * Modified copy of https://github.com/rollup/rollup/blob/master/build-plugins/generate-license-file.ts
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2017 these people -> https://github.com/rollup/rollup/graphs/contributors
 */
import { readFileSync, writeFileSync } from "@visulima/fs";
import { replaceContentWithinMarker } from "@visulima/packem-share/utils";
import type { Plugin } from "rollup";
import rollupLicensePlugin from "rollup-plugin-license";

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

    const byLocale = (a: string, b: string): number => a.localeCompare(b);

    return [...noParenthesis.toSorted(byLocale), ...withParenthesis.toSorted(byLocale)];
};

const collectAuthorNames = (author: unknown, maintainers: unknown[], contributors: unknown[]): string[] => {
    const names = new Set<string>();

    for (const person of [author, ...maintainers, ...contributors]) {
        const personName = typeof person === "string"
            ? person
            : (person as { name?: string } | null | undefined)?.name;

        if (personName) {
            names.add(personName);
        }
    }

    return [...names];
};

// eslint-disable-next-line func-style
function prefixQuoteMarker(line: string): string {
    return line ? `> ${line}` : ">";
}

const formatLicenseBody = (licenseText: string, marker: string, dtsMarker: string | undefined): string => {
    const lines = licenseText
        .trim()
        .replaceAll(/\r\n|\r/g, "\n")
        .replaceAll(`<!-- ${marker} -->`, "")
        .replaceAll(dtsMarker ? `<!-- ${dtsMarker} -->` : "", "")
        .replaceAll(`<!-- /${marker} -->`, "")
        .replaceAll(dtsMarker ? `<!-- /${dtsMarker} -->` : "", "")
        .trim()
        .split("\n")
        .map((line) => prefixQuoteMarker(line));

    return lines.join("\n");
};

export interface LicenseOptions {
    dependenciesMarker?: string;
    dependenciesTemplate?: (licenses: string[], dependencyLicenseTexts: string, packageName: string | undefined) => string;
    dtsMarker?: string;
    dtsTemplate?: (licenses: string[], dependencyLicenseTexts: string, packageName: string | undefined) => string;
    path?: string;
}

export const licensePlugin = ({
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
    logger: Console;
    marker: string;
    mode: "dependencies" | "types";
    packageName: string | undefined;
}): Plugin =>
    rollupLicensePlugin({
        thirdParty(dependencies) {
            const licenses = new Set<string>();

            const dependencyLicenseTexts = dependencies
                .toSorted(({ name: nameA }, { name: nameB }) => {
                    const a = nameA ?? "";
                    const b = nameB ?? "";

                    return a.localeCompare(b);
                })
                .map(({ author, contributors, license: dependencyLicense, licenseText, maintainers, name, repository }) => {
                    let text = `## ${name ?? ""}\n`;

                    if (dependencyLicense) {
                        text += `License: ${dependencyLicense}\n`;
                    }

                    const names = collectAuthorNames(author, maintainers, contributors);

                    if (names.length > 0) {
                        text += `By: ${names.join(", ")}\n`;
                    }

                    if (repository) {
                        text += `Repository: ${typeof repository === "string" ? repository : repository.url}\n`;
                    }

                    if (licenseText) {
                        text += `\n${formatLicenseBody(licenseText, marker, dtsMarker)}\n`;
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
                    prefix: `plugin:license:${mode}`,
                });

                return;
            }

            const licenseText = licenseTemplate(sortLicenses(licenses), dependencyLicenseTexts, packageName);

            try {
                const existingLicenseText = readFileSync(licenseFilePath);
                const content = replaceContentWithinMarker(existingLicenseText, marker, licenseText);

                if (!content) {
                    logger.error({
                        message: `Could not find the license marker: <!-- ${marker} --><!-- /${marker} --> in ${licenseFilePath}`,
                        prefix: `plugin:license:${mode}`,
                    });

                    return;
                }

                if (existingLicenseText !== content) {
                    writeFileSync(licenseFilePath, content);

                    logger.info({
                        message: `${licenseFilePath} updated.`,
                        prefix: `plugin:license:${mode}`,
                    });
                }
            } catch (error) {
                logger.error(error);
            }
        },
    });
