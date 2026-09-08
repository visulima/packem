import { describe, expect, it } from "vitest";

import type { FileNameTokens } from "../../../src/exe/file-name";
import { applyTokens, buildFileName, getTargetSuffix, hasTokens } from "../../../src/exe/file-name";

const tokens: FileNameTokens = {
    arch: "arm64",
    name: "cli",
    node: "25.7.0",
    platform: "darwin",
    version: "2.1.0",
};

describe("exe file names", () => {
    describe(hasTokens, () => {
        it.each([["[name]"], ["prefix-[platform]"], ["[name]-[platform]-[arch]"], ["[node]"], ["[version]"]])("should detect a token in %s", (template) => {
            expect.assertions(1);

            expect(hasTokens(template)).toBe(true);
        });

        it.each([["my-app"], ["[unknown]"], [""], ["name"]])("should not detect a token in %s", (template) => {
            expect.assertions(1);

            expect(hasTokens(template)).toBe(false);
        });

        it("should not be affected by a previous call, since the pattern is global", () => {
            expect.assertions(2);

            expect(hasTokens("[name]")).toBe(true);
            expect(hasTokens("[name]")).toBe(true);
        });
    });

    describe(applyTokens, () => {
        it("should interpolate every token", () => {
            expect.assertions(1);

            expect(applyTokens("[name]-[version]-[platform]-[arch]-node[node]", tokens)).toBe("cli-2.1.0-darwin-arm64-node25.7.0");
        });

        it("should interpolate a repeated token", () => {
            expect.assertions(1);

            expect(applyTokens("[name]-[name]", tokens)).toBe("cli-cli");
        });

        it("should leave an unknown token untouched", () => {
            expect.assertions(1);

            expect(applyTokens("[name]-[nope]", tokens)).toBe("cli-[nope]");
        });
    });

    describe(buildFileName, () => {
        it("should use the entry name for a single output", () => {
            expect.assertions(1);

            expect(buildFileName({ multiple: false, tokens })).toBe("cli");
        });

        it("should add the platform suffix for a multi output", () => {
            expect.assertions(1);

            expect(buildFileName({ multiple: true, tokens })).toBe("cli-darwin-arm64");
        });

        it("should append .exe for windows targets", () => {
            expect.assertions(1);

            expect(buildFileName({ multiple: false, tokens: { ...tokens, platform: "win" } })).toBe("cli.exe");
        });

        it("should append .exe after the suffix for a multi output", () => {
            expect.assertions(1);

            expect(buildFileName({ multiple: true, tokens: { ...tokens, arch: "x64", platform: "win" } })).toBe("cli-win-x64.exe");
        });

        it("should honour a tokenised template", () => {
            expect.assertions(1);

            expect(buildFileName({ multiple: true, template: "app_[arch]", tokens })).toBe("app_arm64");
        });

        it("should use a literal template verbatim for a single output", () => {
            expect.assertions(1);

            expect(buildFileName({ multiple: false, template: "my-app", tokens })).toBe("my-app");
        });

        it("should suffix a literal template for a multi output so files do not collide", () => {
            expect.assertions(1);

            expect(buildFileName({ multiple: true, template: "my-app", tokens })).toBe("my-app-darwin-arm64");
        });

        it("should not suffix a tokenised template, since the user controls uniqueness", () => {
            expect.assertions(1);

            expect(buildFileName({ multiple: true, template: "[name]-[node]", tokens })).toBe("cli-25.7.0");
        });

        it("should reject a template that renders to nothing", () => {
            expect.assertions(1);

            expect(() => buildFileName({ multiple: false, template: "[version]", tokens: { ...tokens, version: "" } })).toThrow("produced an empty file name");
        });
    });

    describe(getTargetSuffix, () => {
        it("should build a platform-arch suffix", () => {
            expect.assertions(1);

            expect(getTargetSuffix({ arch: "x64", nodeVersion: "25.7.0", platform: "linux" })).toBe("-linux-x64");
        });
    });
});
