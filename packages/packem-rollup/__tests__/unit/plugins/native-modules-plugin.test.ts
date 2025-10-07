import { describe, expect, expectTypeOf, it } from "vitest";

import type { NativeModulesOptions } from "../../../src/plugins/native-modules-plugin";
import { nativeModulesPlugin } from "../../../src/plugins/native-modules-plugin";

describe("nativeModules plugin", () => {
    const mockOptions: NativeModulesOptions = {
        nativesDirectory: "natives",
    };

    it("should be defined and be a function", () => {
        expect.assertions(1);

        expect(nativeModulesPlugin).toBeDefined();

        expectTypeOf(nativeModulesPlugin).toBeFunction();
    });

    it("should create plugin with default options", () => {
        expect.assertions(2);

        const plugin = nativeModulesPlugin(mockOptions);

        expect(plugin).toBeDefined();
        expect(plugin.name).toBe("native-modules");

        expectTypeOf(plugin).toHaveProperty("buildStart");
    });

    it("should create plugin with custom natives directory", () => {
        expect.assertions(2);

        const customOptions: NativeModulesOptions = {
            nativesDirectory: "custom-natives",
        };

        const plugin = nativeModulesPlugin(customOptions);

        expect(plugin).toBeDefined();
        expect(plugin.name).toBe("native-modules");
    });

    it("should have required plugin methods", () => {
        expect.assertions(5);

        const plugin = nativeModulesPlugin(mockOptions);

        expect(plugin.buildStart).toBeDefined();
        expect(plugin.options).toBeDefined();
        expect(plugin.resolveId).toBeDefined();
        expect(plugin.load).toBeDefined();
        expect(plugin.generateBundle).toBeDefined();
    });

    it("should not resolve non-.node files", async () => {
        expect.assertions(1);

        const plugin = nativeModulesPlugin(mockOptions);

        const result = await plugin.resolveId.call(
            {
                error: () => {},
                warn: () => {},
            },
            "test.js",
            "/test/source/file.js",
        );

        expect(result).toBeUndefined();
    });

    it("should not resolve files that start with prefix", async () => {
        expect.assertions(1);

        const plugin = nativeModulesPlugin(mockOptions);

        const result = await plugin.resolveId.call(
            {
                error: () => {},
                warn: () => {},
            },
            "\0natives:test.node",
            "/test/source/file.js",
        );

        expect(result).toBeUndefined();
    });

    it("should not load non-virtual modules", () => {
        expect.assertions(1);

        const plugin = nativeModulesPlugin(mockOptions);

        const result = plugin.load.call(
            {
                error: () => {},
                warn: () => {},
            },
            "not-a-virtual-module",
        );

        expect(result).toBeUndefined();
    });

    it("should handle empty generateBundle", async () => {
        expect.assertions(1);

        const plugin = nativeModulesPlugin(mockOptions);

        // This should not throw an error even with empty modulesToCopy
        await expect(
            plugin.generateBundle.call({
                error: () => {},
                warn: () => {},
            }),
        ).resolves.toBeUndefined();
    });

    it("should extract output directory from Rollup options", () => {
        expect.assertions(1);

        const plugin = nativeModulesPlugin(mockOptions);

        const result = plugin.options.call(
            {
                error: () => {},
                warn: () => {},
            },
            {
                output: {
                    dir: "/test/output",
                },
            },
        );

        expect(result).toStrictEqual({
            output: {
                dir: "/test/output",
            },
        });
    });
});
