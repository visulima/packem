import { describe, expect, it } from "vitest";

import { generateJsExports } from "../../../../src/utils/generate-js-exports";

describe(generateJsExports, () => {
    const baseOptions = {
        css: "body { color: red; }",
        id: "test.css",
        modulesExports: {},
        supportModules: false,
    };

    describe("basic functionality", () => {
        it("should generate basic JavaScript export", () => {
            expect.assertions(3);

            const result = generateJsExports(baseOptions);

            expect(result.code).toContain('var css = "body { color: red; }";');
            expect(result.code).toContain("export default css;");
            expect(result.moduleSideEffects).toBe("no-treeshake");
        });

        it("should handle emit mode", () => {
            expect.assertions(2);

            const result = generateJsExports({
                ...baseOptions,
                emit: true,
            });

            expect(result.code).toBe("body { color: red; }");
            expect(result.moduleSideEffects).toBe(true);
        });

        it("should handle TypeScript declarations", () => {
            expect.assertions(2);

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
            expect.assertions(2);

            const modulesExports = {
                button: "button_abc123",
                container: "container_def456",
            };

            const result = generateJsExports({
                ...baseOptions,
                modulesExports,
                supportModules: true,
            });

            expect(result.code).toContain('{"button":"button_abc123","container":"container_def456"}');
            expect(result.code).toContain("export default");
        });

        it("should handle CSS modules with TypeScript declarations", () => {
            expect.assertions(3);

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
            expect.assertions(4);

            const modulesExports = {
                button: "button_abc123",
            };

            const result = generateJsExports({
                ...baseOptions,
                modulesExports,
                namedExports: true,
            });

            expect(result.code).toContain('var button = "button_abc123";');
            expect(result.code).toContain("export {");
            expect(result.code).toContain("  css,");
            expect(result.code).toContain("  button");
        });

        it("should handle custom named export function", () => {
            expect.assertions(3);

            const modulesExports = {
                "my-button": "button_abc123",
            };

            const customNamedExports = (name: string) => name.replace("-", "_");

            const result = generateJsExports({
                ...baseOptions,
                modulesExports,
                namedExports: customNamedExports,
            });

            expect(result.code).toContain('var my_button = "button_abc123";');
            expect(result.code).toContain("export {");
            expect(result.code).toContain("  my_button");
        });

        it("should handle named exports with TypeScript declarations", () => {
            expect.assertions(3);

            const modulesExports = {
                button: "button_abc123",
            };

            const result = generateJsExports({
                ...baseOptions,
                dts: true,
                modulesExports,
                namedExports: true,
            });

            expect(result.types).toContain('declare const button: "button_abc123";');
            expect(result.types).toContain("export {");
            expect(result.types).toContain("  button");
        });
    });

    describe("cSS injection", () => {
        it("should handle basic injection", () => {
            expect.assertions(3);

            const result = generateJsExports({
                ...baseOptions,
                inject: true,
            });

            expect(result.code).toContain("import { cssStyleInject as");
            expect(result.code).toContain('from "@visulima/css-style-inject"');
            expect(result.code).toContain("(css,{});");
        });

        it("should handle injection with options", () => {
            expect.assertions(3);

            const result = generateJsExports({
                ...baseOptions,
                inject: { insertAt: "top" } as unknown as { container?: string },
            });

            expect(result.code).toContain("import { cssStyleInject as");
            expect(result.code).toContain('from "@visulima/css-style-inject"');
            expect(result.code).toContain('(css,{"insertAt":"top"});');
        });

        it("should handle treeshakeable injection", () => {
            expect.assertions(3);

            const result = generateJsExports({
                ...baseOptions,
                inject: { treeshakeable: true },
            });

            expect(result.code).toContain("var injected = false;");
            expect(result.code).toContain("if (!injected) { injected = true;");
            expect(result.moduleSideEffects).toBe(false);
        });

        it("should handle custom injection function", () => {
            expect.assertions(1);

            const customInject = (varname: string, id: string, _output: string[]) => `console.log("Injecting ${varname} from ${id}");`;

            const result = generateJsExports({
                ...baseOptions,
                inject: customInject,
            });

            expect(result.code).toContain('console.log("Injecting css from test.css");');
        });
    });

    describe("edge cases", () => {
        it("should handle CSS with special characters", () => {
            expect.assertions(1);

            const cssWithSpecialChars = String.raw`body { content: "Hello \"World\""; }`;
            const result = generateJsExports({
                ...baseOptions,
                css: cssWithSpecialChars,
            });

            expect(result.code).toContain(String.raw`var css = "body { content: \"Hello \\\"World\\\"\"; }";`);
        });

        it("should handle CSS with newlines", () => {
            expect.assertions(3);

            const cssWithNewlines = `body {
                color: red;
            }`;
            const result = generateJsExports({
                ...baseOptions,
                css: cssWithNewlines,
            });

            expect(result.code).toContain('var css = "body {');
            expect(result.code).toContain("color: red;");
            expect(result.code).toContain('}";');
        });

        it("should handle reserved JavaScript keywords", () => {
            expect.assertions(1);

            const modulesExports = {
                css: "css_abc123", // 'css' is a reserved word
            };

            const result = generateJsExports({
                ...baseOptions,
                modulesExports,
                namedExports: true,
            });

            expect(result.code).toContain('var _css = "css_abc123";');
        });
    });

    describe("inline mode", () => {
        it("should produce treeshakeable output (moduleSideEffects: false) instead of no-treeshake", () => {
            expect.assertions(2);

            const result = generateJsExports({
                ...baseOptions,
                inline: true,
            });

            expect(result.moduleSideEffects).toBe(false);
            expect(result.code).toContain("export default css;");
        });
    });

    describe("declaration files", () => {
        it("should declare `css` for plain CSS with dts and no namedExports", () => {
            expect.assertions(2);

            const result = generateJsExports({
                ...baseOptions,
                dts: true,
            });

            // The default export references `css`, so the .d.ts must declare it
            // (regression: previously only declared under `namedExports`).
            expect(result.types).toContain("declare const css: string;");
            expect(result.types).toContain("export default css;");
        });

        it("should escape CSS-module class names that are not valid bare property names", () => {
            expect.assertions(2);

            const modulesExports = {
                "weird'name": "weird_abc123",
            };

            const result = generateJsExports({
                ...baseOptions,
                dts: true,
                modulesExports,
                supportModules: true,
            });

            // The embedded single quote is backslash-escaped so the single-quoted
            // property key stays valid in the generated .d.ts.
            expect(result.types).toContain(String.raw`'weird\'name': string;`);
            expect(result.types).not.toContain("'weird'name'");
        });
    });

    describe("inject validation", () => {
        it("should throw for an invalid inject.method identifier", () => {
            expect.assertions(1);

            expect(() => {
                generateJsExports({
                    ...baseOptions,
                    inject: { method: "not a valid identifier" },
                });
            }).toThrow("`inject.method` must be a valid JavaScript identifier");
        });

        it("should throw for an empty inject.package", () => {
            expect.assertions(1);

            expect(() => {
                generateJsExports({
                    ...baseOptions,
                    inject: { package: "  " },
                });
            }).toThrow("`inject.package` must be a non-empty string");
        });
    });

    describe("error handling", () => {
        it("should throw error for reserved 'inject' keyword with treeshakeable", () => {
            expect.assertions(1);

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
