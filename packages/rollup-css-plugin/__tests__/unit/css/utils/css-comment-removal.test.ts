import { describe, expect, it } from "vitest";

import { generateJsExports } from "../../../../src/utils/generate-js-exports";

describe("cSS Comment Removal Integration", () => {
    it("should remove CSS comments when generating JavaScript exports", () => {
        const cssWithComments = `/* Header comment */
            body {
                color: red; /* inline comment */
                background: blue; /* another inline comment */
            }
            /* Footer comment */`;

        const result = generateJsExports({
            css: cssWithComments,
            id: "test.css",
            modulesExports: {},
            supportModules: false,
        });

        // Verify that CSS comments are removed
        expect(result.code).not.toContain("/* Header comment */");
        expect(result.code).not.toContain("/* inline comment */");
        expect(result.code).not.toContain("/* another inline comment */");
        expect(result.code).not.toContain("/* Footer comment */");

        // Verify that the actual CSS content is preserved
        expect(result.code).toContain("color: red;");
        expect(result.code).toContain("background: blue;");
        expect(result.code).toContain("body {");

        // Verify the output is valid JavaScript
        expect(result.code).toContain("var css = \"");
        expect(result.code).toContain("export default css;");
    });

    it("should handle CSS with no comments correctly", () => {
        const cssWithoutComments = `body {
            color: red;
            background: blue;
        }`;

        const result = generateJsExports({
            css: cssWithoutComments,
            id: "test.css",
            modulesExports: {},
            supportModules: false,
        });

        // Verify that the CSS content is preserved exactly
        expect(result.code).toContain("color: red;");
        expect(result.code).toContain("background: blue;");
        expect(result.code).toContain("body {");
    });

    it("should handle CSS with only comments", () => {
        const cssWithOnlyComments = `/* Only comment here */`;

        const result = generateJsExports({
            css: cssWithOnlyComments,
            id: "test.css",
            modulesExports: {},
            supportModules: false,
        });

        // Verify that comments are removed and empty string is generated
        expect(result.code).toContain("var css = \"\";");
        expect(result.code).not.toContain("/* Only comment here */");
    });
});
