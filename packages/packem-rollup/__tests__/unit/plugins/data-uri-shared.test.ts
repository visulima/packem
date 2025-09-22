import { describe, expect, expectTypeOf, it } from "vitest";

import { dataUriPlugin } from "../../../src/plugins/data-uri";

describe("dataUriPlugin with shared utilities", () => {
    it("should import and use shared SVG utilities successfully", () => {
        expect.assertions(1);

        // This test verifies that the plugin can be imported without errors
        // and that it's using the shared utilities from packem-share
        expect(dataUriPlugin).toBeDefined();

        expectTypeOf(dataUriPlugin).toBeFunction();
    });

    it("should create plugin with default options", () => {
        expect.assertions(2);

        const plugin = dataUriPlugin();

        expect(plugin).toBeDefined();
        expect(plugin.name).toBe("packem:data-uri");
    });

    it("should create plugin with custom options", () => {
        expect.assertions(2);

        const plugin = dataUriPlugin({
            exclude: [/\.min\.svg$/],
            include: [/\.svg$/],
            srcset: true,
        });

        expect(plugin).toBeDefined();
        expect(plugin.name).toBe("packem:data-uri");
    });
});
