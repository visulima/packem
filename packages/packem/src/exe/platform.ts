import type { ExeTargetSpec } from "./target";
import { isAtLeast, parseVersion } from "./version";

type ExePlatform = "darwin" | "linux" | "win";

type ExeArch = "arm64" | "x64";

interface ExeTarget {
    arch: ExeArch;

    /**
     * Node.js version to use for the executable.
     *
     * Accepts an exact version (`"25.7.0"`), a major or minor (`"25"`, `"25.7"`), or the
     * special values `"latest"` / `"latest-lts"`, which are resolved from
     * {@link https://nodejs.org/dist/index.json}.
     *
     * Defaults to `exe.nodeVersion`, and then to the Node.js version running the build.
     *
     * The minimum required version is 25.7.0, which is when stable SEA support landed in Node.js.
     */
    nodeVersion?: "latest" | "latest-lts" | (string & {}) | `${string}.${string}.${string}`;
    platform: ExePlatform;
}

/** An {@link ExeTarget} after `nodeVersion` has been defaulted and resolved to an exact release. */
interface ResolvedExeTarget extends ExeTarget {
    nodeVersion: string;
}

interface ExeExtensionOptions {
    /**
     * Cross-platform targets for building executables.
     *
     * Each target produces one executable. Targets other than the build host download
     * and cache the matching official Node.js binary from nodejs.org.
     *
     * A target can be written as a `pkg`-style string or as an object. In string form
     * the parts may appear in any order and anything omitted falls back to the host
     * (or to `exe.nodeVersion` for the version).
     * @example
     * ```ts
     * // String form — the shorthand most projects want.
     * targets: ["host", "linux-x64", "linux-arm64", "darwin-arm64", "win-x64"]
     *
     * // Pinning an exact Node.js version per target.
     * targets: ["node25.7.0-linux-x64", "node25.7.0-win-x64"]
     *
     * // Object form.
     * targets: [{ arch: "arm64", nodeVersion: "latest-lts", platform: "darwin" }]
     * ```
     */
    targets?: (ExeTarget | ExeTargetSpec)[];
}

const getArchiveExtension = (platform: ExePlatform): string => {
    if (platform === "win") {
        return "zip";
    }

    if (platform === "linux") {
        return "tar.xz";
    }

    return "tar.gz";
};

const getDownloadUrl = (target: ResolvedExeTarget): string => {
    const { arch, nodeVersion, platform } = target;
    const extension = getArchiveExtension(platform);

    return `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-${platform}-${arch}.${extension}`;
};

const getBinaryPathInArchive = (target: ResolvedExeTarget): string => {
    const { arch, nodeVersion, platform } = target;
    const directoryName = `node-v${nodeVersion}-${platform}-${arch}`;

    if (platform === "win") {
        return `${directoryName}/node.exe`;
    }

    return `${directoryName}/bin/node`;
};

interface NodeRelease {
    lts: false | string;
    version: string;
}

const NODE_DIST_INDEX_URL = "https://nodejs.org/dist/index.json";
const NODE_VERSION_PREFIX = /^v/;

/** The Node.js release that first shipped stable `--build-sea` support. */
const MIN_SEA_NODE_VERSION = "25.7.0";

/** Aliases resolved against the release index rather than parsed as semver. */
const LATEST_ALIASES = new Set(["latest", "latest-lts"]);

/** `25` or `25.7` — a partial version that has to be widened into a range. */
const PARTIAL_VERSION = /^\d+(?:\.\d+)?$/;

let releaseIndexPromise: Promise<NodeRelease[]> | undefined;

/**
 * Fetches (and memoizes for the lifetime of the process) the Node.js release index.
 *
 * A single build can resolve many targets, so the index is fetched once and shared
 * instead of being re-downloaded per target.
 * @returns The releases published on nodejs.org, newest first.
 * @throws If the index cannot be downloaded.
 */
const fetchReleaseIndex = async (): Promise<NodeRelease[]> => {
    releaseIndexPromise ??= (async () => {
        const response = await fetch(NODE_DIST_INDEX_URL);

        if (!response.ok) {
            throw new Error(`Failed to fetch Node.js releases: HTTP ${String(response.status)} from ${NODE_DIST_INDEX_URL}`);
        }

        return (await response.json()) as NodeRelease[];
    })();

    try {
        return await releaseIndexPromise;
    } catch (error) {
        // Don't cache the rejection — a transient network failure should not poison
        // every later target in the same build.
        releaseIndexPromise = undefined;

        throw error;
    }
};

/**
 * Resolves a configured Node.js version into an exact release.
 *
 * Accepts an exact version (`"25.7.0"`), a partial version (`"25"`, `"25.7"`), or the
 * `"latest"` / `"latest-lts"` aliases. Partial versions and aliases are matched against
 * {@link https://nodejs.org/dist/index.json}.
 * @param nodeVersion The configured version, with or without a leading `v`.
 * @returns The exact version without a leading `v`, e.g. `"25.7.0"`.
 * @throws If the version is invalid, has no matching release, or predates stable SEA support.
 */
const resolveNodeVersion = async (nodeVersion: string): Promise<string> => {
    let resolved = nodeVersion.trim().replace(NODE_VERSION_PREFIX, "");

    if (LATEST_ALIASES.has(resolved)) {
        const releases = await fetchReleaseIndex();
        const isWantLatest = resolved === "latest";
        let selectedVersion = "";

        for (const candidate of releases) {
            if (isWantLatest || candidate.lts !== false) {
                selectedVersion = candidate.version;
                break;
            }
        }

        if (selectedVersion === "") {
            throw new Error(`No matching Node.js release found for "${resolved}".`);
        }

        resolved = selectedVersion.replace(NODE_VERSION_PREFIX, "");
    } else if (PARTIAL_VERSION.test(resolved)) {
        // `"25"` means "the newest 25.x", which only the release index can answer.
        // The index is ordered newest first, so the first prefix match is the newest one.
        const releases = await fetchReleaseIndex();
        const prefix = `v${resolved}.`;
        const best = releases.find((release) => release.version.startsWith(prefix));

        if (!best) {
            throw new Error(`No Node.js release matches "${nodeVersion}". Check https://nodejs.org/dist for the available versions.`);
        }

        resolved = best.version.replace(NODE_VERSION_PREFIX, "");
    }

    if (!parseVersion(resolved)) {
        throw new Error(
            `Invalid Node.js version: ${nodeVersion}. Provide an exact version ("25.7.0"), a major or minor ("25", "25.7"), or "latest" / "latest-lts".`,
        );
    }

    const version = resolved;

    if (!isAtLeast(version, MIN_SEA_NODE_VERSION)) {
        throw new Error(
            `Node.js ${version} does not support SEA (Single Executable Applications). Required minimum version is ${MIN_SEA_NODE_VERSION}. Please update the nodeVersion in your target configuration.`,
        );
    }

    return version;
};

export type { ExeArch, ExeExtensionOptions, ExePlatform, ExeTarget, ResolvedExeTarget };
export { getArchiveExtension, getBinaryPathInArchive, getDownloadUrl, MIN_SEA_NODE_VERSION, resolveNodeVersion };
