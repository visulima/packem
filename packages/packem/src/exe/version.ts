/**
 * A minimal semver parser and comparator, sized to what the `exe` build needs:
 * validating a Node.js version and checking it against a minimum.
 *
 * `semver` is deliberately not used here. It is a CommonJS package, and pulling it into
 * this module puts it on the boundary between packem's CLI bundle and the `sea` runtime
 * bundle, where `@rollup/plugin-commonjs` fails to generate a working interop wrapper.
 * The rules below are the subset that applies to Node.js release numbers.
 * @module
 */

// `major.minor.patch`, with the optional prerelease and build metadata Node.js nightlies carry.
const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/;

interface ParsedVersion {
    major: number;
    minor: number;
    patch: number;
    /** The `-rc.1` part of `25.7.0-rc.1`, absent for a final release. */
    prerelease?: string;
}

/**
 * Parses an exact `major.minor.patch` version.
 * @param value The version string, without a leading `v`.
 * @returns The parsed components, or `undefined` when the string is not an exact version.
 */
const parseVersion = (value: string): ParsedVersion | undefined => {
    const match = SEMVER_PATTERN.exec(value.trim());

    if (!match) {
        return undefined;
    }

    const [, major, minor, patch] = match;
    // `at` rather than `[4]`: the prerelease group is optional, so it is genuinely
    // absent for a final release and the index signature would claim otherwise.
    const prerelease = match.at(4);

    return {
        major: Number(major),
        minor: Number(minor),
        patch: Number(patch),
        ...(prerelease !== undefined && { prerelease }),
    };
};

/**
 * Reports whether a version is at least a given minimum.
 *
 * Follows the semver rule that a prerelease sorts below the release it leads to, so
 * `25.7.0-rc.1` is *not* at least `25.7.0`. Prereleases of a strictly higher version are
 * accepted, which is what makes a Node.js nightly usable.
 * @param version The version to test, without a leading `v`.
 * @param minimum The inclusive lower bound, an exact `major.minor.patch` version.
 * @returns `true` when `version` is greater than or equal to `minimum`.
 */
const isAtLeast = (version: string, minimum: string): boolean => {
    const parsed = parseVersion(version);
    const bound = parseVersion(minimum);

    if (!parsed || !bound) {
        return false;
    }

    const fields = ["major", "minor", "patch"] as const;

    for (const field of fields) {
        if (parsed[field] !== bound[field]) {
            return parsed[field] > bound[field];
        }
    }

    // Same triple: only a final release satisfies a final-release bound.
    return parsed.prerelease === undefined;
};

export type { ParsedVersion };
export { isAtLeast, parseVersion };
