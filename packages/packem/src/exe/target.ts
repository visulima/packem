import { arch as processArch, platform as processPlatform, versions as processVersions } from "node:process";

import type { ExeArch, ExePlatform, ExeTarget, ResolvedExeTarget } from "./platform";

/**
 * A target expressed as a `pkg`-style string.
 *
 * Accepted shapes (case-insensitive, any order of the optional parts):
 *
 * - `"host"` — the machine running the build.
 * - `"linux"` — platform only; architecture and Node.js version fall back to the defaults.
 * - `"linux-arm64"` — platform and architecture.
 * - `"node25-linux-x64"` — Node.js major, platform and architecture.
 * - `"node25.7.0-win-x64"` — exact Node.js version.
 * - `"latest-darwin-arm64"` / `"lts-darwin-arm64"` — resolved from the Node.js release index.
 * @example
 * ```ts
 * targets: ["host", "node25-linux-x64", "darwin-arm64", "win-x64"]
 * ```
 */
type ExeTargetSpec = "host" | (string & {}) | `${string}-${string}`;

const PLATFORM_ALIASES: Record<string, ExePlatform | undefined> = {
    darwin: "darwin",
    linux: "linux",
    mac: "darwin",
    macos: "darwin",
    osx: "darwin",
    win: "win",
    win32: "win",
    windows: "win",
};

const ARCH_ALIASES: Record<string, ExeArch | undefined> = {
    aarch64: "arm64",
    amd64: "x64",
    arm64: "arm64",
    x64: "x64",
    x86_64: "x64",
};

/** Platforms `pkg` supports that Node.js does not publish official SEA-capable builds for. */
const UNSUPPORTED_PLATFORMS = new Set(["alpine", "android", "freebsd", "musl", "openbsd", "sunos"]);

const UNSUPPORTED_ARCHS = new Set(["armv6", "armv7", "ia32", "ppc64", "s390x", "x86"]);

// `node25`, `node25.7`, `node25.7.0` — the `node` prefix is optional in our own syntax
// but required by `pkg`, so both are accepted.
const NODE_VERSION_TOKEN = /^(?:node-?)?(\d+(?:\.\d+){0,2})$/i;

/** Version aliases mapped to the canonical spelling the version resolver understands. */
const VERSION_ALIASES: Record<string, string | undefined> = {
    current: "latest",
    latest: "latest",
    "latest-lts": "latest-lts",
    lts: "latest-lts",
};

/**
 * Returns the {@link ExePlatform} matching the machine running the build.
 * @returns `"win"` on Windows, otherwise the Node.js `process.platform` value.
 * @throws If the host platform has no official Node.js build usable for SEA.
 */
const getHostPlatform = (): ExePlatform => {
    const platform = PLATFORM_ALIASES[processPlatform];

    if (!platform) {
        throw new Error(`The host platform "${processPlatform}" is not supported by the \`exe\` option. Supported platforms: darwin, linux, win.`);
    }

    return platform;
};

/**
 * Returns the {@link ExeArch} matching the machine running the build.
 * @returns `"x64"` or `"arm64"`.
 * @throws If the host architecture has no official Node.js build usable for SEA.
 */
const getHostArch = (): ExeArch => {
    const arch = ARCH_ALIASES[processArch];

    if (!arch) {
        throw new Error(`The host architecture "${processArch}" is not supported by the \`exe\` option. Supported architectures: x64, arm64.`);
    }

    return arch;
};

/**
 * Returns the Node.js version of the process running the build, without the leading `v`.
 * @returns For example `"25.7.0"`.
 */
const getHostNodeVersion = (): string => processVersions.node;

const describeToken = (token: string, spec: string): Error => {
    if (UNSUPPORTED_PLATFORMS.has(token)) {
        return new Error(
            `Target "${spec}" requests the "${token}" platform, which Node.js does not publish official builds for. `
                + `\`exe\` targets are limited to darwin, linux and win.`,
        );
    }

    if (UNSUPPORTED_ARCHS.has(token)) {
        return new Error(
            `Target "${spec}" requests the "${token}" architecture, which Node.js does not publish SEA-capable builds for. `
                + `\`exe\` targets are limited to x64 and arm64.`,
        );
    }

    return new Error(`Unable to parse "${token}" in target "${spec}". A target looks like "node25-linux-x64", "darwin-arm64", "win" or "host".`);
};

interface ParseTargetOptions {
    /** Node.js version used when the spec does not carry one. */
    defaultNodeVersion?: string;
}

/**
 * Parses a `pkg`-style target string into a fully resolved {@link ExeTarget}.
 *
 * Parts may appear in any order, so `"linux-node25-x64"` and `"node25-linux-x64"`
 * are equivalent. Missing parts fall back to the host platform/architecture and to
 * `defaultNodeVersion` (itself defaulting to the Node.js version running the build).
 * @param spec The target string, e.g. `"node25-linux-x64"`.
 * @param options Fallbacks applied to the parts the spec omits.
 * @returns The resolved target. `nodeVersion` may still be an alias such as `"latest-lts"`.
 * @throws If a part cannot be recognised, or if the same part is given twice.
 */
interface TargetParts {
    arch?: ExeArch;
    nodeVersion?: string;
    platform?: ExePlatform;
}

type TokenPart = { kind: "arch"; value: ExeArch } | { kind: "nodeVersion"; value: string } | { kind: "platform"; value: ExePlatform };

const PART_LABELS: Record<TokenPart["kind"], string> = {
    arch: "architecture",
    nodeVersion: "Node.js version",
    platform: "platform",
};

/**
 * Classifies one token of a target spec as a platform, an architecture or a Node.js version.
 * @param token The lowercased token, e.g. `"linux"`, `"x64"` or `"node25"`.
 * @param spec The whole spec, used for the error message.
 * @returns Which part the token names, and its normalized value.
 * @throws If the token matches none of the three.
 */
const classifyToken = (token: string, spec: string): TokenPart => {
    const platform = PLATFORM_ALIASES[token];

    if (platform) {
        return { kind: "platform", value: platform };
    }

    const arch = ARCH_ALIASES[token];

    if (arch) {
        return { kind: "arch", value: arch };
    }

    const alias = VERSION_ALIASES[token];
    const version = alias ?? NODE_VERSION_TOKEN.exec(token)?.[1];

    if (version === undefined) {
        throw describeToken(token, spec);
    }

    return { kind: "nodeVersion", value: version };
};

const parseTargetSpec = (spec: string, options: ParseTargetOptions = {}): ResolvedExeTarget => {
    const trimmed = spec.trim().toLowerCase();

    if (trimmed === "") {
        throw new Error("An `exe` target must not be an empty string.");
    }

    const fallbackNodeVersion = options.defaultNodeVersion ?? getHostNodeVersion();

    if (trimmed === "host") {
        return { arch: getHostArch(), nodeVersion: fallbackNodeVersion, platform: getHostPlatform() };
    }

    // `latest-lts` is a single alias that happens to contain the separator, so it is
    // folded into one token before the split and unfolded again inside the loop.
    const tokens = trimmed.replace("latest-lts", "latestlts").split("-").filter(Boolean);
    const parts: TargetParts = {};

    for (const token of tokens) {
        const part = classifyToken(token === "latestlts" ? "latest-lts" : token, spec);

        if (parts[part.kind] !== undefined) {
            throw new Error(`Target "${spec}" specifies more than one ${PART_LABELS[part.kind]}.`);
        }

        parts[part.kind] = part.value as never;
    }

    return {
        arch: parts.arch ?? getHostArch(),
        nodeVersion: parts.nodeVersion ?? fallbackNodeVersion,
        platform: parts.platform ?? getHostPlatform(),
    };
};

/**
 * Normalizes the user-facing `exe.targets` value into fully resolved {@link ExeTarget} objects.
 *
 * Strings go through {@link parseTargetSpec}; objects are passed through with the
 * platform/architecture aliases applied and `nodeVersion` defaulted. Duplicate targets
 * are collapsed so `["host", "linux-x64"]` on a Linux x64 machine builds one executable.
 * @param targets The configured targets, or `undefined` for a host-only build.
 * @param defaultNodeVersion Node.js version used for targets that do not name one.
 * @returns The de-duplicated, resolved target list. Empty when `targets` is empty or `undefined`.
 * @throws If any target is malformed.
 */
const resolveTargets = (targets: ReadonlyArray<ExeTarget | string> | undefined, defaultNodeVersion?: string): ResolvedExeTarget[] => {
    if (targets === undefined || targets.length === 0) {
        return [];
    }

    const seen = new Set<string>();
    const resolved: ResolvedExeTarget[] = [];

    for (const target of targets) {
        const parsed =
            typeof target === "string"
                ? parseTargetSpec(target, { defaultNodeVersion })
                : {
                      arch: ARCH_ALIASES[target.arch.toLowerCase()] ?? target.arch,
                      nodeVersion: target.nodeVersion ?? defaultNodeVersion ?? getHostNodeVersion(),
                      platform: PLATFORM_ALIASES[target.platform.toLowerCase()] ?? target.platform,
                  };

        if (!PLATFORM_ALIASES[parsed.platform]) {
            throw new Error(`Unsupported \`exe\` target platform "${parsed.platform}". Supported platforms: darwin, linux, win.`);
        }

        if (!ARCH_ALIASES[parsed.arch]) {
            throw new Error(`Unsupported \`exe\` target architecture "${parsed.arch}". Supported architectures: x64, arm64.`);
        }

        const key = `${parsed.nodeVersion}/${parsed.platform}/${parsed.arch}`;

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        resolved.push(parsed);
    }

    return resolved;
};

/**
 * Reports whether a target describes the machine running the build.
 *
 * A host target can reuse `process.execPath` instead of downloading a Node.js binary,
 * which is both faster and avoids a network round trip.
 * @param target The resolved target.
 * @returns `true` when platform, architecture and Node.js version all match the host.
 */
const isHostTarget = (target: ResolvedExeTarget): boolean =>
    target.platform === getHostPlatform() && target.arch === getHostArch() && target.nodeVersion === getHostNodeVersion();

export type { ExeTargetSpec, ParseTargetOptions };
export { getHostArch, getHostNodeVersion, getHostPlatform, isHostTarget, parseTargetSpec, resolveTargets };
