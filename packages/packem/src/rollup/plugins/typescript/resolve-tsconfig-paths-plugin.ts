/**
 * This webpack resolver is largely based on TypeScript's "paths" handling
 * The TypeScript license can be found here:
 * https://github.com/microsoft/TypeScript/blob/214df64e287804577afa1fea0184c18c40f7d1ca/LICENSE.txt
 */
import type { Pail } from "@visulima/pail";
import { dirname, isAbsolute, join, resolve } from "@visulima/path";
import { isRelative } from "@visulima/path/utils";
import type { TsConfigResult } from "@visulima/tsconfig";
import type { Plugin } from "rollup";

interface Pattern {
    prefix: string;
    suffix: string;
}

const asterisk = 0x2a;

const hasZeroOrOneAsteriskCharacter = (string_: string): boolean => {
    let seenAsterisk = false;

    // eslint-disable-next-line no-plusplus
    for (let index = 0; index < string_.length; index++) {
        if (string_.codePointAt(index) === asterisk) {
            if (seenAsterisk) {
                // have already seen asterisk
                return false;
            }
            seenAsterisk = true;
        }
    }

    return true;
};

const tryParsePattern = (pattern: string): Pattern | undefined => {
    // This should be verified outside of here and a proper error thrown.
    const indexOfStar = pattern.indexOf("*");

    return indexOfStar === -1
        ? undefined
        : {
              prefix: pattern.slice(0, indexOfStar),
              suffix: pattern.slice(indexOfStar + 1),
          };
};

const isPatternMatch = ({ prefix, suffix }: Pattern, candidate: string) =>
    candidate.length >= prefix.length + suffix.length && candidate.startsWith(prefix) && candidate.endsWith(suffix);

/** Return the object corresponding to the best pattern to match `candidate`. */
const findBestPatternMatch = <T>(values: ReadonlyArray<T>, getPattern: (value: T) => Pattern, candidate: string): T | undefined => {
    let matchedValue: T | undefined;
    // use length of prefix as betterness criteria
    let longestMatchPrefixLength = -1;

    for (const v of values) {
        const pattern = getPattern(v);

        if (isPatternMatch(pattern, candidate) && pattern.prefix.length > longestMatchPrefixLength) {
            longestMatchPrefixLength = pattern.prefix.length;
            matchedValue = v;
        }
    }

    return matchedValue;
};

/**
 * patternStrings contains both pattern strings (containing "*") and regular strings.
 * Return an exact match if possible, or a pattern match, or undefined.
 *
 * These are verified by verifyCompilerOptions to have 0 or 1 "*" characters.
 * @see https://github.com/microsoft/TypeScript/blob/main/src/compiler/program.ts#L4332-L4365
 */
const matchPatternOrExact = (patternStrings: ReadonlyArray<string>, candidate: string): string | Pattern | undefined => {
    const patterns: Pattern[] = [];

    for (const patternString of patternStrings) {
        if (!hasZeroOrOneAsteriskCharacter(patternString)) {
            // eslint-disable-next-line no-continue
            continue;
        }

        const pattern = tryParsePattern(patternString);

        if (pattern) {
            patterns.push(pattern);
        } else if (patternString === candidate) {
            // pattern was matched as is - no need to search further
            return patternString;
        }
    }

    return findBestPatternMatch(patterns, (_) => _, candidate);
};

/**
 * Given that candidate matches pattern, returns the text matching the '*'.
 * E.g.: matchedText(tryParsePattern("foo*baz"), "foobarbaz") === "bar"
 */
// eslint-disable-next-line unicorn/prefer-string-slice
const matchedText = (pattern: Pattern, candidate: string): string => candidate.substring(pattern.prefix.length, candidate.length - pattern.suffix.length);

const patternText = ({ prefix, suffix }: Pattern): string => `${prefix}*${suffix}`;

const getTsconfigPaths = (
    rootDirectory: string,
    tsconfig: TsConfigResult,
    logger?: Pail,
): {
    paths: Record<string, string[]>;
    resolvedBaseUrl: string;
} => {
    let resolvedBaseUrl: string = dirname(tsconfig.path);

    if (tsconfig.config.compilerOptions?.baseUrl) {
        resolvedBaseUrl = resolve(rootDirectory, tsconfig.config.compilerOptions.baseUrl);
    }

    logger?.debug({
        message: `Resolved baseUrl to ${resolvedBaseUrl}`,
        prefix: "plugin:packem:resolve-tsconfig-paths",
    });

    const paths = tsconfig.config.compilerOptions?.paths ?? {};
    const pathsKeys = Object.keys(paths);

    if (pathsKeys.length === 0) {
        logger?.debug({
            message: `No paths found in tsconfig.json`,
            prefix: "plugin:packem:resolve-tsconfig-paths",
        });
    }

    return {
        paths,
        resolvedBaseUrl,
    };
};

export type TsconfigPathsPluginOptions = {
    resolveAbsolutePath?: boolean;
}

// eslint-disable-next-line no-secrets/no-secrets
/**
 * Handles tsconfig.json or jsconfig.js "paths" option for webpack
 * Largely based on how the TypeScript compiler handles it:
 * https://github.com/microsoft/TypeScript/blob/1a9c8197fffe3dace5f8dca6633d450a88cba66d/src/compiler/moduleNameResolver.ts#L1362
 */
export const resolveTsconfigPathsPlugin = (rootDirectory: string, tsconfig: TsConfigResult, logger: Pail, pluginOptions: TsconfigPathsPluginOptions): Plugin => {
    const { paths, resolvedBaseUrl } = getTsconfigPaths(rootDirectory, tsconfig, logger);
    const pathsKeys = Object.keys(paths);

    return {
        name: "packem:resolve-tsconfig-paths",
        // eslint-disable-next-line sonarjs/cognitive-complexity
        async resolveId(id, importer, options) {
            if (pathsKeys.length === 0) {
                return null;
            }

            if (id.includes("\0")) {
                logger.debug({
                    message: `Skipping resolution of ${id} as it is a virtual module`,
                    prefix: "plugin:packem:resolve-tsconfig-paths",
                });

                return null;
            }

            // Exclude node_modules from paths support (speeds up resolving)
            if (id.includes("node_modules")) {
                logger.debug({
                    message: `Skipping request as it is inside node_modules ${id}`,
                    prefix: "plugin:packem:resolve-tsconfig-paths",
                });

                return null;
            }

            if (!pluginOptions.resolveAbsolutePath && isAbsolute(id)) {
                logger.debug({
                    message: `Skipping request as it is an absolute path ${id}`,
                    prefix: "plugin:packem:resolve-tsconfig-paths",
                });

                return null;
            }

            if (isRelative(id)) {
                logger.debug({
                    message: `Skipping request as it is a relative path ${id}`,
                    prefix: "plugin:packem:resolve-tsconfig-paths",
                });

                return null;
            }
            // If the module name does not match any of the patterns in `paths` we hand off resolving to webpack
            const matchedPattern = matchPatternOrExact(pathsKeys, id);

            if (!matchedPattern) {
                logger.debug({
                    message: `moduleName did not match any paths pattern ${id}`,
                    prefix: "plugin:packem:resolve-tsconfig-paths",
                });

                return null;
            }

            const matchedStar = typeof matchedPattern === "string" ? undefined : matchedText(matchedPattern, id);
            const matchedPatternText = typeof matchedPattern === "string" ? matchedPattern : patternText(matchedPattern);

            for await (const tsPath of paths[matchedPatternText] as string[]) {
                const currentPath = matchedStar ? tsPath.replace("*", matchedStar) : tsPath;

                // Ensure .d.ts is not matched
                if (currentPath.endsWith(".d.ts") || currentPath.endsWith(".d.cts") || currentPath.endsWith(".d.mts")) {
                    // eslint-disable-next-line no-continue
                    continue;
                }

                const candidate = join(resolvedBaseUrl, currentPath);

                try {
                    const resolved = await this.resolve(candidate, importer, { skipSelf: true, ...options });

                    if (resolved) {
                        return resolved;
                    }
                } catch (error) {
                    logger.debug({
                        context: error,
                        message: `Failed to resolve ${candidate} from ${id as string}`,
                        prefix: "plugin:packem:resolve-tsconfig-paths",
                    });
                }
            }

            return null;
        },
    };
};
