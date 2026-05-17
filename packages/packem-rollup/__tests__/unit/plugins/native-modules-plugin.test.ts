import type { ObjectHook, Plugin } from "rollup";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { NativeModulesOptions } from "../../../src/plugins/native-modules-plugin";
import { nativeModulesPlugin } from "../../../src/plugins/native-modules-plugin";

type HookFor<K extends keyof Plugin> = NonNullable<Plugin[K]>;
type HandlerOf<H> = H extends ObjectHook<infer Handler> ? Handler : H;

const getHandler = <K extends keyof Plugin>(plugin: Plugin, key: K): HandlerOf<HookFor<K>> => {
    const hook = plugin[key];

    if (typeof hook === "function") {
        return hook;
    }

    if (hook && typeof hook === "object" && "handler" in hook && typeof hook.handler === "function") {
        return hook.handler as HandlerOf<HookFor<K>>;
    }

    throw new TypeError(`plugin.${key} is not callable`);
};

const mockContext = {
    error: () => {},
    warn: () => {},
};

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
        const handler = getHandler(plugin, "resolveId");

        type Context = ThisParameterType<typeof handler>;

        const result = await handler.call(mockContext as unknown as Context, "test.js", "/test/source/file.js", { attributes: {}, isEntry: false });

        expect(result).toBeUndefined();
    });

    it("should not resolve files that start with prefix", async () => {
        expect.assertions(1);

        const plugin = nativeModulesPlugin(mockOptions);
        const handler = getHandler(plugin, "resolveId");

        type Context = ThisParameterType<typeof handler>;

        const result = await handler.call(mockContext as unknown as Context, "\0natives:test.node", "/test/source/file.js", { attributes: {}, isEntry: false });

        expect(result).toBeUndefined();
    });

    it("should not load non-virtual modules", () => {
        expect.assertions(1);

        const plugin = nativeModulesPlugin(mockOptions);
        const handler = getHandler(plugin, "load");

        type Context = ThisParameterType<typeof handler>;

        const result = handler.call(mockContext as unknown as Context, "not-a-virtual-module");

        expect(result).toBeUndefined();
    });

    it("should handle empty generateBundle", async () => {
        expect.assertions(1);

        const plugin = nativeModulesPlugin(mockOptions);
        const handler = getHandler(plugin, "generateBundle");

        type Context = ThisParameterType<typeof handler>;
        type GenerateBundleArguments = Parameters<typeof handler>;

        // This should not throw an error even with empty modulesToCopy
        await expect(handler.call(mockContext as unknown as Context, ...([{}, {}, true] as unknown as GenerateBundleArguments))).resolves.toBeUndefined();
    });

    it("should extract output directory from Rollup options", () => {
        expect.assertions(1);

        const plugin = nativeModulesPlugin(mockOptions);
        const handler = getHandler(plugin, "options");

        type Context = ThisParameterType<typeof handler>;

        const result = handler.call(
            mockContext as unknown as Context,
            {
                output: {
                    dir: "/test/output",
                },
            } as Parameters<typeof handler>[0],
        );

        expect(result).toStrictEqual({
            output: {
                dir: "/test/output",
            },
        });
    });
});
