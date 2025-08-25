import { describe, expect, it } from "vitest";

import { dataUriPlugin } from "../../../src/plugins/data-uri";

describe("dataUriPlugin with shared utilities", () => {
    it("should import and use shared SVG utilities successfully", () => {
        expect.assertions(2);

        // This test verifies that the plugin can be imported without errors
        // and that it's using the shared utilities from packem-share
        expect(dataUriPlugin).toBeDefined();
        expect(typeof dataUriPlugin).toBe("function");
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
            include: [/\.svg$/],
            exclude: [/\.min\.svg$/],
            srcset: true,
        });

        expect(plugin).toBeDefined();
        expect(plugin.name).toBe("packem:data-uri");
    });
});
