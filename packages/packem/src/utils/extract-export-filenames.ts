import type { PackageJson } from "@visulima/package";

import { RUNTIME_EXPORT_CONVENTIONS, SPECIAL_EXPORT_CONVENTIONS } from "../constants";
import type { BuildOptions } from "../types";
import { inferExportType, inferExportTypeFromFileName } from "./infer-export-type";

// This Set contains keys representing various JavaScript runtime environments and module systems.
// It is used to identify and process different types of exports in package.json files.
// You can find the list of runtime keys here: https://runtime-keys.proposal.wintercg.org/
// eslint-disable-next-line @typescript-eslint/consistent-generic-constructors
const runtimeExportConventions: Set<string> = new Set([
    "browser",
    "bun",
    "default",
    "deno",
    "electron",
    "import",
    "module-sync",
    "node",
    "node-addons",
    "require",
    "types",
    "workerd",
    ...RUNTIME_EXPORT_CONVENTIONS,
    ...SPECIAL_EXPORT_CONVENTIONS,
]);

export type OutputDescriptor = {
    exportKey?: string;
    fieldName?: string;
    file: string;
    isExecutable?: true;
    key: "bin" | "exports" | "main" | "module" | "types";
    subKey?: typeof runtimeExportConventions | (NonNullable<unknown> & string);
    type?: "cjs" | "esm";
};

export const extractExportFilenames = (
    packageExports: PackageJson["exports"],
    packageType: "cjs" | "esm",
    declaration: BuildOptions["declaration"],
    conditions: string[] = [],
    // eslint-disable-next-line sonarjs/cognitive-complexity
): OutputDescriptor[] => {
    if (!packageExports) {
        return [];
    }

    if (typeof packageExports === "string") {
        const inferredType = inferExportTypeFromFileName(packageExports);

        if (inferredType && inferredType !== packageType) {
            throw new Error(
                `Exported file "${packageExports}" has an extension that does not match the package.json type "${packageType === "esm" ? "module" : "commonjs"}".`,
            );
        }

        return [{ file: packageExports, key: "exports", type: inferredType ?? packageType }];
    }

    if (typeof packageExports === "object") {
        const filteredEntries = Object.entries(packageExports)
            // Filter out .json subpaths such as package.json
            .filter(([subpath]) => !subpath.endsWith(".json"));

        let descriptors: OutputDescriptor[] = [];

        for (const [exportKey, packageExport] of filteredEntries) {
            if (typeof packageExport === "string") {
                let descriptor = {};

                if (Number.isInteger(+exportKey)) {
                    descriptor = { exportKey: "*" };
                } else if (exportKey.startsWith("./")) {
                    descriptor = { exportKey: exportKey.replace("./", "") };
                } else {
                    descriptor = { exportKey: exportKey === "." ? "." : "*", subKey: exportKey };
                }

                descriptors.push({
                    ...descriptor,
                    file: packageExport,
                    key: "exports",
                    type: inferExportType(exportKey, conditions, packageType, packageExport),
                } as OutputDescriptor);
            } else if (typeof packageExport === "object" && packageExport !== undefined) {
                for (const [condition, entryExport] of Object.entries(packageExport as Record<string, string[] | string | null>)) {
                    if (declaration === false && condition === "types") {
                        continue;
                    }

                    const key: string = Number.isInteger(+exportKey) ? condition : (exportKey as string);

                    if (typeof entryExport === "string") {
                        descriptors.push({
                            exportKey: key.replace("./", ""),
                            file: entryExport,
                            key: "exports",
                            ...runtimeExportConventions.has(condition) ? { subKey: condition as OutputDescriptor["subKey"] } : {},
                            type: inferExportType(condition, conditions, packageType, entryExport),
                        } as OutputDescriptor);
                    } else {
                        descriptors = [
                            ...descriptors,
                            ...extractExportFilenames({ [key]: entryExport } as PackageJson["exports"], packageType, declaration, [...conditions, condition]),
                        ];
                    }
                }
            }
        }

        return descriptors;
    }

    return [];
};
