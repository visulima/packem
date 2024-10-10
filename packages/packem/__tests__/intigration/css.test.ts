import { cpSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";

import { isAccessibleSync, readFileSync } from "@visulima/fs";
import { dirname, join, normalize } from "@visulima/path";
import type { InputOptions, OutputOptions } from "rollup";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { StyleOptions } from "../../src/rollup/plugins/css/types";
import { inferModeOption, inferSourceMapOption } from "../../src/rollup/plugins/css/utils/options";
import { createPackageJson, createPackemConfig, execPackemSync, installPackage } from "../helpers";

const fixturePath = join(__dirname, "../..", "__fixtures__", "css");

interface WriteData {
    errorMessage?: string;
    files?: string[];
    input: string | string[];
    inputOpts?: InputOptions;
    minimizer?: "cssnano" | "lightningcss" | undefined;
    options?: StyleOptions;
    outDir?: string;
    outputOpts?: OutputOptions;
    plugins?: Plugin[];
    shouldFail?: boolean;
    stringifyOption?: string;
    title?: string;
}

interface WriteResult {
    css: () => string[];
    isCss: () => boolean;
    isFile: (file: string) => boolean;
    isMap: () => boolean;
    js: () => string[];
    map: () => string[];
}

interface WriteFailResult {
    exitCode: number;
    stderr: string;
}

describe("css", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    const build = async (data: WriteData, stdout?: (stdout: string) => void): Promise<WriteResult | WriteFailResult> => {
        const input = Array.isArray(data.input) ? data.input : [data.input];

        // copy fixtures to temporary directory
        for (const file of input) {
            cpSync(join(fixturePath, dirname(file)), join(temporaryDirectoryPath, "src"), { recursive: true });
        }

        await installPackage(temporaryDirectoryPath, "minireset.css");
        await createPackemConfig(
            temporaryDirectoryPath,
            {},
            "esbuild",
            undefined,
            ["postcss", "less", "stylus", "sass", "sourcemap"],
            data.stringifyOption ?? data.options ?? undefined,
            data.minimizer,
        );

        createPackageJson(temporaryDirectoryPath, {
            exports: input.map((file) => {
                const splitFile = file.split("/");
                const combinedFile = splitFile.slice(1).join("/");

                return { import: `./src/${combinedFile}`.replace(".js", ".mjs"), require: `./src/${combinedFile}`.replace(".js", ".cjs") };
            }),
        });

        const binProcess = await execPackemSync("build", ["--debug"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        if (data.shouldFail) {
            return {
                exitCode: binProcess.exitCode as number,
                stderr: binProcess.stderr as string,
            };
        }
        console.log(binProcess.stdout);
        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        if (stdout) {
            stdout(binProcess.stdout as string);
        }

        const distributionPath = join(temporaryDirectoryPath, "dist");

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const files = readdirSync(distributionPath, {
            recursive: true,
            withFileTypes: true,
        })
            .filter((dirnt) => dirnt.isFile())
            .map((dirnt) => dirnt.name);

        const css = files.filter((file) => file.endsWith(".css"));
        const cssMap = files.filter((file) => file.endsWith(".css.map"));
        const cjs = files.filter((file) => file.endsWith(".cjs"));
        const mjs = files.filter((file) => file.endsWith(".mjs"));

        return {
            css(): string[] {
                return css.map((file) => readFileSync(join(distributionPath, file)));
            },
            isCss(): boolean {
                if (css.length === 0) {
                    return false;
                }

                return css.map((file) => isAccessibleSync(join(distributionPath, file))).every(Boolean);
            },
            isFile(file: string): boolean {
                return isAccessibleSync(join(distributionPath, file));
            },
            isMap(): boolean {
                if (cssMap.length === 0) {
                    return false;
                }

                return cssMap.map((file) => isAccessibleSync(join(distributionPath, file))).every(Boolean);
            },
            js(): string[] {
                return [...cjs, ...mjs].map((file) => readFileSync(join(distributionPath, file)));
            },
            map(): string[] {
                return cssMap.map((file) => readFileSync(join(distributionPath, file)));
            },
        };
    };

    const validate = async (data: WriteData, stdout?: (stdout: string) => void): Promise<void> => {
        if (data.shouldFail) {
            const result = (await build(data)) as WriteFailResult;

            expect(result.stderr).toContain(data.errorMessage);

            expect(result.exitCode).toBe(1);

            return;
        }

        const result = (await build(data, stdout)) as WriteResult;

        for (const f of result.js()) {
            expect(f).toMatchSnapshot("js");
        }

        const options = data.options ?? {};

        const mode = inferModeOption(options.mode);

        if (mode.extract) {
            expect(result.isCss()).toBeTruthy();

            for (const f of result.css()) {
                expect(f).toMatchSnapshot("css");
            }
        }

        const soureMap = inferSourceMapOption(options.sourceMap);

        if (soureMap && !soureMap.inline) {
            expect(result.isMap()).toBe(Boolean(mode.extract));

            for (const f of result.map()) {
                expect(f).toMatchSnapshot("map");
            }
        } else {
            expect(result.isMap()).toBeFalsy();
        }

        for (const file of data.files ?? []) {
            expect(result.isFile(file)).toBeTruthy();
        }
    };

    describe("basic", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                input: "empty/index.js",
                title: "empty",
            },
            {
                input: "simple/index.js",
                title: "simple",
            },
            {
                errorMessage: "Incorrect mode provided, allowed modes are `inject`, `extract` or `emit`",
                input: "simple/index.js",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                options: { mode: "mash" as any },
                shouldFail: true,
                title: "mode-fail",
            },
            {
                errorMessage: "Unable to load PostCSS parser `walrus`",
                input: "simple/index.js",
                options: { postcss: { parser: "walrus" } },
                shouldFail: true,
                title: "parser-fail",
            },
            {
                errorMessage: "Unable to load PostCSS syntax `walrus`",
                input: "simple/index.js",
                options: { postcss: { syntax: "walrus" } },
                shouldFail: true,
                title: "syntax-fail",
            },
            {
                errorMessage: "Unable to load PostCSS stringifier `walrus`",
                input: "simple/index.js",
                options: { postcss: { stringifier: "walrus" } },
                shouldFail: true,
                title: "stringifier-fail",
            },
            {
                errorMessage: "Unable to load PostCSS plugin `pulverizer`",
                input: "simple/index.js",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                options: { postcss: { plugins: ["pulverizer"] as any } },
                shouldFail: true,
                title: "plugin-fail",
            },
            {
                errorMessage: "plugins.filter(...) is not a function or its return value is not async iterable",
                input: "simple/index.js",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                options: { postcss: { plugins: "pulverizer" as any } },
                shouldFail: true,
                title: "plugin-type-fail",
            },
            {
                input: "postcss-config/index.js",
                title: "postcss-config",
            },
            {
                input: "postcss-config-mjs/index.js",
                title: "postcss-config-mjs",
            },
            {
                files: [
                    "assets/bg.png",
                    "assets/bg.testing.regex.png",
                    "assets/bg1.png",
                    "assets/bg1.testing.regex.png",
                    "assets/bg2.testing.regex.png",
                    "assets/cat-2x.png",
                    "assets/cat-print.png",
                    "assets/cat.png",
                ],
                input: "resolvers/index.js",
                options: {
                    alias: { "@": join(fixturePath, "resolvers/features") },
                    mode: "extract",
                    url: { hash: false, publicPath: "/pubpath" },
                },
                outputOpts: {
                    assetFileNames: "[name][extname]",
                },
                title: "resolvers",
            },
            {
                files: [
                    "assets/bg-bd25d3fd.png",
                    "assets/bg-086af782.png",
                    "assets/bg.testing.regex-353515ad.png",
                    "assets/cat-2x-7a783e8c.png",
                    "assets/cat-ef753cf2.png",
                    "assets/cat-print-e4d012b8.png",
                    "assets/Demo-webfont-423f69d5.woff",
                ],
                input: "resolvers/index.js",
                options: {
                    alias: { "@": join(fixturePath, "resolvers/features") },
                    mode: "extract",
                    url: { hash: true, publicPath: "/pubpath" },
                },
                outputOpts: {
                    assetFileNames: "[name][extname]",
                },
                title: "resolvers-hash",
            },
            {
                input: "resolvers/index.js",
                options: {
                    alias: { "@": join(fixturePath, "resolvers/features") },
                    mode: "extract",
                    url: { inline: true },
                },
                title: "resolvers-url-inline",
            },
            {
                input: "skip-loader/index.js",
                options: {
                    loaders: [
                        {
                            name: "loader",
                            process: (): never => "lol" as never,
                            test: /\.random$/,
                        },
                    ],
                    use: ["loader"],
                },
                title: "skip-loader",
            },
            {
                input: "postcss-options/index.js",
                options: {
                    parser: "sugarss",
                    plugins: ["autoprefixer", ["autoprefixer", { overrideBrowserslist: ["> 0%"] }]],
                },
                title: "postcss-options",
            },
        ] as WriteData[])("should process $title css", async ({ title, ...data }: WriteData) => {
            await validate(data);
        });
    });

    describe("minify", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                input: "simple/index.js",
                minimizer: "cssnano",
                title: "inject",
            },
            {
                input: "simple/index.js",
                minimizer: "cssnano",
                options: {
                    mode: "extract",
                },
                title: "extract",
            },
            {
                input: "simple/index.js",
                minimizer: "cssnano",
                options: {
                    mode: "extract",
                    sourceMap: true,
                },
                title: "extract-sourcemap-true",
            },
            {
                input: "simple/index.js",
                minimizer: "cssnano",
                options: {
                    mode: "extract",
                    sourceMap: "inline",
                },
                title: "extract-sourcemap-inline",
            },

            {
                input: "simple/index.js",
                minimizer: "lightningcss",
                title: "inject",
            },
            {
                input: "simple/index.js",
                minimizer: "lightningcss",
                options: {
                    mode: "extract",
                },
                title: "extract",
            },
            {
                input: "simple/index.js",
                minimizer: "lightningcss",
                options: {
                    mode: "extract",
                    sourceMap: true,
                },
                title: "extract-sourcemap-true",
            },
            {
                input: "simple/index.js",
                minimizer: "lightningcss",
                options: {
                    mode: "extract",
                    sourceMap: "inline",
                },
                title: "extract-sourcemap-inline",
            },
        ] as WriteData[])("should minimize processed $title css with $minimizer", async ({ minimizer, title, ...data }: WriteData) => {
            await validate({ ...data, minimizer });
        });
    });

    describe("sourcemap", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                input: "simple/index.js",
                options: { sourceMap: true },
                title: "true",
            },
            {
                input: "simple/index.js",
                options: { sourceMap: [true, { content: false }] },
                title: "no-content",
            },
            {
                input: "simple/index.js",
                // eslint-disable-next-line no-return-assign,no-param-reassign
                options: { sourceMap: [true, { transform: (map) => (map.sources = ["virt"]) }] },
                title: "transform",
            },
            {
                input: "simple/index.js",
                options: { sourceMap: "inline" },
                title: "inline",
            },
            {
                input: "simple/index.js",
                options: { sourceMap: ["inline", { content: false }] },
                title: "inline-no-content",
            },
            {
                input: "simple/index.js",
                // eslint-disable-next-line no-param-reassign,no-return-assign
                options: { sourceMap: ["inline", { transform: (m) => (m.sources = ["virt"]) }] },
                title: "inline-transform",
            },
        ] as WriteData[])("should generate sourcemap for processed $title css", async ({ title, ...data }: WriteData) => {
            await validate(data);
        });
    });

    describe("extract", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                input: "simple/index.js",
                options: { mode: "extract" },
                title: "true",
            },
            {
                input: "simple/index.js",
                options: { mode: "extract" },
                outputOpts: { file: "result.js" },
                title: "file",
            },
            // {
            //     input: "simple/index.js",
            //     inputOpts: { preserveModules: true },
            //     options: { mode: "extract" },
            //     title: "preserve-modules",
            // },
            {
                input: "simple/index.js",
                options: { mode: ["extract", join(fixturePath, "dist/wrong.css")] },
                shouldFail: true,
                title: "absolute-path-fail",
            },
            {
                input: "simple/index.js",
                options: { mode: ["extract", "../wrong.css"] },
                shouldFail: true,
                title: "relative-path-fail",
            },
            {
                input: "simple/index.js",
                options: {
                    mode: ["extract", "i/am/extracted.css"],
                    sourceMap: true,
                },
                title: "custom-path",
            },
            {
                input: "simple/index.js",
                options: { mode: "extract", sourceMap: true },
                title: "sourcemap-true",
            },
            {
                input: "simple/index.js",
                options: { mode: "extract", sourceMap: [true, { transform: (m) => (m.sources = ["virt"]) }] },
                title: "sourcemap-transform",
            },
            {
                input: "simple/index.js",
                options: { mode: "extract", sourceMap: "inline" },
                title: "sourcemap-inline",
            },
            {
                input: "simple/index.js",
                options: { mode: "extract", sourceMap: ["inline", { transform: (m) => (m.sources = ["virt"]) }] },
                title: "sourcemap-inline-transform",
            },
            {
                input: "simple/index.js",
                options: { mode: "extract", sourceMap: true },
                outputOpts: {
                    assetFileNames({ name }) {
                        const p = "[name][extname]";

                        if (!name) {
                            return p;
                        }

                        if (name.endsWith(".css")) {
                            return `css/${p}`;
                        }

                        if (name.endsWith(".map")) {
                            return `map/${p}`;
                        }

                        return p;
                    },
                },
                title: "asset-file-names",
            },
        ] as WriteData[])("should generate sourcemap for processed $title css", async ({ title, ...data }: WriteData) => {
            await validate(data);
        });
    });

    describe("inject", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                input: "simple/index.js",
                options: {
                    mode: ["inject", { prepend: true }],
                },
                title: "top",
            },
            {
                input: "simple/index.js",
                options: { mode: ["inject", (varname, id) => `console.log(${varname},${JSON.stringify(normalize(id))})`] },
                // eslint-disable-next-line no-template-curly-in-string
                stringifyOption: 'mode: ["inject", (varname, id) => `console.log(${varname},${JSON.stringify(normalize(id.replace("__REPLACE__", "")))})`],',
                title: "function",
            },
        ] as WriteData[])("should work with injected processed $title css", async ({ title, ...data }: WriteData) => {
            // this is needed because of the temporary directory path, that is generated on every test run
            // eslint-disable-next-line no-param-reassign
            data.stringifyOption = data.stringifyOption?.replace("__REPLACE__", temporaryDirectoryPath);

            await validate(data);
        });
    });

    describe("sass", () => {
        // eslint-disable-next-line vitest/prefer-expect-assertions
        it.each([
            {
                input: "sass/index.js",
                options: {
                    sass: {
                        implementation: "sass",
                    },
                },
                title: "sass - default",
            },
            // {
            //     input: "sass-use/index.js",
            //     options: {
            //         sass: {
            //             implementation: "sass",
            //         },
            //     },
            //     title: "sass - use",
            // },
            // {
            //     input: "sass/index.js",
            //     options: {
            //         sass: {
            //             implementation: "sass",
            //         },
            //         sourceMap: true,
            //     },
            //     title: "sass - sourcemap",
            // },
            // {
            //     input: "sass-modules/index.js",
            //     options: {
            //         modules: true,
            //         sass: {
            //             implementation: "sass",
            //         },
            //     },
            //     title: "sass - modules",
            // },
            // {
            //     input: "sass-data/index.js",
            //     options: {
            //         sass: { data: "@import 'data';", implementation: "sass" },
            //     },
            //     title: "sass - data",
            // },
            // {
            //     input: "sass-import/index.js",
            //     options: {
            //         sass: {
            //             implementation: "sass",
            //         },
            //     },
            //     title: "sass - import",
            // },
            // {
            //     input: "sass-importer/index.js",
            //     options: {
            //         sass: {
            //             implementation: "sass",
            //             importer(url, _, done): void {
            //                 if (url === "~modularvirtualimport") {
            //                     done({ contents: ".modularvirtual{color:blue}" });
            //                 } else {
            //                     done({ contents: ".virtual{color:red}" });
            //                 }
            //             },
            //             sync: false,
            //         },
            //     },
            //     stringifyOption:
            //         'sass: { importer(url, _, done): void {\nif (url === "~modularvirtualimport") {\ndone({ contents: ".modularvirtual{color:blue}" });\n} else {\ndone({ contents: ".virtual{color:red}" });\n}\n},\nsync: false,\n},',
            //     title: "sass - importer",
            // },
            // {
            //     input: "sass-importer/index.js",
            //     options: {
            //         sass: {
            //             implementation: "node-sass",
            //             importer(url, _, done): void {
            //                 if (url === "~modularvirtualimport") {
            //                     done({ contents: ".modularvirtual{color:blue}" });
            //                 } else {
            //                     done({ contents: ".virtual{color:red}" });
            //                 }
            //             },
            //             sync: false,
            //         },
            //     },
            //     stringifyOption:
            //         'sass: { importer(url, _, done): void {\nif (url === "~modularvirtualimport") {\ndone({ contents: ".modularvirtual{color:blue}" });\n} else {\ndone({ contents: ".virtual{color:red}" });\n}\n},\nsync: false,\n},',
            //     title: "node-sass - importer-node",
            // },
            // {
            //     input: "sass-importer/index.js",
            //     options: {
            //         sass: {
            //             implementation: "sass",
            //             importer(url) {
            //                 if (url === "~modularvirtualimport") {
            //                     return { contents: ".modularvirtual{color:blue}" };
            //                 }
            //
            //                 return { contents: ".virtual{color:red}" };
            //             },
            //             sync: true,
            //         },
            //     },
            //     stringifyOption:
            //         'sass: {\nimporter(url) {\nif (url === "~modularvirtualimport") {\nreturn { contents: ".modularvirtual{color:blue}" };\n}\nreturn { contents: ".virtual{color:red}" };\n},\nsync: true,\n},',
            //     title: "sass - importer-sync",
            // },
            // {
            //     input: "sass-importer/index.js",
            //     options: {
            //         sass: {
            //             implementation: "node-sass",
            //             importer(url) {
            //                 if (url === "~modularvirtualimport") {
            //                     return { contents: ".modularvirtual{color:blue}" };
            //                 }
            //
            //                 return { contents: ".virtual{color:red}" };
            //             },
            //             sync: true,
            //         },
            //     },
            //     stringifyOption:
            //         'sass: {\nimporter(url) {\nif (url === "~modularvirtualimport") {\nreturn { contents: ".modularvirtual{color:blue}" };\n}\nreturn { contents: ".virtual{color:red}" };\n},\nsync: true,\n},',
            //     title: "node-sass - importer-sync-node",
            // },
        ] as WriteData[])("should work with sass/scss processed $title css", async ({ title, ...data }) => {
            await validate(data, (stdout) => {
                if (data.options && data.options.sass && data.options.sass.implementation) {
                    // eslint-disable-next-line vitest/no-conditional-expect
                    expect(stdout).toContain(`Using ${data.options.sass.implementation} as the Sass implementation`);
                }
            });
        });
    });

    describe("stylus", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                input: "stylus-import/index.js",
                title: "import",
            },
            {
                input: "stylus-import/index.js",
                options: { mode: "extract", sourceMap: true },
                title: "sourcemap",
            },
        ] as WriteData[])("should work with stylus processed $title css", async ({ title, ...data }: WriteData) => {
            await validate(data);
        });
    });

    describe("less", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                input: "less-import/index.js",
                title: "import",
            },
            {
                input: "less-import/index.js",
                options: { mode: "extract", sourceMap: true },
                title: "sourcemap",
            },
            {
                input: "less-paths/index.js",
                options: { less: { paths: [join(fixturePath, "less-paths/sub")] } },
                title: "paths",
            },
        ] as WriteData[])("should work with less processed $title css", async ({ title, ...data }: WriteData) => {
            await validate(data);
        });
    });

    describe("code-splitting", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                input: "code-splitting/index.js",
                options: {
                    mode: "extract",
                    modules: true,
                    sourceMap: true,
                },
                title: "true",
            },
            {
                input: "code-splitting/index.js",
                options: {
                    mode: ["extract", "extracted.css"],
                    modules: true,
                    sourceMap: true,
                },
                title: "single",
            },
            {
                input: "code-splitting/index.js",
                inputOpts: { preserveModules: true },
                options: {
                    mode: "extract",
                    modules: true,
                    sourceMap: true,
                },
                title: "preserve-modules",
            },
            {
                input: "code-splitting/index.js",
                inputOpts: { preserveModules: true },
                options: {
                    mode: ["extract", "extracted.css"],
                    modules: true,
                    sourceMap: true,
                },
                title: "preserve-modules-single",
            },
            {
                input: ["code-splitting/index.js", "code-splitting/indextwo.js"],
                inputOpts: { preserveModules: true },
                options: {
                    mode: "extract",
                    modules: true,
                    sourceMap: true,
                },
                title: "preserve-modules-multi-entry",
            },
            {
                input: ["code-splitting/index.js", "code-splitting/indextwo.js"],
                options: {
                    mode: "extract",
                    modules: true,
                    sourceMap: true,
                },
                title: "multi-entry",
            },
            {
                input: ["code-splitting/index.js", "code-splitting/indextwo.js"],
                options: {
                    mode: ["extract", "extracted.css"],
                    modules: true,
                    sourceMap: true,
                },
                title: "multi-entry-single",
            },
            {
                input: ["code-splitting/index.js", "code-splitting/indextwo.js"],
                inputOpts: {
                    manualChunks(id) {
                        if (id.includes("third")) {
                            return "thirds";
                        }

                        if (id.includes("fourth")) {
                            return "fourts";
                        }

                        if (id.includes("nondynamic")) {
                            return "nondynamics";
                        }
                    },
                },
                options: {
                    mode: "extract",
                    modules: true,
                    sourceMap: true,
                },
                title: "manual-chunks",
            },
            {
                input: ["code-splitting/index.js", "code-splitting/indextwo.js"],
                inputOpts: {
                    manualChunks(id) {
                        if (id.includes("third")) {
                            return "thirds";
                        }

                        if (id.includes("fourth")) {
                            return "fourts";
                        }

                        if (id.includes("nondynamic")) {
                            return "nondynamics";
                        }

                        return "general";
                    },
                },
                options: {
                    mode: "extract",
                    modules: true,
                    sourceMap: true,
                },
                title: "manual-chunks-only",
            },
            {
                input: ["code-splitting/index.js", "code-splitting/indextwo.js"],
                inputOpts: {
                    manualChunks(id) {
                        if (id.includes("third")) {
                            return "thirds";
                        }

                        if (id.includes("fourth")) {
                            return "fourts";
                        }

                        if (id.includes("nondynamic")) {
                            return "nondynamics";
                        }
                    },
                },
                options: {
                    mode: ["extract", "extracted.css"],
                    modules: true,
                    sourceMap: true,
                },
                title: "manual-chunks-single",
            },
            {
                input: ["code-splitting/index.js", "code-splitting/indextwo.js"],
                inputOpts: {
                    manualChunks(id) {
                        if (id.includes("third")) {
                            return "thirds";
                        }
                        if (id.includes("fourth")) {
                            return "fourts";
                        }
                        if (id.includes("nondynamic")) {
                            return "nondynamics";
                        }
                        return "general";
                    },
                },
                options: {
                    mode: ["extract", "extracted.css"],
                    modules: true,
                    sourceMap: true,
                },
                title: "manual-chunks-only-single",
            },
        ] as WriteData[])("should work with injected processed $title css", async ({ title, ...data }: WriteData) => {
            await validate(data);
        });
    });

    // describe("emit", () => {
    //     // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
    //     it.each([
    //         {
    //             input: "emit/index.js",
    //             plugins: [styles({ mode: "emit", plugins: [["autoprefixer", { overrideBrowserslist: ["> 0%"] }]] }), litCss()],
    //             title: "true",
    //         },
    //         {
    //             input: "emit/index.js",
    //             plugins: [styles({ mode: "emit", sourceMap: true }), litCss()],
    //             title: "sourcemap",
    //         },
    //         {
    //             input: "emit/index.js",
    //             plugins: [styles({ mode: "emit", sourceMap: [true, { transform: (m) => (m.sources = ["virt"]) }] }), litCss()],
    //             title: "sourcemap-transform",
    //         },
    //     ] as WriteData[])("should work with injected processed $title css", async ({ title, ...data }: WriteData) => {
    //         await validate(data);
    //     });
    // });
});
