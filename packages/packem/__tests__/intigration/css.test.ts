import { cpSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";

import { isAccessibleSync, readFileSync } from "@visulima/fs";
import { dirname, join, normalize } from "@visulima/path";
import type { OutputOptions } from "rollup";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { StyleOptions } from "../../src/rollup/plugins/css/types";
import { inferModeOption, inferSourceMapOption } from "../../src/rollup/plugins/css/utils/options";
import type { PackemConfigProperties } from "../helpers";
import { createPackageJson, createPackemConfig, execPackemSync, installPackage } from "../helpers";

const fixturePath = join(__dirname, "../..", "__fixtures__", "css");

interface WriteData {
    errorMessage?: string;
    files?: string[];
    input: string | string[];
    minimizer?: "cssnano" | "lightningcss" | undefined;
    outDir?: string;
    outputOpts?: OutputOptions;
    packemPlugins?: PackemConfigProperties["plugins"];
    shouldFail?: boolean;
    stringifyStyleOption?: string;
    styleOptions?: StyleOptions;
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

    // eslint-disable-next-line sonarjs/cognitive-complexity
    const build = async (data: WriteData): Promise<WriteResult | WriteFailResult> => {
        const input = Array.isArray(data.input) ? data.input : [data.input];

        // copy fixtures to temporary directory
        for (const file of input) {
            cpSync(join(fixturePath, dirname(file)), join(temporaryDirectoryPath, "src"), { recursive: true });
        }

        await installPackage(temporaryDirectoryPath, "minireset.css");

        const { loaders, ...otherOptions } = data.styleOptions ?? {};

        await createPackemConfig(temporaryDirectoryPath, {
            config: data.outputOpts
                ? {
                      rollup: {
                          output: {
                              ...data.outputOpts,
                          },
                      },
                  }
                : undefined,
            cssLoader: loaders ?? ["postcss", "less", "stylus", "sass", "sourcemap"],
            cssOptions: data.stringifyStyleOption ?? otherOptions ?? undefined,
            minimizer: data.minimizer,
            plugins: data.packemPlugins,
            transformer: "esbuild",
        });

        createPackageJson(temporaryDirectoryPath, {
            exports: input.map((file) => {
                const splitFile = file.split("/");
                const combinedFile = splitFile.slice(1).join("/");

                return { import: `./src/${combinedFile}`.replace(".js", ".mjs"), require: `./src/${combinedFile}`.replace(".js", ".cjs") };
            }),
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        if (data.shouldFail) {
            return {
                exitCode: binProcess.exitCode as number,
                stderr: binProcess.stderr as string,
            };
        }

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toSatisfy((content: string) => {
            const matches: string[] = [];

            let match;
            const regex = /: Unresolved URL.*/g;

            // eslint-disable-next-line no-cond-assign
            while ((match = regex.exec(content)) !== null) {
                // This is necessary to avoid infinite loops with zero-width matches
                if (match.index === regex.lastIndex) {
                    // eslint-disable-next-line no-plusplus
                    regex.lastIndex++;
                }

                match.forEach((m: string) => {
                    if (!m.includes("./nonexistant")) {
                        matches.push(m);
                    }
                });
            }

            return matches.filter(Boolean).length === 0;
        });

        const distributionPath = join(temporaryDirectoryPath, "dist");

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const files = readdirSync(distributionPath, {
            recursive: true,
            withFileTypes: true,
        })
            .filter((dirent) => dirent.isFile())
            .map((dirent) => join(dirent.parentPath, dirent.name));

        const css = files.filter((file) => file.endsWith(".css"));
        const cssMap = files.filter((file) => file.endsWith(".css.map"));
        const cjs = files.filter((file) => file.endsWith(".cjs"));
        const mjs = files.filter((file) => file.endsWith(".mjs"));

        return {
            css(): string[] {
                return css.map((file) => readFileSync(file));
            },
            isCss(): boolean {
                if (css.length === 0) {
                    return false;
                }

                return css.map((file) => isAccessibleSync(file)).every(Boolean);
            },
            isFile(file: string): boolean {
                return isAccessibleSync(join(distributionPath, file));
            },
            isMap(): boolean {
                if (cssMap.length === 0) {
                    return false;
                }

                return cssMap.map((file) => isAccessibleSync(file)).every(Boolean);
            },
            js(): string[] {
                return [...cjs, ...mjs].map((file) => readFileSync(file));
            },
            map(): string[] {
                return cssMap.map((file) => readFileSync(file));
            },
        };
    };

    const validate = async (data: WriteData): Promise<void> => {
        if (data.shouldFail) {
            const result = (await build(data)) as WriteFailResult;

            expect(result.stderr).toContain(data.errorMessage);

            expect(result.exitCode).toBe(1);

            return;
        }

        const result = (await build(data)) as WriteResult;

        for (const f of result.js()) {
            expect(f).toMatchSnapshot("js");
        }

        const options = data.styleOptions ?? {};

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
                shouldFail: true,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                styleOptions: { mode: "mash" as any },
                title: "mode-fail",
            },
            {
                errorMessage: "Unable to load PostCSS parser `walrus`",
                input: "simple/index.js",
                shouldFail: true,
                styleOptions: { postcss: { parser: "walrus" } },
                title: "parser-fail",
            },
            {
                errorMessage: "Unable to load PostCSS syntax `walrus`",
                input: "simple/index.js",
                shouldFail: true,
                styleOptions: { postcss: { syntax: "walrus" } },
                title: "syntax-fail",
            },
            {
                errorMessage: "Unable to load PostCSS stringifier `walrus`",
                input: "simple/index.js",
                shouldFail: true,
                styleOptions: { postcss: { stringifier: "walrus" } },
                title: "stringifier-fail",
            },
            {
                errorMessage: "Unable to load PostCSS plugin `pulverizer`",
                input: "simple/index.js",
                shouldFail: true,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                styleOptions: { postcss: { plugins: ["pulverizer"] as any } },
                title: "plugin-fail",
            },
            {
                errorMessage: "plugins.filter(...) is not a function or its return value is not async iterable",
                input: "simple/index.js",
                shouldFail: true,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                styleOptions: { postcss: { plugins: "pulverizer" as any } },
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
                    "assets/cat-2x.png",
                    "assets/cat-print.png",
                    "assets/cat.png",
                    "assets/Demo-webfont.woff",
                ],
                input: "resolvers/index.js",
                outputOpts: {
                    assetFileNames: "[name][extname]",
                },
                styleOptions: {
                    alias: { "@": join("__REPLACE__", "src", "features") },
                    mode: "extract",
                    postcss: {
                        url: { hash: false, publicPath: "/pubpath" },
                    },
                },
                title: "resolvers",
            },
            {
                files: [
                    "assets/bg.png",
                    "assets/bg.testing.regex.png",
                    "assets/bg1.png",
                    "assets/bg1.testing.regex.png",
                    "assets/cat-2x.png",
                    "assets/cat-print.png",
                    "assets/cat.png",
                    "assets/Demo-webfont.woff",
                ],
                input: "resolvers/index.js",
                styleOptions: {
                    alias: { "@": join("__REPLACE__", "src", "features") },
                    mode: "extract",
                    postcss: {
                        url: { hash: false },
                    },
                },
                title: "resolver-assets",
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
                outputOpts: {
                    assetFileNames: "[name][extname]",
                },
                styleOptions: {
                    alias: { "@": join("__REPLACE__", "src", "features") },
                    mode: "extract",
                    postcss: {
                        url: { hash: true, publicPath: "/pubpath" },
                    },
                },
                title: "resolvers-hash",
            },
            {
                input: "resolvers/index.js",
                styleOptions: {
                    alias: { "@": join("__REPLACE__", "src", "features") },
                    mode: "extract",
                    postcss: {
                        url: { inline: true },
                    },
                },
                title: "resolvers-url-inline",
            },
            {
                input: "postcss-options/index.js",
                styleOptions: {
                    postcss: {
                        parser: join(temporaryDirectoryPath, "node_modules", "sugarss"),
                    },
                },
                title: "postcss-options",
            },
        ] as WriteData[])("should process $title css", async ({ title, ...data }: WriteData) => {
            // eslint-disable-next-line vitest/no-conditional-in-test
            if (title === "postcss-options") {
                await installPackage(temporaryDirectoryPath, "sugarss");
            }

            // eslint-disable-next-line vitest/no-conditional-in-test
            if (data.styleOptions?.alias) {
                for (const [key, value] of Object.entries(data.styleOptions.alias)) {
                    // this is needed because of the temporary directory path, that is generated on every test run
                    // eslint-disable-next-line no-param-reassign,security/detect-object-injection
                    data.styleOptions.alias[key] = value.replace("__REPLACE__", temporaryDirectoryPath);
                }
            }

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
                styleOptions: {
                    mode: "extract",
                },
                title: "extract",
            },
            {
                input: "simple/index.js",
                minimizer: "cssnano",
                styleOptions: {
                    mode: "extract",
                    sourceMap: true,
                },
                title: "extract-sourcemap-true",
            },
            {
                input: "simple/index.js",
                minimizer: "cssnano",
                styleOptions: {
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
                styleOptions: {
                    mode: "extract",
                },
                title: "extract",
            },
            {
                input: "simple/index.js",
                minimizer: "lightningcss",
                styleOptions: {
                    mode: "extract",
                    sourceMap: true,
                },
                title: "extract-sourcemap-true",
            },
            {
                input: "simple/index.js",
                minimizer: "lightningcss",
                styleOptions: {
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
                styleOptions: { sourceMap: true },
                title: "true",
            },
            {
                input: "simple/index.js",
                styleOptions: { sourceMap: [true, { content: false }] },
                title: "no-content",
            },
            {
                input: "simple/index.js",
                // eslint-disable-next-line no-return-assign,no-param-reassign
                styleOptions: { sourceMap: [true, { transform: (map) => (map.sources = ["virt"]) }] },
                title: "transform",
            },
            {
                input: "simple/index.js",
                styleOptions: { sourceMap: "inline" },
                title: "inline",
            },
            {
                input: "simple/index.js",
                styleOptions: { sourceMap: ["inline", { content: false }] },
                title: "inline-no-content",
            },
            {
                input: "simple/index.js",
                // eslint-disable-next-line no-param-reassign,no-return-assign
                styleOptions: { sourceMap: ["inline", { transform: (m) => (m.sources = ["virt"]) }] },
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
                styleOptions: { mode: "extract" },
                title: "true",
            },
            {
                input: "simple/index.js",
                outputOpts: { preserveModules: true },
                styleOptions: { mode: "extract" },
                title: "preserve-modules",
            },
            {
                input: "simple/index.js",
                shouldFail: true,
                styleOptions: { mode: ["extract", join("__REPLACE__", "src", "dist/wrong.css")] },
                title: "absolute-path-fail",
            },
            {
                input: "simple/index.js",
                shouldFail: true,
                styleOptions: { mode: ["extract", "../wrong.css"] },
                title: "relative-path-fail",
            },
            {
                input: "simple/index.js",
                styleOptions: {
                    mode: ["extract", "i/am/extracted.css"],
                    sourceMap: true,
                },
                title: "custom-path",
            },
            {
                input: "simple/index.js",
                styleOptions: { mode: "extract", sourceMap: true },
                title: "sourcemap-true",
            },
            {
                input: "simple/index.js",
                // eslint-disable-next-line no-return-assign,no-param-reassign
                styleOptions: { mode: "extract", sourceMap: [true, { transform: (map) => (map.sources = ["virt"]) }] },
                title: "sourcemap-transform",
            },
            {
                input: "simple/index.js",
                styleOptions: { mode: "extract", sourceMap: "inline" },
                title: "sourcemap-inline",
            },
            {
                input: "simple/index.js",
                // eslint-disable-next-line no-return-assign,no-param-reassign
                styleOptions: { mode: "extract", sourceMap: ["inline", { transform: (map) => (map.sources = ["virt"]) }] },
                title: "sourcemap-inline-transform",
            },
            {
                input: "simple/index.js",
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
                styleOptions: { mode: "extract", sourceMap: true },
                title: "asset-file-names",
            },
        ] as WriteData[])("should generate sourcemap for processed $title css", async ({ title, ...data }: WriteData) => {
            // eslint-disable-next-line vitest/no-conditional-in-test
            if (Array.isArray(data.styleOptions?.mode)) {
                // eslint-disable-next-line no-param-reassign
                data.styleOptions.mode = [
                    data.styleOptions.mode[0] as "extract",
                    (data.styleOptions.mode[1] as string).replace("__REPLACE__", temporaryDirectoryPath),
                ];
            }

            await validate(data);
        });
    });

    describe("inject", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                input: "simple/index.js",
                styleOptions: {
                    mode: ["inject", { prepend: true }],
                },
                title: "top",
            },
            {
                input: "simple/index.js",

                stringifyStyleOption:
                    // eslint-disable-next-line no-template-curly-in-string
                    'mode: ["inject", (varname, id) => `console.log(${varname},${JSON.stringify(normalize(id.replace("__REPLACE__", "")))})`],',
                styleOptions: { mode: ["inject", (varname, id) => `console.log(${varname},${JSON.stringify(normalize(id))})`] },
                title: "function",
            },
        ] as WriteData[])("should work with injected processed $title css", async ({ title, ...data }: WriteData) => {
            // this is needed because of the temporary directory path, that is generated on every test run
            // eslint-disable-next-line no-param-reassign
            data.stringifyStyleOption = data.stringifyStyleOption?.replace("__REPLACE__", temporaryDirectoryPath);

            await validate(data);
        });
    });

    describe("sass", () => {
        // eslint-disable-next-line vitest/prefer-expect-assertions,vitest/expect-expect
        it.each([
            {
                input: "sass/index.js",
                styleOptions: {
                    sass: {
                        implementation: "sass",
                    },
                },
                title: "sass - default",
            },
            {
                input: "sass/index.js",
                styleOptions: {
                    sass: {
                        implementation: "sass-embedded",
                    },
                },
                title: "sass-embedded - default",
            },
            {
                input: "sass/index.js",
                styleOptions: {
                    sass: {
                        implementation: "node-sass",
                    },
                },
                title: "node-sass - default",
            },
            {
                input: "sass-use/index.js",
                styleOptions: {
                    sass: {
                        implementation: "sass",
                    },
                },
                title: "sass - use",
            },
            {
                input: "sass/index.js",
                styleOptions: {
                    sass: {
                        implementation: "sass",
                    },
                    sourceMap: true,
                },
                title: "sass - sourcemap",
            },
            {
                input: "sass-modules/index.js",
                styleOptions: {
                    sass: {
                        implementation: "sass",
                    },
                },
                title: "sass - modules",
            },
            {
                input: "sass-data/index.js",
                styleOptions: {
                    sass: { additionalData: "@import 'data';", implementation: "sass-embedded" },
                },
                title: "sass-embedded - data",
            },
            {
                input: "sass-data/index.js",
                styleOptions: {
                    sass: { additionalData: "@import 'data';", implementation: "sass" },
                },
                title: "sass - data",
            },
            {
                input: "sass-data/index.js",
                styleOptions: {
                    sass: { additionalData: "@import 'data';", implementation: "node-sass" },
                },
                title: "node-sass - data",
            },
            {
                input: "sass-import/index.js",
                styleOptions: {
                    sass: {
                        implementation: "sass",
                    },
                },
                title: "sass - import",
            },
        ] as WriteData[])("should work with sass/scss processed $title css", async ({ title, ...data }) => {
            await validate(data);
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
                styleOptions: { mode: "extract", sourceMap: true },
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
                styleOptions: { mode: "extract", sourceMap: true },
                title: "sourcemap",
            },
            {
                input: "less-paths/index.js",
                styleOptions: { less: { paths: [join("__REPLACE__", "src", "sub")] } },
                title: "paths",
            },
        ] as WriteData[])("should work with less processed $title css", async ({ title, ...data }: WriteData) => {
            // eslint-disable-next-line vitest/no-conditional-in-test
            if (data.styleOptions?.less?.paths) {
                // eslint-disable-next-line no-plusplus
                for (let index = 0; index < data.styleOptions.less.paths.length; index++) {
                    // this is needed because of the temporary directory path, that is generated on every test run
                    // eslint-disable-next-line no-param-reassign,security/detect-object-injection
                    data.styleOptions.less.paths[index] = (data.styleOptions.less.paths[index] as string).replace("__REPLACE__", temporaryDirectoryPath);
                }
            }

            await validate(data);
        });
    });

    describe("code-splitting", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                input: "code-splitting/index.js",
                styleOptions: {
                    mode: "extract",
                    sourceMap: true,
                },
                title: "true",
            },
            {
                input: "code-splitting/index.js",
                styleOptions: {
                    mode: ["extract", "extracted.css"],
                    sourceMap: true,
                },
                title: "single",
            },
            {
                input: "code-splitting/index.js",
                outputOpts: { preserveModules: true },
                styleOptions: {
                    mode: "extract",
                    sourceMap: true,
                },
                title: "preserve-modules",
            },
            {
                input: "code-splitting/index.js",
                outputOpts: { preserveModules: true },
                styleOptions: {
                    mode: ["extract", "extracted.css"],
                    sourceMap: true,
                },
                title: "preserve-modules-single",
            },
            {
                input: ["code-splitting/index.js", "code-splitting/indextwo.js"],
                outputOpts: { preserveModules: true },
                styleOptions: {
                    mode: "extract",
                    sourceMap: true,
                },
                title: "preserve-modules-multi-entry",
            },
            {
                input: ["code-splitting/index.js", "code-splitting/indextwo.js"],
                styleOptions: {
                    mode: "extract",
                    sourceMap: true,
                },
                title: "multi-entry",
            },
            {
                input: ["code-splitting/index.js", "code-splitting/indextwo.js"],
                styleOptions: {
                    mode: ["extract", "extracted.css"],
                    sourceMap: true,
                },
                title: "multi-entry-single",
            },
        ] as WriteData[])("should work with processed $title css", async ({ title, ...data }: WriteData) => {
            await validate(data);
        });
    });

    it("should work with onExtract function", async () => {
        expect.assertions(7);

        const result = (await build({
            input: "simple/index.js",
            stringifyStyleOption: `mode: "extract",
            onExtract(): boolean {
                return false;
            },`,
        })) as WriteResult;

        for (const f of result.js()) {
            expect(f).toMatchSnapshot("js");
        }

        expect(result.isCss()).toBeFalsy();
        expect(result.isMap()).toBeFalsy();
    });

    describe("emit", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                input: "emit/index.js",
                packemPlugins: [
                    {
                        code: "litCss()",
                        from: "rollup-plugin-lit-css",
                        importName: "litCss",
                        namedExport: true,
                        when: "after",
                    },
                ],
                styleOptions: { mode: "emit", plugins: [["autoprefixer", { overrideBrowserslist: ["> 0%"] }]] },
                title: "basic-emit",
            },
            {
                input: "emit/index.js",
                packemPlugins: [
                    {
                        code: "litCss()",
                        from: "rollup-plugin-lit-css",
                        importName: "litCss",
                        namedExport: true,
                        when: "after",
                    },
                ],
                styleOptions: { mode: "emit", sourceMap: true },
                title: "sourcemap-emit",
            },
            {
                input: "emit/index.js",
                packemPlugins: [
                    {
                        code: "litCss()",
                        from: "rollup-plugin-lit-css",
                        importName: "litCss",
                        namedExport: true,
                        when: "after",
                    },
                ],
                stringifyStyleOption: `mode: "emit", sourceMap: [true, { transform: (m) => (m.sources = ["virt"]) }]`,
                title: "sourcemap-transform",
            },
        ] as WriteData[])("should work with emitted processed $title css", async ({ title, ...data }: WriteData) => {
            await installPackage(temporaryDirectoryPath, "rollup-plugin-lit-css");

            await validate(data);
        });
    });
});
