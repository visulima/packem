/* eslint-disable perfectionist/sort-objects */
import type { BuildContext } from "@visulima/packem-share/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import validatePackageFields from "../../../../src/validator/package-json/validate-package-fields";

const { mockedWarn } = vi.hoisted(() => {
    return {
        mockedWarn: vi.fn(),
    };
});

// Mock the warn function
vi.mock("@visulima/packem-share/utils", () => {
    return {
        warn: mockedWarn,
    };
});

describe(validatePackageFields, () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("should not warn if \"files\" field is missing in package.json when validation is enabled", () => {
        expect.assertions(1);

        const context = {
            options: { outDir: "dist", validation: { packageJson: { files: true } } },
            pkg: {},
        };

        validatePackageFields(context as unknown as BuildContext);

        expect(mockedWarn).not.toHaveBeenCalledWith(context, "The 'files' field is missing in your package.json. Add the files to be included in the package.");
    });

    it("should warn if \"main\" field is missing in package.json for CJS packages", () => {
        expect.assertions(1);

        const context = {
            options: { validation: { packageJson: { main: true } } },
            pkg: { type: "commonjs" },
        };

        validatePackageFields(context as unknown as BuildContext);

        expect(mockedWarn).toHaveBeenCalledWith(context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
    });

    it("should warn if \"exports\" field is missing in package.json for ESM packages when emitCJS is false", () => {
        expect.assertions(1);

        const context = {
            options: { emitCJS: false, validation: { packageJson: { exports: true } } },
            pkg: { type: "module" },
        };

        validatePackageFields(context as unknown as BuildContext);

        expect(mockedWarn).toHaveBeenCalledWith(context, "The 'exports' field is missing in your package.json. Define module exports explicitly.");
    });

    it("should warn if \"types\" field is missing in package.json when declaration is enabled", () => {
        expect.assertions(1);

        const context = {
            options: { declaration: true, outDir: "dist", validation: { packageJson: { types: true } } },
            pkg: {
                files: ["dist"],
                main: "dist/index.cjs",
                name: "test",
            },
        };

        validatePackageFields(context as unknown as BuildContext);

        expect(mockedWarn).toHaveBeenCalledWith(context, "The 'types' field is missing in your package.json. This field should point to your type definitions file.");
    });

    it("should handle empty \"files\" array in package.json", () => {
        expect.assertions(1);

        const context = {
            options: { outDir: "dist", validation: { packageJson: { files: true } } },
            pkg: { files: [] },
        };

        validatePackageFields(context as unknown as BuildContext);

        expect(mockedWarn).toHaveBeenCalledWith(context, "The 'files' field in your package.json is empty. Please specify the files to be included in the package.");
    });

    it("should handle \"bin\" field as both string and object in package.json", () => {
        expect.assertions(2);

        const contextStringBin = {
            options: { 
                emitCJS: true, 
                emitESM: true, 
                declaration: "compatible" as const,
                validation: { packageJson: { bin: true } } 
            },
            pkg: { bin: "bin/index.mjs", type: "commonjs" },
        };
        const contextObjectBin = {
            options: { 
                emitCJS: true, 
                emitESM: true, 
                declaration: "compatible" as const,
                validation: { packageJson: { bin: true } } 
            },
            pkg: { bin: { cli1: "bin/cli1.mjs", cli2: "bin/cli2.cjs" }, type: "commonjs" },
        };

        validatePackageFields(contextStringBin as BuildContext);

        expect(mockedWarn).toHaveBeenCalledWith(contextStringBin, "The 'bin' field in your package.json should not use a .mjs extension for CommonJS binaries.");

        validatePackageFields(contextObjectBin as unknown as BuildContext);

        expect(mockedWarn).toHaveBeenCalledWith(contextObjectBin, "The 'bin.cli1' field in your package.json should not use a .mjs extension for CommonJS binaries.");
    });

    it("should handle 'name' field in package.json", () => {
        expect.assertions(1);

        const context = {
            options: { validation: { packageJson: { name: true } } },
            pkg: {},
        };

        validatePackageFields(context as unknown as BuildContext);

        expect(mockedWarn).toHaveBeenCalledWith(context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
    });

    it("should not display a error if the pkg is module and has no cjs files", () => {
        expect.assertions(1);

        const context = {
            options: { declaration: true, outDir: "dist", validation: false },
            pkg: {
                exports: {
                    ".": {
                        default: "./dist/test.mjs",
                        types: "./dist/test.d.ts",
                    },
                },
                files: ["dist"],
                name: "test",
                type: "module",
            },
        };

        validatePackageFields(context as unknown as BuildContext);

        expect(mockedWarn).not.toHaveBeenCalled();
    });

    // New tests for exports validation
    describe("exports validation", () => {
        it("should accept valid string exports", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: { exports: "./dist/index.js" },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should warn on invalid exports path not starting with './'", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: { exports: "dist/index.js" },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Invalid exports path \"dist/index.js\" at exports. Export paths must start with \"./\"");
        });

        it("should warn on exports path containing '../'", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: { exports: "./../unsafe/path.js" },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Invalid exports path \"./../unsafe/path.js\" at exports. Export paths should not contain \"../\" for security reasons");
        });

        it("should warn on exports path with invalid file extension", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: { exports: "./dist/index.xyz" },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Export path \"./dist/index.xyz\" at exports should have a valid file extension (.js, .mjs, .cjs, .ts, .mts, .cts, .d.ts, .d.mts, .d.cts, .jsx, .tsx, .json, .node)");
        });

        it("should accept exports path with .node extension", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: { exports: "./dist/native.node" },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should accept exports path with .jsx extension", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: { exports: "./dist/component.jsx" },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should accept exports path with .tsx extension", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: { exports: "./dist/component.tsx" },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should accept valid conditional exports", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: {
                    exports: {
                        import: "./dist/index.mjs",
                        require: "./dist/index.cjs",
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should accept valid subpath exports", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: {
                    exports: {
                        ".": "./dist/index.js",
                        "./utils": "./dist/utils.js",
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should warn on empty exports object", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: { exports: {} },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Empty exports object. Define at least one export entry");
        });

        it("should warn on mixed subpaths and conditions", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: {
                    exports: {
                        ".": "./dist/index.js",
                        import: "./dist/index.mjs",
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Mixed subpaths and conditions in exports object. Use either subpaths (keys starting with \".\") or conditions, not both");
        });

        it("should warn on missing main export in subpaths", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: {
                    exports: {
                        "./utils": "./dist/utils.js",
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Missing main export \".\". Subpaths exports should include a main export entry");
        });

        it("should warn on invalid subpath format", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: {
                    exports: {
                        ".invalid": "./dist/invalid.js",
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Invalid subpath \".invalid\". Subpaths should start with \"./\" or be exactly \".\"");
        });

        it("should warn on multiple wildcards in subpath pattern", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: {
                    exports: {
                        ".": "./dist/index.js",
                        "./*/*.js": "./dist/*/*.js",
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Invalid subpath pattern \"./*/*.js\". Only one \"*\" wildcard is allowed per subpath");
        });

        it("should warn on unknown export conditions", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: {
                    exports: {
                        "custom-unknown": "./dist/custom.js",
                        default: "./dist/index.js",
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Unknown export conditions [custom-unknown] at exports. Consider using standard conditions (default, import, module-sync, node, node-addons, require) or add custom conditions using the 'extraConditions' option in your validation config.");
        });

        it("should warn on conflicting development and production conditions", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: {
                    exports: {
                        development: "./dist/dev.js",
                        production: "./dist/prod.js",
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Conflicting conditions \"development\" and \"production\" at exports. These conditions are mutually exclusive");
        });

        it("should accept null values to block subpaths", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: {
                    exports: {
                        ".": "./dist/index.js",
                        // eslint-disable-next-line unicorn/no-null
                        "./internal": null,
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should handle fallback arrays", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: {
                    exports: ["./dist/modern.js", "./dist/fallback.js"],
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should warn on empty fallback arrays", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: {
                    exports: {
                        ".": [],
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Empty fallback array at exports[\".\"]. Fallback arrays should contain at least one entry");
        });

        it("should warn on empty conditions object", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: {
                    exports: {
                        ".": {},
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Empty conditions object at exports[\".\"]. Conditional exports should define at least one condition");
        });

        it("should warn on invalid exports value type", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: {
                    exports: {
                        ".": 123,
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Invalid exports value type at exports[\".\"]. Expected string, array, object, or null");
        });

        it("should accept all standard Node.js conditions", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: {
                    exports: {
                        "node-addons": "./dist/addons.js",
                        node: "./dist/node.js",
                        import: "./dist/esm.mjs",
                        require: "./dist/cjs.cjs",
                        "module-sync": "./dist/sync.js",
                        default: "./dist/default.js",
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should accept all community conditions", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: {
                    exports: {
                        browser: "./dist/browser.js",
                        bun: "./dist/bun.js",
                        default: "./dist/default.js",
                        deno: "./dist/deno.js",
                        development: "./dist/dev.js",
                        "edge-light": "./dist/edge.js",
                        electron: "./dist/electron.js",
                        "react-native": "./dist/rn.js",
                        "react-server": "./dist/server.js",
                        types: "./dist/index.d.ts",
                        workerd: "./dist/workerd.js",
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should skip validation when exports validation is disabled", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: false, main: false, name: false } } },
                pkg: { exports: "invalid-path" },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should handle nested conditional exports", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: {
                    exports: {
                        ".": {
                            node: {
                                import: "./dist/node.mjs",
                                require: "./dist/node.cjs",
                            },
                            default: "./dist/default.js",
                        },
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should validate complex real-world exports configuration", () => {
            expect.assertions(1);

            const context = {
                options: { validation: { packageJson: { exports: true, main: false, name: false } } },
                pkg: {
                    exports: {
                        ".": {
                            import: "./dist/index.mjs",
                            require: "./dist/index.cjs",
                            types: "./dist/index.d.ts",
                        },
                        "./package.json": "./package.json",
                        "./utils": {
                            import: "./dist/utils.mjs",
                            require: "./dist/utils.cjs",
                            types: "./dist/utils.d.ts",
                        },
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should accept custom conditions when included in extraConditions", () => {
            expect.assertions(1);

            const context = {
                options: {
                    validation: {
                        packageJson: {
                            exports: true,
                            main: false,
                            name: false,
                            extraConditions: ["custom-bundler", "my-framework"],
                        },
                    },
                },
                pkg: {
                    exports: {
                        "custom-bundler": "./dist/custom.js",
                        "my-framework": "./dist/framework.js",
                        default: "./dist/index.js",
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should warn on unknown conditions even when extraConditions is provided", () => {
            expect.assertions(1);

            const context = {
                options: {
                    validation: {
                        packageJson: {
                            exports: true,
                            extraConditions: ["known-custom"],
                        },
                    },
                },
                pkg: {
                    exports: {
                        "known-custom": "./dist/known.js",
                        "unknown-custom": "./dist/unknown.js",
                        default: "./dist/index.js",
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Unknown export conditions [unknown-custom] at exports. Consider using standard conditions (default, import, module-sync, node, node-addons, require) or add custom conditions to 'validation.packageJson.extraConditions' in your packem config.");
        });

        it("should handle empty extraConditions array", () => {
            expect.assertions(1);

            const context = {
                options: {
                    validation: {
                        packageJson: {
                            exports: true,
                            main: false,
                            name: false,
                            extraConditions: [],
                        },
                    },
                },
                pkg: {
                    exports: {
                        import: "./dist/index.mjs",
                        require: "./dist/index.cjs",
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should provide helpful message about extraConditions when no extraConditions are configured", () => {
            expect.assertions(1);

            const context = {
                options: {
                    validation: {
                        packageJson: {
                            exports: true,
                            main: false,
                            name: false,
                        },
                    },
                },
                pkg: {
                    exports: {
                        "custom-condition": "./dist/custom.js",
                        default: "./dist/index.js",
                    },
                },
            };

            validatePackageFields(context as unknown as BuildContext);

            expect(mockedWarn).toHaveBeenCalledWith(context, "Unknown export conditions [custom-condition] at exports. Consider using standard conditions (default, import, module-sync, node, node-addons, require) or add custom conditions using the 'extraConditions' option in your validation config.");
        });
    });
});
