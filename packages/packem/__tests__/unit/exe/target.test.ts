import { arch as processArch, platform as processPlatform, versions as processVersions } from "node:process";

import { describe, expect, it } from "vitest";

import { getHostArch, getHostNodeVersion, getHostPlatform, isHostTarget, parseTargetSpec, resolveTargets } from "../../../src/exe/target";

const hostPlatform = getHostPlatform();
const hostArch = getHostArch();
const hostNode = getHostNodeVersion();

describe("exe target parsing", () => {
    describe(parseTargetSpec, () => {
        it("should resolve `host` to the machine running the build", () => {
            expect.assertions(1);

            expect(parseTargetSpec("host")).toStrictEqual({ arch: hostArch, nodeVersion: hostNode, platform: hostPlatform });
        });

        it("should parse a full pkg-style triple", () => {
            expect.assertions(1);

            expect(parseTargetSpec("node25-linux-x64")).toStrictEqual({ arch: "x64", nodeVersion: "25", platform: "linux" });
        });

        it("should parse an exact node version", () => {
            expect.assertions(1);

            expect(parseTargetSpec("node25.7.0-win-x64")).toStrictEqual({ arch: "x64", nodeVersion: "25.7.0", platform: "win" });
        });

        it("should accept the node version without the `node` prefix", () => {
            expect.assertions(1);

            expect(parseTargetSpec("25.7.0-darwin-arm64")).toStrictEqual({ arch: "arm64", nodeVersion: "25.7.0", platform: "darwin" });
        });

        it("should accept the parts in any order", () => {
            expect.assertions(1);

            expect(parseTargetSpec("x64-linux-node25")).toStrictEqual(parseTargetSpec("node25-linux-x64"));
        });

        it("should default the architecture to the host when omitted", () => {
            expect.assertions(1);

            expect(parseTargetSpec("linux")).toStrictEqual({ arch: hostArch, nodeVersion: hostNode, platform: "linux" });
        });

        it("should default the platform to the host when only an architecture is given", () => {
            expect.assertions(1);

            expect(parseTargetSpec("arm64")).toStrictEqual({ arch: "arm64", nodeVersion: hostNode, platform: hostPlatform });
        });

        it.each([
            ["macos-arm64", "darwin", "arm64"],
            ["mac-arm64", "darwin", "arm64"],
            ["osx-x64", "darwin", "x64"],
            ["windows-x64", "win", "x64"],
            ["win32-x64", "win", "x64"],
            ["linux-amd64", "linux", "x64"],
            ["linux-x86_64", "linux", "x64"],
            ["linux-aarch64", "linux", "arm64"],
        ])("should normalize the aliases in %s", (spec, platform, arch) => {
            expect.assertions(2);

            const target = parseTargetSpec(spec);

            expect(target.platform).toBe(platform);
            expect(target.arch).toBe(arch);
        });

        it("should be case insensitive", () => {
            expect.assertions(1);

            expect(parseTargetSpec("Node25-LINUX-X64")).toStrictEqual({ arch: "x64", nodeVersion: "25", platform: "linux" });
        });

        it.each([
            ["latest-linux-x64", "latest"],
            ["lts-linux-x64", "latest-lts"],
            ["latest-lts-linux-x64", "latest-lts"],
            ["current-linux-x64", "latest"],
        ])("should map the version alias in %s to %s", (spec, expected) => {
            expect.assertions(1);

            expect(parseTargetSpec(spec).nodeVersion).toBe(expected);
        });

        it("should apply the configured default node version", () => {
            expect.assertions(1);

            expect(parseTargetSpec("linux-x64", { defaultNodeVersion: "25.9.1" }).nodeVersion).toBe("25.9.1");
        });

        it("should let an explicit version win over the default", () => {
            expect.assertions(1);

            expect(parseTargetSpec("node26-linux-x64", { defaultNodeVersion: "25.9.1" }).nodeVersion).toBe("26");
        });

        it("should reject an empty spec", () => {
            expect.assertions(1);

            expect(() => parseTargetSpec("  ")).toThrow("must not be an empty string");
        });

        it("should reject an unknown token", () => {
            expect.assertions(1);

            expect(() => parseTargetSpec("node25-plan9-x64")).toThrow('Unable to parse "plan9" in target "node25-plan9-x64"');
        });

        it("should explain that a platform pkg supports has no official Node.js build", () => {
            expect.assertions(1);

            expect(() => parseTargetSpec("node25-alpine-x64")).toThrow("Node.js does not publish official builds for");
        });

        it("should explain that an architecture pkg supports has no SEA-capable build", () => {
            expect.assertions(1);

            expect(() => parseTargetSpec("node25-linux-armv7")).toThrow("does not publish SEA-capable builds");
        });

        it.each([
            ["linux-win-x64", "more than one platform"],
            ["linux-x64-arm64", "more than one architecture"],
            ["node25-node26-linux", "more than one Node.js version"],
        ])("should reject the conflicting spec %s", (spec, message) => {
            expect.assertions(1);

            expect(() => parseTargetSpec(spec)).toThrow(message);
        });
    });

    describe(resolveTargets, () => {
        it("should return an empty list when no targets are configured", () => {
            expect.assertions(2);

            expect(resolveTargets(undefined)).toStrictEqual([]);
            expect(resolveTargets([])).toStrictEqual([]);
        });

        it("should de-duplicate targets that resolve to the same triple", () => {
            expect.assertions(1);

            const resolved = resolveTargets([`${hostPlatform}-${hostArch}`, "host"]);

            expect(resolved).toHaveLength(1);
        });

        it("should keep targets that differ only by node version", () => {
            expect.assertions(1);

            expect(resolveTargets(["node25-linux-x64", "node26-linux-x64"])).toHaveLength(2);
        });

        it("should preserve the configured order", () => {
            expect.assertions(1);

            const resolved = resolveTargets(["win-x64", "linux-arm64", "darwin-arm64"], "25.7.0");

            expect(resolved.map((target) => target.platform)).toStrictEqual(["win", "linux", "darwin"]);
        });

        it("should normalize object targets and default their node version", () => {
            expect.assertions(1);

            expect(resolveTargets([{ arch: "x64", platform: "macos" } as never], "25.7.0")).toStrictEqual([
                { arch: "x64", nodeVersion: "25.7.0", platform: "darwin" },
            ]);
        });

        it("should reject an object target with an unsupported platform", () => {
            expect.assertions(1);

            expect(() => resolveTargets([{ arch: "x64", platform: "freebsd" } as never])).toThrow("Unsupported `exe` target platform");
        });

        it("should reject an object target with an unsupported architecture", () => {
            expect.assertions(1);

            expect(() => resolveTargets([{ arch: "ia32", platform: "win" } as never])).toThrow("Unsupported `exe` target architecture");
        });

        it("should mix string and object targets", () => {
            expect.assertions(1);

            expect(resolveTargets(["linux-x64", { arch: "arm64", nodeVersion: "25.7.0", platform: "darwin" }], "25.7.0")).toStrictEqual([
                { arch: "x64", nodeVersion: "25.7.0", platform: "linux" },
                { arch: "arm64", nodeVersion: "25.7.0", platform: "darwin" },
            ]);
        });
    });

    describe(isHostTarget, () => {
        it("should recognise the host triple", () => {
            expect.assertions(1);

            expect(isHostTarget({ arch: hostArch, nodeVersion: hostNode, platform: hostPlatform })).toBe(true);
        });

        it("should not treat a different node version as the host", () => {
            expect.assertions(1);

            expect(isHostTarget({ arch: hostArch, nodeVersion: "0.0.1", platform: hostPlatform })).toBe(false);
        });

        it("should not treat a different platform as the host", () => {
            expect.assertions(1);

            const otherPlatform = hostPlatform === "linux" ? "win" : "linux";

            expect(isHostTarget({ arch: hostArch, nodeVersion: hostNode, platform: otherPlatform })).toBe(false);
        });
    });

    describe("host detection", () => {
        it("should report the running node version", () => {
            expect.assertions(1);

            expect(getHostNodeVersion()).toBe(processVersions.node);
        });

        it("should map the running platform and architecture", () => {
            expect.assertions(2);

            expect(getHostPlatform()).toBe(processPlatform === "win32" ? "win" : processPlatform);
            expect(getHostArch()).toBe(processArch);
        });
    });
});
