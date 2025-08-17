import { describe, expect, it } from "vitest";

import { generateJsExports } from "../../../../src/utils/generate-js-exports";

describe(generateJsExports, () => {
    const baseOptions = {
        css: "body { color: red; }",
        id: "test.css",
        modulesExports: {},
        supportModules: false,
    };

    describe("cSS comment removal", () => {
        it("should remove single-line CSS comments", () => {
            const cssWithComments = "/* This is a comment */ body { color: red; }";
            const result = generateJsExports({
                ...baseOptions,
                css: cssWithComments,
            });

            expect(result.code).toContain("var css = \" body { color: red; }\";");
            expect(result.code).not.toContain("/* This is a comment */");
        });

        it("should remove multi-line CSS comments", () => {
            const cssWithComments = `/* This is a
                multi-line comment */ body { color: red; }`;
            const result = generateJsExports({
                ...baseOptions,
                css: cssWithComments,
            });

            expect(result.code).toContain("var css = \" body { color: red; }\";");
            expect(result.code).not.toContain("/* This is a");
            expect(result.code).not.toContain("multi-line comment */");
        });

        it("should remove inline CSS comments", () => {
            const cssWithComments = "body { color: red; /* inline comment */ }";
            const result = generateJsExports({
                ...baseOptions,
                css: cssWithComments,
            });

            expect(result.code).toContain("var css = \"body { color: red;  }\";");
            expect(result.code).not.toContain("/* inline comment */");
        });

        it("should handle CSS with multiple comments", () => {
            const cssWithComments = `/* Header comment */
                body { color: red; /* inline comment */ }
                /* Footer comment */`;
            const result = generateJsExports({
                ...baseOptions,
                css: cssWithComments,
            });

            expect(result.code).toContain("var css = \"");
            expect(result.code).toContain("body { color: red;  }");
            expect(result.code).not.toContain("/* Header comment */");
            expect(result.code).not.toContain("/* inline comment */");
            expect(result.code).not.toContain("/* Footer comment */");
        });

        it("should handle CSS with no comments", () => {
            const cssWithoutComments = "body { color: red; }";
            const result = generateJsExports({
                ...baseOptions,
                css: cssWithoutComments,
            });

            expect(result.code).toContain("var css = \"body { color: red; }\";");
        });

        it("should handle empty CSS", () => {
            const result = generateJsExports({
                ...baseOptions,
                css: "",
            });

            expect(result.code).toContain("var css = \"\";");
        });

        it("should handle CSS with only comments", () => {
            const cssWithOnlyComments = "/* Only comment */";
            const result = generateJsExports({
                ...baseOptions,
                css: cssWithOnlyComments,
            });

            expect(result.code).toContain("var css = \"\";");
        });
    });

    describe("basic functionality", () => {
        it("should generate basic JavaScript export", () => {
            const result = generateJsExports(baseOptions);

            expect(result.code).toContain("var css = \"body { color: red; }\";");
            expect(result.code).toContain("export default css;");
            expect(result.moduleSideEffects).toBe("no-treeshake");
        });

        it("should handle emit mode", () => {
            const result = generateJsExports({
                ...baseOptions,
                emit: true,
            });

            expect(result.code).toBe("body { color: red; }");
            expect(result.moduleSideEffects).toBe(true);
        });

        it("should handle TypeScript declarations", () => {
            const result = generateJsExports({
                ...baseOptions,
                dts: true,
                namedExports: true,
            });

            expect(result.types).toContain("declare const css: string;");
            expect(result.types).toContain("export default css;");
        });
    });

    describe("cSS modules support", () => {
        it("should handle CSS modules exports", () => {
            const modulesExports = {
                button: "button_abc123",
                container: "container_def456",
            };

            const result = generateJsExports({
                ...baseOptions,
                modulesExports,
                supportModules: true,
            });

            expect(result.code).toContain("{\"button\":\"button_abc123\",\"container\":\"container_def456\"}");
            expect(result.code).toContain("export default");
        });

        it("should handle CSS modules with TypeScript declarations", () => {
            const modulesExports = {
                button: "button_abc123",
            };

            const result = generateJsExports({
                ...baseOptions,
                dts: true,
                modulesExports,
                supportModules: true,
            });

            expect(result.types).toContain("interface ModulesExports");
            expect(result.types).toContain("'button': string;");
            expect(result.types).toContain("declare const");
        });
    });

    describe("named exports", () => {
        it("should generate named exports when enabled", () => {
            const modulesExports = {
                button: "button_abc123",
            };

            const result = generateJsExports({
                ...baseOptions,
                modulesExports,
                namedExports: true,
            });

            expect(result.code).toContain("var button = \"button_abc123\";");
            expect(result.code).toContain("export {");
            expect(result.code).toContain("  css,");
            expect(result.code).toContain("  button");
        });

        it("should handle custom named export function", () => {
            const modulesExports = {
                "my-button": "button_abc123",
            };

            const customNamedExports = (name: string) => name.replace("-", "_");

            const result = generateJsExports({
                ...baseOptions,
                modulesExports,
                namedExports: customNamedExports,
            });

            expect(result.code).toContain("var my_button = \"button_abc123\";");
            expect(result.code).toContain("export {");
            expect(result.code).toContain("  my_button");
        });

        it("should handle named exports with TypeScript declarations", () => {
            const modulesExports = {
                button: "button_abc123",
            };

            const result = generateJsExports({
                ...baseOptions,
                dts: true,
                modulesExports,
                namedExports: true,
            });

            expect(result.types).toContain("declare const button: \"button_abc123\";");
            expect(result.types).toContain("export {");
            expect(result.types).toContain("  button");
        });
    });

    describe("cSS injection", () => {
        it("should handle basic injection", () => {
            const result = generateJsExports({
                ...baseOptions,
                inject: true,
            });

            expect(result.code).toContain("import { cssStyleInject as");
            expect(result.code).toContain("from \"@visulima/css-style-inject\"");
            expect(result.code).toContain("(css,{});");
        });

        it("should handle injection with options", () => {
            const result = generateJsExports({
                ...baseOptions,
                inject: { insertAt: "top" },
            });

            expect(result.code).toContain("import { cssStyleInject as");
            expect(result.code).toContain("from \"@visulima/css-style-inject\"");
            expect(result.code).toContain("(css,{\"insertAt\":\"top\"});");
        });

        it("should handle treeshakeable injection", () => {
            const result = generateJsExports({
                ...baseOptions,
                inject: { treeshakeable: true },
            });

            expect(result.code).toContain("var injected = false;");
            expect(result.code).toContain("if (!injected) { injected = true;");
            expect(result.moduleSideEffects).toBe(false);
        });

        it("should handle custom injection function", () => {
            const customInject = (varname: string, id: string, output: string[]) =>
                `console.log("Injecting ${varname} from ${id}");`;

            const result = generateJsExports({
                ...baseOptions,
                inject: customInject,
            });

            expect(result.code).toContain("console.log(\"Injecting css from test.css\");");
        });
    });

    describe("edge cases", () => {
        it("should handle CSS with special characters", () => {
            const cssWithSpecialChars = String.raw`body { content: "Hello \"World\""; }`;
            const result = generateJsExports({
                ...baseOptions,
                css: cssWithSpecialChars,
            });

            expect(result.code).toContain(String.raw`var css = "body { content: \"Hello \\\"World\\\"\"; }";`);
        });

        it("should handle CSS with newlines", () => {
            const cssWithNewlines = `body {
                color: red;
            }`;
            const result = generateJsExports({
                ...baseOptions,
                css: cssWithNewlines,
            });

            expect(result.code).toContain("var css = \"body {");
            expect(result.code).toContain("color: red;");
            expect(result.code).toContain("}\";");
        });

        it("should handle reserved JavaScript keywords", () => {
            const modulesExports = {
                css: "css_abc123", // 'css' is a reserved word
            };

            const result = generateJsExports({
                ...baseOptions,
                modulesExports,
                namedExports: true,
            });

            expect(result.code).toContain("var _css = \"css_abc123\";");
        });
    });

    describe("error handling", () => {
        it("should throw error for reserved 'inject' keyword with treeshakeable", () => {
            const modulesExports = {
                inject: "inject_abc123",
            };

            expect(() => {
                generateJsExports({
                    ...baseOptions,
                    inject: { treeshakeable: true },
                    modulesExports,
                    supportModules: true,
                });
            }).toThrow("`inject` keyword is reserved when using `inject.treeshakeable` option");
        });
    });
});
