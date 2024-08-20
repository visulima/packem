import type { PackageJson } from "@visulima/package";

import type { BuildOptions } from "../types";
import { inferExportType, inferExportTypeFromFileName } from "./infer-export-type";

const exportsKeys = [
    "import",
    "require",
    "node",
    "node-addons",
    "default",
    "production",
    "types",
    "deno",
    "browser",
    "development",
    "react-native",
    "react-server",
] as const;

export type OutputDescriptor = {
    fieldName?: string;
    file: string;
    isExecutable?: true;
    key: "exports" | "main" | "types" | "module" | "bin";
    subKey?: typeof exportsKeys | (NonNullable<unknown> & string);
    type?: "cjs" | "esm";
};

export const extractExportFilenames = (
    packageExports: PackageJson["exports"],
    packageType: "esm" | "cjs",
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
            throw new Error(`Exported file "${packageExports}" has an extension that does not match the package.json type "${packageType === "esm" ? "module" : "commonjs"}".`);
        }

        return [{ file: packageExports, key: "exports", type: inferredType ?? packageType }];
    }

    return (
        Object.entries(packageExports)
            // Filter out .json subpaths such as package.json
            .filter(([subpath]) => !subpath.endsWith(".json"))
            .flatMap(([condition, packageExport]) => {
                if (declaration === false && condition === "types") {
                    return [];
                }

                return typeof packageExport === "string"
                    ? {
                          file: packageExport,
                          key: "exports",
                          ...(exportsKeys.includes(condition) ? { subKey: condition as OutputDescriptor["subKey"] } : {}),
                          type: inferExportType(condition, conditions, packageType, packageExport),
                      }
                    : extractExportFilenames(packageExport, packageType, declaration, [...conditions, condition]);
            })
    );
};
