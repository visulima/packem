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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resolveIdHook = plugin.resolveId as any;
        const handler = typeof resolveIdHook === "function" ? resolveIdHook : resolveIdHook?.handler;
        const result = await handler?.call(
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resolveIdHook = plugin.resolveId as any;
        const handler = typeof resolveIdHook === "function" ? resolveIdHook : resolveIdHook?.handler;
        const result = await handler?.call(
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loadHook = plugin.load as any;
        const handler = typeof loadHook === "function" ? loadHook : loadHook?.handler;
        const result = handler?.call(
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const generateBundleHook = plugin.generateBundle as any;
        const handler = typeof generateBundleHook === "function" ? generateBundleHook : generateBundleHook?.handler;

        // This should not throw an error even with empty modulesToCopy
        await expect(
            handler?.call({
                error: () => {},
                warn: () => {},
            }),
        ).resolves.toBeUndefined();
    });

    it("should extract output directory from Rollup options", () => {
        expect.assertions(1);

        const plugin = nativeModulesPlugin(mockOptions);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const optionsHook = plugin.options as any;
        const handler = typeof optionsHook === "function" ? optionsHook : optionsHook?.handler;
        const result = handler?.call(
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
