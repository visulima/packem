import { describe, expect, expectTypeOf, it } from "vitest";
import { nativeModules, type NativeModulesOptions } from "../../../src/plugins/native-modules";

describe("nativeModules plugin", () => {
    const mockOptions: NativeModulesOptions = {
        nativesDirectory: "natives",
    };

    it("should be defined and be a function", () => {
        expect.assertions(1);

        expect(nativeModules).toBeDefined();
        expectTypeOf(nativeModules).toBeFunction();
    });

    it("should create plugin with default options", () => {
        expect.assertions(2);

        const plugin = nativeModules(mockOptions);

        expect(plugin).toBeDefined();
        expect(plugin.name).toBe("native-modules");
        expectTypeOf(plugin).toHaveProperty("buildStart");
    });

    it("should create plugin with custom natives directory", () => {
        expect.assertions(2);

        const customOptions: NativeModulesOptions = {
            nativesDirectory: "custom-natives",
        };

        const plugin = nativeModules(customOptions);

        expect(plugin).toBeDefined();
        expect(plugin.name).toBe("native-modules");
    });

    it("should have required plugin methods", () => {
        expect.assertions(5);

        const plugin = nativeModules(mockOptions);

        expect(plugin.buildStart).toBeDefined();
        expect(plugin.options).toBeDefined();
        expect(plugin.resolveId).toBeDefined();
        expect(plugin.load).toBeDefined();
        expect(plugin.generateBundle).toBeDefined();
    });

    it("should not resolve non-.node files", async () => {
        expect.assertions(1);

        const plugin = nativeModules(mockOptions);

        if (plugin.resolveId) {
            const result = await plugin.resolveId.call({
                warn: () => {},
                error: () => {},
            }, "test.js", "/test/source/file.js");

            expect(result).toBeNull();
        }
    });

    it("should not resolve files that start with prefix", async () => {
        expect.assertions(1);

        const plugin = nativeModules(mockOptions);

        if (plugin.resolveId) {
            const result = await plugin.resolveId.call({
                warn: () => {},
                error: () => {},
            }, "\0natives:test.node", "/test/source/file.js");

            expect(result).toBeNull();
        }
    });

    it("should not load non-virtual modules", () => {
        expect.assertions(1);

        const plugin = nativeModules(mockOptions);

        if (plugin.load) {
            const result = plugin.load.call({
                warn: () => {},
                error: () => {},
            }, "not-a-virtual-module");

            expect(result).toBeNull();
        }
    });

    it("should handle empty generateBundle", async () => {
        expect.assertions(1);

        const plugin = nativeModules(mockOptions);

        if (plugin.generateBundle) {
            // This should not throw an error even with empty modulesToCopy
            await expect(plugin.generateBundle.call({
                warn: () => {},
                error: () => {},
            })).resolves.toBeUndefined();
        }
    });

    it("should extract output directory from Rollup options", () => {
        expect.assertions(1);

        const plugin = nativeModules(mockOptions);

        if (plugin.options) {
            const result = plugin.options.call({
                warn: () => {},
                error: () => {},
            }, {
                output: {
                    dir: "/test/output"
                }
            });

            expect(result).toBeNull();
        }
    });
});