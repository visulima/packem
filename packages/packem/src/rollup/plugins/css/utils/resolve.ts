import { fileURLToPath } from "node:url";

import type { PackageJson } from "@visulima/package";
import { dirname } from "@visulima/path";
import { legacy as resolveFields, resolve as resolveExports } from "resolve.exports";
import internalResolveAsync from "resolve/async";
import internalResolveSync from "resolve/sync";

import arrayFmt from "./array-fmt";

const baseDirectory = dirname(fileURLToPath(import.meta.url));

type PackageFilterFunction = (package_: PackageJson, pkgfile: string) => PackageJson;

interface ResolveDefaultOptions {
    basedirs: ReadonlyArray<string>;
    caller: string;
    extensions: ReadonlyArray<string>;
    packageFilter: PackageFilterFunction;
    preserveSymlinks: boolean;
}

interface PackageFilterBuilderOptions {
    conditions?: string[];
    fields?: string[];
}

type PackageFilterBuilderFunction = (options?: PackageFilterBuilderOptions) => PackageFilterFunction;

// eslint-disable-next-line import/exports-last
export const packageFilterBuilder: PackageFilterBuilderFunction = (options = {}) => {
    const conditions = options.conditions ?? ["style", "import", "require"];
    const fields = options.fields ?? ["style", "module", "main"];

    return (packageJson: PackageJson) => {
        // Check `exports` fields
        try {
            const resolvedExport = resolveExports(packageJson, ".", { conditions, unsafe: true });

            if (typeof resolvedExport === "string") {
                // eslint-disable-next-line no-param-reassign
                packageJson.main = resolvedExport;

                return packageJson;
            }
        } catch {
            /* noop */
        }

        // Check independent fields
        try {
            const resolvedField = resolveFields(packageJson, { browser: false, fields });

            if (typeof resolvedField === "string") {
                // eslint-disable-next-line no-param-reassign
                packageJson.main = resolvedField;

                return packageJson;
            }
        } catch {
            /* noop */
        }

        return packageJson;
    };
};

const defaultOptions: ResolveDefaultOptions = {
    basedirs: [baseDirectory],
    caller: "Resolver",
    extensions: [".mjs", ".js", ".cjs", ".json"],
    packageFilter: packageFilterBuilder(),
    preserveSymlinks: true,
};

export const resolveAsync = async (ids: string[], userOptions: ResolveOptions): Promise<string> => {
    const options = { ...defaultOptions, ...userOptions };

    for await (const basedir of options.basedirs) {
        const resolveOptions = { ...options, basedir, basedirs: undefined, caller: undefined };

        for await (const id of ids) {
            const resolved = await new Promise<string | undefined>((resolve, reject) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                internalResolveAsync(id, resolveOptions, (error: any, result: string | undefined) => {
                    if (error) {
                        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                        reject(error);
                    } else {
                        resolve(result);
                    }
                });
            });

            if (resolved) {
                return resolved;
            }
        }
    }

    throw new Error(`${options.caller} could not resolve ${arrayFmt(ids)}`);
};

export const resolveSync = (ids: string[], userOptions: ResolveOptions): string => {
    const options = { ...defaultOptions, ...userOptions };

    for (const basedir of options.basedirs) {
        const resolveOptions = { ...options, basedir, basedirs: undefined, caller: undefined };

        for (const id of ids) {
            try {
                const resolved = internalResolveSync(id, resolveOptions);

                if (resolved) {
                    return resolved;
                }
            } catch {
                /* noop */
            }
        }
    }

    throw new Error(`${options.caller} could not resolve ${arrayFmt(ids)}`);
};

export interface ResolveOptions {
    /** directories to begin resolving from (defaults to `[__dirname]`) */
    basedirs?: string[];
    /** name of the caller for error message (default to `Resolver`) */
    caller?: string;
    /** array of file extensions to search in order (defaults to `[".mjs", ".js", ".cjs", ".json"]`) */
    extensions?: string[];
    /** transform the parsed `package.json` contents before looking at the "main" field */
    packageFilter?: PackageFilterFunction;
    /** don't resolve `basedirs` to real path before resolving. (defaults to `true`) */
    preserveSymlinks?: boolean;
}
