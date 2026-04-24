/* eslint-disable jsdoc/match-description */
import { isAbsolute, relative } from "@visulima/path";

/**
 * Parse import specifier into package name and subpath.
 * Examples:
 * - 'foo' → ['foo', undefined]
 * - 'foo/bar' → ['foo', 'bar']
 * - '@org/pkg' → ['@org/pkg', undefined]
 * - '@org/pkg/sub' → ['@org/pkg', 'sub']
 */
export const parseSpecifier = (specifier: string): [packageName: string, subpath: string | undefined] => {
    const firstSlash = specifier.indexOf("/");

    if (firstSlash === -1) {
        return [specifier, undefined];
    }

    if (specifier[0] === "@") {
        // Scoped package: @org/package[/subpath]
        const secondSlash = specifier.indexOf("/", firstSlash + 1);

        if (secondSlash === -1) {
            return [specifier, undefined];
        }

        return [specifier.slice(0, secondSlash), specifier.slice(secondSlash + 1)];
    }

    // Regular package: package[/subpath]
    return [specifier.slice(0, firstSlash), specifier.slice(firstSlash + 1)];
};

/**
 * Check if a specifier is a bare specifier (not relative or absolute).
 */
export const isBareSpecifier = (id: string): boolean => {
    const firstCharacter = id[0];

    return !(firstCharacter === "." || firstCharacter === "/" || firstCharacter === "#" || isAbsolute(id));
};

/**
 * Check if a file path is from node_modules.
 * @param filePath Absolute file path to check
 * @param cwd Current working directory (defaults to process.cwd())
 * @returns true if path contains node_modules directory
 */
export const isFromNodeModules = (filePath: string, cwd: string = process.cwd()): boolean => {
    const relativePath = relative(cwd, filePath);
    const pathSegments = relativePath.split("/");

    return pathSegments.includes("node_modules");
};

/**
 * Check if a file path is outside this project (i.e. third-party).
 *
 * Returns true for both traditional `node_modules/` paths and for files that
 * escape `cwd` — pnpm workspace siblings resolve via symlinks to their real
 * path (e.g. `../../other-pkg/dist/index.d.ts`), which isn't under
 * `node_modules/` but isn't this project's source either.
 * @param filePath Absolute file path to check
 * @param cwd Current working directory (defaults to process.cwd())
 * @returns true if the path escapes the project tree or sits inside node_modules
 */
export const isOutsideProject = (filePath: string, cwd: string = process.cwd()): boolean => {
    const relativePath = relative(cwd, filePath);

    if (relativePath.startsWith("..")) {
        return true;
    }

    return relativePath.split("/").includes("node_modules");
};
