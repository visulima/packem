import satisfies from "semver/functions/satisfies.js";
import valid from "semver/functions/valid.js";

type ExePlatform = "darwin" | "linux" | "win";

type ExeArch = "arm64" | "x64";

interface ExeTarget {
    arch: ExeArch;

    /**
     * Node.js version to use for the executable.
     *
     * Accepts a valid semver string (e.g., `"25.7.0"`), or the special values
     * `"latest"` / `"latest-lts"` which resolve the version automatically from
     * {@link https://nodejs.org/dist/index.json}.
     *
     * The minimum required version is 25.7.0, which is when stable SEA support landed in Node.js.
     */
    nodeVersion:
        | "latest"
        | "latest-lts"
        | (string & {})
        | `${string}.${string}.${string}`;
    platform: ExePlatform;
}

interface ExeExtensionOptions {
    /**
     * Cross-platform targets for building executables.
     * When specified, builds an executable for each target platform/arch combination
     * by downloading and caching the corresponding Node.js binary from nodejs.org.
     * @example
     * ```ts
     * targets: [
     *   { platform: "linux",  arch: "x64",   nodeVersion: "25.7.0" },
     *   { platform: "darwin", arch: "arm64", nodeVersion: "25.7.0" },
     *   { platform: "win",    arch: "x64",   nodeVersion: "25.7.0" },
     * ]
     * ```
     */
    targets?: ExeTarget[];
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

const getDownloadUrl = (target: ExeTarget): string => {
    const { arch, nodeVersion, platform } = target;
    const extension = getArchiveExtension(platform);

    return `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-${platform}-${arch}.${extension}`;
};

const getBinaryPathInArchive = (target: ExeTarget): string => {
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

const resolveNodeVersion = async (nodeVersion: string): Promise<string> => {
    let resolved = nodeVersion;

    if (resolved === "latest" || resolved === "latest-lts") {
        const response = await fetch(NODE_DIST_INDEX_URL);

        if (!response.ok) {
            throw new Error(
                `Failed to fetch Node.js releases: HTTP ${String(response.status)} from ${NODE_DIST_INDEX_URL}`,
            );
        }

        const releases = (await response.json()) as NodeRelease[];
        const wantLatest = resolved === "latest";
        let selectedVersion = "";

        for (const candidate of releases) {
            if (wantLatest || candidate.lts !== false) {
                selectedVersion = candidate.version;
                break;
            }
        }

        if (selectedVersion === "") {
            throw new Error(`No matching Node.js release found for "${resolved}".`);
        }

        resolved = selectedVersion.replace(NODE_VERSION_PREFIX, "");
    }

    const version = valid(resolved);

    if (!version) {
        throw new Error(
            `Invalid Node.js version: ${resolved}. Please provide a valid version string (e.g., "25.7.0").`,
        );
    }

    if (!satisfies(version, ">=25.7.0")) {
        throw new Error(
            `Node.js ${version} does not support SEA (Single Executable Applications). Required minimum version is 25.7.0. Please update the nodeVersion in your target configuration.`,
        );
    }

    return version;
};

const getTargetSuffix = (target: ExeTarget): string => `-${target.platform}-${target.arch}`;

export type { ExeArch, ExeExtensionOptions, ExePlatform, ExeTarget };
export {
    getArchiveExtension,
    getBinaryPathInArchive,
    getDownloadUrl,
    getTargetSuffix,
    resolveNodeVersion,
};
