import type { BuildContext } from "@visulima/packem-share/types";
import type { warn } from "@visulima/packem-share/utils";
// eslint-disable-next-line e18e/ban-dependencies -- tempy is core test-runner infra; fs.mkdtemp migration tracked separately
import { temporaryDirectory } from "tempy";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InternalBuildOptions } from "../../../../src/types";
import validatePackageFields from "../../../../src/validator/package-json/validate-package-fields";

const { mockedWarn } = vi.hoisted(() => {
    return {
        mockedWarn: vi.fn<typeof warn>(),
    };
});

// Mock the warn function
vi.mock(import("@visulima/packem-share/utils"), async () => {
    const original = await vi.importActual("@visulima/packem-share/utils");

    return {
        ...original,
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
            options: {
                outDir: "dist",
                validation: { packageJson: { files: true } },
            },
            pkg: {
                sideEffects: false,
            },
        };

        validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

        expect(mockedWarn).not.toHaveBeenCalledWith(context, "The 'files' field is missing in your package.json. Add the files to be included in the package.");
    });

    it("should warn if \"main\" field is missing in package.json for CJS packages", () => {
        expect.assertions(3);

        const context = {
            options: { validation: { packageJson: { main: true } } },
            pkg: {
                sideEffects: false,
                type: "commonjs",
            },
        };

        validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

        expect(mockedWarn).toHaveBeenCalledTimes(2);
        expect(mockedWarn).toHaveBeenNthCalledWith(1, context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
        expect(mockedWarn).toHaveBeenNthCalledWith(
            2,
            context,
            "The 'main' field is missing in your package.json. This field should point to your main entry file.",
        );
    });

    it("should warn if \"exports\" field is missing in package.json for ESM packages when emitCJS is false", () => {
        expect.assertions(3);

        const context = {
            options: {
                emitCJS: false,
                validation: { packageJson: { exports: true } },
            },
            pkg: {
                sideEffects: false,
                type: "module",
            },
        };

        validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

        expect(mockedWarn).toHaveBeenCalledTimes(2);
        expect(mockedWarn).toHaveBeenNthCalledWith(1, context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
        expect(mockedWarn).toHaveBeenNthCalledWith(2, context, "The 'exports' field is missing in your package.json. Define module exports explicitly.");
    });

    it("should warn if \"types\" field is missing in package.json when declaration is enabled", () => {
        expect.assertions(3);

        const context = {
            options: {
                declaration: true,
                outDir: "dist",
                validation: { packageJson: { types: true } },
            },
            pkg: {
                files: ["dist"],
                main: "dist/index.cjs",
                name: "test",
                sideEffects: false,
            },
        };

        validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

        expect(mockedWarn).toHaveBeenCalledTimes(2);
        expect(mockedWarn).toHaveBeenNthCalledWith(
            1,
            context,
            "The 'types' field is missing in your package.json. This field should point to your type definitions file.",
        );
        expect(mockedWarn).toHaveBeenNthCalledWith(
            2,
            context,
            "No 'typesVersions' field found in your package.json. Consider adding this field, or change the declaration option to 'node16' or 'false'.",
        );
    });

    it("should handle empty \"files\" array in package.json", () => {
        expect.assertions(4);

        const context = {
            options: {
                outDir: "dist",
                validation: { packageJson: { files: true } },
            },
            pkg: {
                files: [],
                sideEffects: false,
            },
        };

        validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

        expect(mockedWarn).toHaveBeenCalledTimes(3);
        expect(mockedWarn).toHaveBeenNthCalledWith(1, context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
        expect(mockedWarn).toHaveBeenNthCalledWith(
            3,
            context,
            "The 'main' field is missing in your package.json. This field should point to your main entry file.",
        );
        expect(mockedWarn).toHaveBeenNthCalledWith(
            2,
            context,
            "The 'files' field in your package.json is empty. Please specify the files to be included in the package.",
        );
    });

    it("should handle \"bin\" field as both string and object in package.json", () => {
        expect.assertions(14);

        const contextStringBin = {
            options: {
                declaration: "compatible" as const,
                emitCJS: true,
                emitESM: true,
                validation: { packageJson: { bin: true } },
            },
            pkg: {
                bin: "bin/index.mjs",
                sideEffects: false,
                type: "commonjs",
            },
        };
        const contextObjectBin = {
            options: {
                declaration: "compatible" as const,
                emitCJS: true,
                emitESM: true,
                validation: { packageJson: { bin: true } },
            },
            pkg: {
                bin: { cli1: "bin/cli1.mjs", cli2: "bin/cli2.cjs" },
                sideEffects: false,
                type: "commonjs",
            },
        };

        validatePackageFields(contextStringBin as unknown as BuildContext<InternalBuildOptions>);

        expect(mockedWarn).toHaveBeenCalledTimes(6);
        expect(mockedWarn).toHaveBeenNthCalledWith(
            1,
            contextStringBin,
            "The 'name' field is missing in your package.json. Please provide a valid package name.",
        );
        expect(mockedWarn).toHaveBeenNthCalledWith(
            2,
            contextStringBin,
            "The 'main' field is missing in your package.json. This field should point to your main entry file.",
        );
        expect(mockedWarn).toHaveBeenNthCalledWith(3, contextStringBin, "The 'module' field is missing in your package.json, but you are emitting ES modules.");
        expect(mockedWarn).toHaveBeenNthCalledWith(
            4,
            contextStringBin,
            "The 'bin' field in your package.json should not use a .mjs extension for CommonJS binaries.",
        );
        expect(mockedWarn).toHaveBeenNthCalledWith(
            5,
            contextStringBin,
            "The 'types' field is missing in your package.json. This field should point to your type definitions file.",
        );
        expect(mockedWarn).toHaveBeenNthCalledWith(
            6,
            contextStringBin,
            "No 'typesVersions' field found in your package.json. Consider adding this field, or change the declaration option to 'node16' or 'false'.",
        );

        vi.resetAllMocks();

        validatePackageFields(contextObjectBin as unknown as BuildContext<InternalBuildOptions>);

        expect(mockedWarn).toHaveBeenCalledTimes(6);
        expect(mockedWarn).toHaveBeenNthCalledWith(
            1,
            contextObjectBin,
            "The 'name' field is missing in your package.json. Please provide a valid package name.",
        );
        expect(mockedWarn).toHaveBeenNthCalledWith(
            2,
            contextObjectBin,
            "The 'main' field is missing in your package.json. This field should point to your main entry file.",
        );
        expect(mockedWarn).toHaveBeenNthCalledWith(3, contextObjectBin, "The 'module' field is missing in your package.json, but you are emitting ES modules.");
        expect(mockedWarn).toHaveBeenNthCalledWith(
            4,
            contextObjectBin,
            "The 'bin.cli1' field in your package.json should not use a .mjs extension for CommonJS binaries.",
        );
        expect(mockedWarn).toHaveBeenNthCalledWith(
            5,
            contextObjectBin,
            "The 'types' field is missing in your package.json. This field should point to your type definitions file.",
        );
        expect(mockedWarn).toHaveBeenNthCalledWith(
            6,
            contextObjectBin,
            "No 'typesVersions' field found in your package.json. Consider adding this field, or change the declaration option to 'node16' or 'false'.",
        );
    });

    it("should handle 'name' field in package.json", () => {
        expect.assertions(3);

        const context = {
            options: { validation: { packageJson: { name: true } } },
            pkg: {
                sideEffects: false,
            },
        };

        validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

        expect(mockedWarn).toHaveBeenCalledTimes(2);
        expect(mockedWarn).toHaveBeenNthCalledWith(1, context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
        expect(mockedWarn).toHaveBeenNthCalledWith(
            2,
            context,
            "The 'main' field is missing in your package.json. This field should point to your main entry file.",
        );
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
                sideEffects: false,
                type: "module",
            },
        };

        validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

        expect(mockedWarn).not.toHaveBeenCalled();
    });

    it("should not warn about typesVersions if a module package uses the classic 'main' and 'types' keys", () => {
        expect.assertions(1);

        const context = {
            options: {
                declaration: true,
                outDir: "dist",
                validation: { packageJson: { exports: false, module: false, typesVersions: true } },
            },
            pkg: {
                files: ["dist"],
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
                name: "test",
                sideEffects: false,
                type: "module",
                types: "./dist/index.d.ts",
            },
        };

        validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

        expect(mockedWarn).not.toHaveBeenCalledWith(
            context,
            "No 'typesVersions' field found in your package.json. Consider adding this field, or change the declaration option to 'node16' or 'false'.",
        );
    });

    // New tests for exports validation
    describe("exports validation", () => {
        it("should accept valid string exports", () => {
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
                    exports: "./dist/index.js",
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should warn on invalid exports path not starting with './'", () => {
            expect.assertions(4);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: {
                    exports: "dist/index.js",
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledTimes(3);
            expect(mockedWarn).toHaveBeenNthCalledWith(1, context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
            expect(mockedWarn).toHaveBeenNthCalledWith(
                2,
                context,
                "The 'main' field is missing in your package.json. This field should point to your main entry file.",
            );
            expect(mockedWarn).toHaveBeenNthCalledWith(3, context, "Invalid exports path \"dist/index.js\" at exports. Export paths must start with \"./\"");
        });

        it("should warn on exports path containing '../'", () => {
            expect.assertions(4);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: {
                    exports: "./../unsafe/path.js",
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledTimes(3);
            expect(mockedWarn).toHaveBeenNthCalledWith(1, context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
            expect(mockedWarn).toHaveBeenNthCalledWith(
                2,
                context,
                "The 'main' field is missing in your package.json. This field should point to your main entry file.",
            );
            expect(mockedWarn).toHaveBeenNthCalledWith(
                3,
                context,
                "Invalid exports path \"./../unsafe/path.js\" at exports. Export paths should not contain \"../\" for security reasons",
            );
        });

        it("should warn on exports path with invalid file extension", () => {
            expect.assertions(4);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: {
                    exports: "./dist/index.xyz",
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledTimes(3);
            expect(mockedWarn).toHaveBeenNthCalledWith(1, context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
            expect(mockedWarn).toHaveBeenNthCalledWith(
                2,
                context,
                "The 'main' field is missing in your package.json. This field should point to your main entry file.",
            );
            expect(mockedWarn).toHaveBeenNthCalledWith(
                3,
                context,
                "Export path \"./dist/index.xyz\" at exports should have a valid file extension (.js, .mjs, .cjs, .ts, .mts, .cts, .d.ts, .d.mts, .d.cts, .jsx, .tsx, .json, .node)",
            );
        });

        it("should accept exports path with .node extension", () => {
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
                    exports: "./dist/native.node",
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should accept exports path with .jsx extension", () => {
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
                    exports: "./dist/component.jsx",
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should accept exports path with .tsx extension", () => {
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
                    exports: "./dist/component.tsx",
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should accept exports path with wildcard patterns", () => {
            expect.assertions(1);

            const context = {
                options: {
                    rootDir: "/test/project",
                    validation: {
                        packageJson: {
                            exports: true,
                            main: false,
                            name: false,
                        },
                    },
                },
                pkg: {
                    exports: "./dist/icons/*",
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should accept exports path with various dynamic patterns", () => {
            expect.assertions(1);

            const context = {
                options: {
                    rootDir: "/test/project",
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
                        ".": "./dist/index.js",
                        "./assets/*.png": "./dist/assets/**/*.png",
                        "./components/*.jsx": "./dist/components/**/*.jsx",
                        "./icons/*": "./dist/icons/*",
                        "./styles/*.css": "./dist/styles/*.css",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should handle glob patterns gracefully when no files are found", () => {
            expect.assertions(1);

            const context = {
                options: {
                    rootDir: "/test/project",
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
                        ".": "./dist/index.js",
                        "./icons/*": "./src/icons/*",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            // Should not warn when no files are found (this is acceptable for glob patterns)
            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should validate glob patterns and warn about invalid file extensions", async () => {
            expect.assertions(1);

            // Create temporary test files
            const fs = await import("node:fs/promises");
            const path = await import("node:path");

            const temporaryDirectoryPath = temporaryDirectory();
            const testDirectory = path.join(temporaryDirectoryPath, "src", "icons");

            await fs.mkdir(testDirectory, { recursive: true });

            // Create test files with different extensions
            await fs.writeFile(path.join(testDirectory, "icon1.svg"), "// valid svg");
            await fs.writeFile(path.join(testDirectory, "icon2.png"), "// invalid png for icons");
            await fs.writeFile(path.join(testDirectory, "icon3.js"), "// invalid js for icons");
            await fs.writeFile(path.join(testDirectory, "icon4.ts"), "// invalid ts for icons");

            const context = {
                options: {
                    rootDir: temporaryDirectoryPath,
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
                        ".": "./dist/index.js",
                        "./icons/*": "./src/icons/*",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            // Clean up
            await fs.rm(temporaryDirectoryPath, { force: true, recursive: true });

            // Should warn about files with invalid extensions
            expect(mockedWarn).toHaveBeenCalledExactlyOnceWith(
                context,
                expect.stringContaining("matches files with invalid extensions: src/icons/icon1.svg, src/icons/icon2.png"),
            );
        });

        it("should validate glob patterns with custom allowed extensions", async () => {
            expect.assertions(1);

            // Create temporary test files
            const fs = await import("node:fs/promises");
            const path = await import("node:path");

            const temporaryDirectoryPath = temporaryDirectory();
            const testDirectory = path.join(temporaryDirectoryPath, "src", "assets");

            await fs.mkdir(testDirectory, { recursive: true });

            // Create test files
            await fs.writeFile(path.join(testDirectory, "asset1.png"), "// valid png");
            await fs.writeFile(path.join(testDirectory, "asset2.jpg"), "// valid jpg");
            await fs.writeFile(path.join(testDirectory, "asset3.txt"), "// invalid txt");

            const context = {
                options: {
                    rootDir: temporaryDirectoryPath,
                    validation: {
                        packageJson: {
                            allowedExportExtensions: [".png", ".jpg", ".jpeg"],
                            exports: true,
                            main: false,
                            name: false,
                        },
                    },
                },
                pkg: {
                    exports: {
                        ".": "./dist/index.js",
                        "./assets/*": "./src/assets/*",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            // Clean up
            await fs.rm(temporaryDirectoryPath, { force: true, recursive: true });

            // Should warn about files with invalid extensions
            expect(mockedWarn).toHaveBeenCalledExactlyOnceWith(
                context,
                expect.stringContaining("matches files with invalid extensions: src/assets/asset3.txt"),
            );
        });

        it("should accept valid conditional exports", () => {
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
                        import: "./dist/index.mjs",
                        require: "./dist/index.cjs",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should accept valid subpath exports", () => {
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
                        ".": "./dist/index.js",
                        "./utils": "./dist/utils.js",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should warn on empty exports object", () => {
            expect.assertions(4);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: {
                    exports: {},
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledTimes(3);
            expect(mockedWarn).toHaveBeenNthCalledWith(1, context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
            expect(mockedWarn).toHaveBeenNthCalledWith(
                2,
                context,
                "The 'main' field is missing in your package.json. This field should point to your main entry file.",
            );
            expect(mockedWarn).toHaveBeenNthCalledWith(3, context, "Empty exports object. Define at least one export entry");
        });

        it("should warn on mixed subpaths and conditions", () => {
            expect.assertions(4);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: {
                    exports: {
                        ".": "./dist/index.js",
                        import: "./dist/index.mjs",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledTimes(3);
            expect(mockedWarn).toHaveBeenNthCalledWith(1, context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
            expect(mockedWarn).toHaveBeenNthCalledWith(
                2,
                context,
                "The 'main' field is missing in your package.json. This field should point to your main entry file.",
            );
            expect(mockedWarn).toHaveBeenNthCalledWith(
                3,
                context,
                "Mixed subpaths and conditions in exports object. Use either subpaths (keys starting with \".\") or conditions, not both",
            );
        });

        it("should warn on missing main export in subpaths", () => {
            expect.assertions(4);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: {
                    exports: {
                        "./utils": "./dist/utils.js",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledTimes(3);
            expect(mockedWarn).toHaveBeenNthCalledWith(1, context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
            expect(mockedWarn).toHaveBeenNthCalledWith(
                2,
                context,
                "The 'main' field is missing in your package.json. This field should point to your main entry file.",
            );
            expect(mockedWarn).toHaveBeenNthCalledWith(3, context, "Missing main export \".\". Subpaths exports should include a main export entry");
        });

        it("should warn on invalid subpath format", () => {
            expect.assertions(5);

            const context = {
                options: { validation: { packageJson: { exports: true } } },
                pkg: {
                    exports: {
                        ".invalid": "./dist/invalid.js",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledTimes(4);
            expect(mockedWarn).toHaveBeenNthCalledWith(1, context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
            expect(mockedWarn).toHaveBeenNthCalledWith(
                2,
                context,
                "The 'main' field is missing in your package.json. This field should point to your main entry file.",
            );
            expect(mockedWarn).toHaveBeenNthCalledWith(3, context, "Missing main export \".\". Subpaths exports should include a main export entry");
            expect(mockedWarn).toHaveBeenNthCalledWith(4, context, "Invalid subpath \".invalid\". Subpaths should start with \"./\" or be exactly \".\"");
        });

        it("should warn on multiple wildcards in subpath pattern", () => {
            expect.assertions(4);

            const context = {
                options: { rootDir: "/test/project", validation: { packageJson: { exports: true } } },
                pkg: {
                    exports: {
                        ".": "./dist/index.js",
                        "./*/*.js": "./dist/*/*.js",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledTimes(3);
            expect(mockedWarn).toHaveBeenNthCalledWith(1, context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
            expect(mockedWarn).toHaveBeenNthCalledWith(
                2,
                context,
                "The 'main' field is missing in your package.json. This field should point to your main entry file.",
            );
            expect(mockedWarn).toHaveBeenNthCalledWith(3, context, "Invalid subpath pattern \"./*/*.js\". Only one \"*\" wildcard is allowed per subpath");
        });

        it("should warn on unknown export conditions", () => {
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
                        "custom-unknown": "./dist/custom.js",
                        default: "./dist/index.js",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledExactlyOnceWith(
                context,
                "Unknown export conditions [custom-unknown] at exports. Consider using standard conditions (default, import, module-sync, node, node-addons, require) or add custom conditions using the 'extraConditions' option in your validation config.",
            );
        });

        it("should warn on conflicting development and production conditions", () => {
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
                        development: "./dist/dev.js",
                        production: "./dist/prod.js",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledExactlyOnceWith(
                context,
                "Conflicting conditions \"development\" and \"production\" at exports. These conditions are mutually exclusive",
            );
        });

        it("should accept null values to block subpaths", () => {
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
                        ".": "./dist/index.js",
                        // eslint-disable-next-line unicorn/no-null
                        "./internal": null,
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should handle fallback arrays", () => {
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
                    exports: ["./dist/modern.js", "./dist/fallback.js"],
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should warn on empty fallback arrays", () => {
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
                        ".": [],
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledExactlyOnceWith(
                context,
                "Empty fallback array at exports[\".\"]. Fallback arrays should contain at least one entry",
            );
        });

        it("should warn on empty conditions object", () => {
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
                        ".": {},
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledExactlyOnceWith(
                context,
                "Empty conditions object at exports[\".\"]. Conditional exports should define at least one condition",
            );
        });

        it("should warn on invalid exports value type", () => {
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
                        ".": 123,
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledExactlyOnceWith(context, "Invalid exports value type at exports[\".\"]. Expected string, array, object, or null");
        });

        it("should accept all standard Node.js conditions", () => {
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
                        "node-addons": "./dist/addons.js",
                        node: "./dist/node.js",
                        import: "./dist/esm.mjs",
                        require: "./dist/cjs.cjs",
                        "module-sync": "./dist/sync.js",
                        default: "./dist/default.js",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should accept all community conditions", () => {
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
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should skip validation when exports validation is disabled", () => {
            expect.assertions(1);

            const context = {
                options: {
                    validation: {
                        packageJson: {
                            exports: false,
                            main: false,
                            name: false,
                        },
                    },
                },
                pkg: {
                    exports: "invalid-path",
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should handle nested conditional exports", () => {
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
                        ".": {
                            node: {
                                import: "./dist/node.mjs",
                                require: "./dist/node.cjs",
                            },
                            default: "./dist/default.js",
                        },
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should validate complex real-world exports configuration", () => {
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
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should accept custom conditions when included in extraConditions", () => {
            expect.assertions(1);

            const context = {
                options: {
                    validation: {
                        packageJson: {
                            exports: true,
                            extraConditions: ["custom-bundler", "my-framework"],
                            main: false,
                            name: false,
                        },
                    },
                },
                pkg: {
                    exports: {
                        "custom-bundler": "./dist/custom.js",
                        default: "./dist/index.js",
                        "my-framework": "./dist/framework.js",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).not.toHaveBeenCalled();
        });

        it("should warn on unknown conditions even when extraConditions is provided", () => {
            expect.assertions(4);

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
                        default: "./dist/index.js",
                        "known-custom": "./dist/known.js",
                        "unknown-custom": "./dist/unknown.js",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledTimes(3);
            expect(mockedWarn).toHaveBeenNthCalledWith(1, context, "The 'name' field is missing in your package.json. Please provide a valid package name.");
            expect(mockedWarn).toHaveBeenNthCalledWith(
                2,
                context,
                "The 'main' field is missing in your package.json. This field should point to your main entry file.",
            );
            expect(mockedWarn).toHaveBeenNthCalledWith(
                3,
                context,
                "Unknown export conditions [unknown-custom] at exports. Consider using standard conditions (default, import, module-sync, node, node-addons, require) or add custom conditions to 'validation.packageJson.extraConditions' in your packem config.",
            );
        });

        it("should handle empty extraConditions array", () => {
            expect.assertions(1);

            const context = {
                options: {
                    validation: {
                        packageJson: {
                            exports: true,
                            extraConditions: [],
                            main: false,
                            name: false,
                        },
                    },
                },
                pkg: {
                    exports: {
                        import: "./dist/index.mjs",
                        require: "./dist/index.cjs",
                    },
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

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
                    sideEffects: false,
                },
            };

            validatePackageFields(context as unknown as BuildContext<InternalBuildOptions>);

            expect(mockedWarn).toHaveBeenCalledExactlyOnceWith(
                context,
                "Unknown export conditions [custom-condition] at exports. Consider using standard conditions (default, import, module-sync, node, node-addons, require) or add custom conditions using the 'extraConditions' option in your validation config.",
            );
        });
    });
});
