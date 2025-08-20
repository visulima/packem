import type { Dirent } from "node:fs";
import { cpSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";

import { isAccessibleSync, readFileSync } from "@visulima/fs";
import { dirname, join } from "@visulima/path";
import type { StyleOptions } from "@visulima/rollup-css-plugin";
import type { LESSLoaderOptions } from "@visulima/rollup-css-plugin/less";
import {
    inferModeOption,
    inferSourceMapOption,
} from "@visulima/rollup-css-plugin/utils";
import type { OutputOptions } from "rollup";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PackemConfigProperties } from "../helpers";
import {
    createPackageJson,
    createPackemConfig,
    execPackem,
    installPackage,
} from "../helpers";

const fixturePath = join(__dirname, "../..", "__fixtures__", "css");

type BaseWriteData = {
    dependencies?: Record<string, string>;
    errorMessage?: string;
    files?: string[];
    input: string[] | string;
    minimizer?: "cssnano" | "lightningcss" | undefined;
    outDir?: string;
    outputOpts?: OutputOptions;
    packemPlugins?: PackemConfigProperties["plugins"];
    shouldFail?: boolean;
    title?: string;
};

type StringWriteData = BaseWriteData & {
    mode: StyleOptions["mode"];
    sourceMap?: StyleOptions["sourceMap"];
    styleOptions?: string;
};

type WriteData
    = | StringWriteData
        | (BaseWriteData & {
            styleOptions?: StyleOptions;
        });

interface WriteFailResult {
    exitCode: number;
    stderr: string;
}

interface WriteResult {
    css: () => string[];
    isCss: () => boolean;
    isFile: (file: string) => boolean;
    isMap: () => boolean;
    js: () => string[];
    map: () => string[];
}

describe.skipIf(process.env.PACKEM_PRODUCTION_BUILD)("css", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    const build = async (
        data: WriteData,
    ): Promise<WriteFailResult | WriteResult> => {
        const input = Array.isArray(data.input) ? data.input : [data.input];

        // copy fixtures to temporary directory
        cpSync(
            join(fixturePath, dirname(input[0] as string)),
            temporaryDirectoryPath,
            { recursive: true },
        );

        await installPackage(temporaryDirectoryPath, "minireset.css");

        const { loaders, ...otherOptions }
            = typeof data.styleOptions === "object" ? data.styleOptions : {};

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
            cssLoader: loaders ?? [
                "postcss",
                "less",
                "stylus",
                "sass",
                "sourcemap",
            ],
            cssOptions:
                typeof data.styleOptions === "string"
                    ? data.styleOptions
                    : otherOptions,
            minimizer: data.minimizer,
            plugins: data.packemPlugins,
            transformer: "esbuild",
        });

        await createPackageJson(temporaryDirectoryPath, {
            dependencies: data.dependencies ?? {},
            exports: input.map((file) => {
                const splitFile = file.split("/");
                const combinedFile = splitFile.slice(1).join("/");

                return {
                    import: `./src/${combinedFile}`.replace(".js", ".mjs"),
                    require: `./src/${combinedFile}`.replace(".js", ".cjs"),
                };
            }),
        });

        const binProcess = await execPackem("build", [], {
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

        const foundFiles: Dirent[] = await readdir(distributionPath, {
            recursive: true,
            withFileTypes: true,
        });

        const files: string[] = foundFiles
            .filter((dirent) => dirent.isFile())
            // @TODO: Change this readdir to @visulima/fs readdir
            .map((dirent) => join(dirent.path, dirent.name));

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

                return cssMap
                    .map((file) => isAccessibleSync(file))
                    .every(Boolean);
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

        const optionMode: StyleOptions["mode"]
            = typeof data.styleOptions === "object"
                ? data.styleOptions.mode
                : (data as StringWriteData).mode;
        const optionSourceMap: StyleOptions["sourceMap"]
            = typeof data.styleOptions === "object"
                ? data.styleOptions.sourceMap
                : (data as StringWriteData).sourceMap;

        const mode = inferModeOption(optionMode ?? "inject");

        if (mode.extract) {
            expect(result.isCss()).toBe(true);

            for (const f of result.css()) {
                expect(f).toMatchSnapshot("css");
            }
        }

        const sourceMap = inferSourceMapOption(optionSourceMap);

        if (sourceMap && !sourceMap.inline) {
            expect(result.isMap()).toBe(Boolean(mode.extract));

            for (const f of result.map()) {
                expect(f).toMatchSnapshot("map");
            }
        } else {
            expect(result.isMap()).toBe(false);
        }

        for (const file of data.files ?? []) {
            expect(result.isFile(file)).toBe(true);
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
                errorMessage:
                    "Incorrect mode provided, allowed modes are `inject`, `extract` or `emit`",
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
                errorMessage:
                    "plugins.filter(...) is not a function or its return value is not async iterable",
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
                        parser: join(
                            temporaryDirectoryPath,
                            "node_modules",
                            "sugarss",
                        ),
                    },
                },
                title: "postcss-options",
            },
        ] as WriteData[])(
            "should process $title css",
            async ({ title, ...data }: WriteData) => {
                // eslint-disable-next-line vitest/no-conditional-in-test
                if (title === "postcss-options") {
                    await installPackage(temporaryDirectoryPath, "sugarss");
                }

                // eslint-disable-next-line vitest/no-conditional-in-test
                if (
                    data.styleOptions
                    && (data.styleOptions as StyleOptions).alias
                ) {
                    for (const [key, value] of Object.entries(
                        (data.styleOptions as StyleOptions).alias as Record<
                            string,
                            string
                        >,
                    )) {
                        // this is needed because of the temporary directory path, that is generated on every test run

                        (
                            (data.styleOptions as StyleOptions).alias as Record<
                                string,
                                string
                            >
                        )[key] = value.replace(
                            "__REPLACE__",
                            temporaryDirectoryPath,
                        );
                    }
                }

                await validate(data);
            },
        );
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
        ] as WriteData[])(
            "should minimize processed $title css with $minimizer",
            async ({ minimizer, title, ...data }: WriteData) => {
                await validate({ ...data, minimizer });
            },
        );
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

                styleOptions: {
                    sourceMap: [
                        true,
                        { transform: (map) => (map.sources = ["virt"]) },
                    ],
                },
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

                styleOptions: {
                    sourceMap: [
                        "inline",
                        { transform: (m) => (m.sources = ["virt"]) },
                    ],
                },
                title: "inline-transform",
            },
        ] as WriteData[])(
            "should generate sourcemap for processed $title css",
            async ({ title, ...data }: WriteData) => {
                await validate(data);
            },
        );
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
                styleOptions: {
                    mode: [
                        "extract",
                        join("__REPLACE__", "src", "dist/wrong.css"),
                    ],
                },
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

                styleOptions: {
                    mode: "extract",
                    sourceMap: [
                        true,
                        { transform: (map) => (map.sources = ["virt"]) },
                    ],
                },
                title: "sourcemap-transform",
            },
            {
                input: "simple/index.js",
                styleOptions: { mode: "extract", sourceMap: "inline" },
                title: "sourcemap-inline",
            },
            {
                input: "simple/index.js",

                styleOptions: {
                    mode: "extract",
                    sourceMap: [
                        "inline",
                        { transform: (map) => (map.sources = ["virt"]) },
                    ],
                },
                title: "sourcemap-inline-transform",
            },
            {
                input: "simple/index.js",
                outputOpts: {
                    assetFileNames({ names }) {
                        const p = "[name][extname]";
                        const name = names[0];

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
        ] as WriteData[])(
            "should generate sourcemap for processed $title css",
            async ({ title, ...data }: WriteData) => {
                // eslint-disable-next-line vitest/no-conditional-in-test
                if (
                    data.styleOptions
                    && Array.isArray((data.styleOptions as StyleOptions).mode)
                ) {
                    // eslint-disable-next-line no-param-reassign
                    (data.styleOptions as StyleOptions).mode = [
                        (
                            (data.styleOptions as StyleOptions).mode as string[]
                        )[0] as "extract",
                        (
                            (
                                (data.styleOptions as StyleOptions)
                                    .mode as string[]
                            )[1] as string
                        ).replace("__REPLACE__", temporaryDirectoryPath),
                    ];
                }

                await validate(data);
            },
        );
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
                styleOptions:
                    // eslint-disable-next-line no-template-curly-in-string
                    "mode: [\"inject\", (varname, id) => `console.log(${varname},${JSON.stringify(id.replace(\"__REPLACE__\", \"\"))})`],",
                title: "function",
            },
        ] as WriteData[])(
            "should work with injected processed $title css",
            async ({ title, ...data }: WriteData) => {
                // this is needed because of the temporary directory path, that is generated on every test run
                // eslint-disable-next-line vitest/no-conditional-in-test
                if (typeof data.styleOptions === "string") {
                    // eslint-disable-next-line no-param-reassign
                    data.styleOptions = (data.styleOptions as string).replace(
                        "__REPLACE__",
                        temporaryDirectoryPath,
                    );
                }

                await validate(data);
            },
        );
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
                    sass: {
                        additionalData: "@import 'data';",
                        implementation: "sass-embedded",
                    },
                },
                title: "sass-embedded - data",
            },
            {
                input: "sass-data/index.js",
                styleOptions: {
                    sass: {
                        additionalData: "@import 'data';",
                        implementation: "sass",
                    },
                },
                title: "sass - data",
            },
            // @TODO Fix this test
            // {
            //     input: "sass-import/index.js",
            //     styleOptions: {
            //         sass: {
            //             implementation: "sass",
            //         },
            //     },
            //     title: "sass - import",
            // },
        ] as WriteData[])(
            "should work with sass/scss processed $title css",
            async ({ title, ...data }) => {
                await validate(data);
            },
        );
    });

    // eslint-disable-next-line vitest/no-disabled-tests
    describe.skip("stylus", () => {
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
        ] as WriteData[])(
            "should work with stylus processed $title css",
            async ({ title, ...data }: WriteData) => {
                await validate(data);
            },
        );
    });

    describe("less", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            // @TODO Fix this test
            // {
            //     input: "less-import/index.js",
            //     title: "import",
            // },
            // {
            //     input: "less-import/index.js",
            //     styleOptions: { mode: "extract", sourceMap: true },
            //     title: "sourcemap",
            // },
            {
                input: "less-paths/index.js",
                styleOptions: {
                    less: { paths: [join("__REPLACE__", "src", "sub")] },
                },
                title: "paths",
            },
        ] as WriteData[])(
            "should work with less processed $title css",
            async ({ title, ...data }: WriteData) => {
                // eslint-disable-next-line vitest/no-conditional-in-test
                if ((data.styleOptions as StyleOptions)?.less?.paths) {
                    for (
                        let index = 0;
                        index
                        < (
                            (
                                (data.styleOptions as StyleOptions)
                                    .less as LESSLoaderOptions
                            ).paths as string[]
                        ).length;
                        index++
                    ) {
                        // this is needed because of the temporary directory path, that is generated on every test run

                        ((
                            (
                                (data.styleOptions as StyleOptions)
                                    .less as LESSLoaderOptions
                            ).paths as string[]
                        )[index] as string) = (
                            (
                                (
                                    (data.styleOptions as StyleOptions)
                                        .less as LESSLoaderOptions
                                ).paths as string[]
                            )[index] as string
                        ).replace("__REPLACE__", temporaryDirectoryPath);
                    }
                }

                await validate(data);
            },
        );
    });

    describe("tailwind-oxide", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                dependencies: {
                    tailwindcss: "*",
                },
                input: "tailwind-oxide/index.js",
                styleOptions: {
                    loaders: ["tailwindcss"],
                },
                title: "basic",
            },
            {
                dependencies: {
                    tailwindcss: "*",
                },
                input: "tailwind-oxide/index.js",
                styleOptions: {
                    loaders: ["tailwindcss"],
                    mode: "extract",
                },
                title: "extract",
            },
            {
                dependencies: {
                    tailwindcss: "*",
                },
                input: "tailwind-oxide/index.js",
                styleOptions: {
                    loaders: ["tailwindcss"],
                    mode: "extract",
                    sourceMap: true,
                },
                title: "extract-sourcemap",
            },
            {
                dependencies: {
                    tailwindcss: "*",
                },
                input: "tailwind-oxide/index.js",
                styleOptions: {
                    loaders: ["tailwindcss"],
                    mode: "extract",
                    sourceMap: "inline",
                },
                title: "extract-sourcemap-inline",
            },
            {
                dependencies: {
                    "rollup-plugin-lit-css": "*",
                    tailwindcss: "*",
                },
                input: "tailwind-oxide/index.js",
                packemPlugins: [
                    {
                        code: "litCss()",
                        from: "rollup-plugin-lit-css",
                        importName: "litCss",
                        namedExport: true,
                        when: "after",
                    },
                ],
                styleOptions: {
                    loaders: ["tailwindcss"],
                    mode: "emit",
                },
                title: "emit",
            },
            {
                dependencies: {
                    "rollup-plugin-lit-css": "*",
                    tailwindcss: "*",
                },
                input: "tailwind-oxide/index.js",
                packemPlugins: [
                    {
                        code: "litCss()",
                        from: "rollup-plugin-lit-css",
                        importName: "litCss",
                        namedExport: true,
                        when: "after",
                    },
                ],
                styleOptions: {
                    loaders: ["tailwindcss"],
                    mode: "emit",
                    sourceMap: true,
                },
                title: "emit-sourcemap",
            },
            {
                dependencies: {
                    "rollup-plugin-lit-css": "*",
                    tailwindcss: "*",
                },
                input: "tailwind-oxide/index.js",
                packemPlugins: [
                    {
                        code: "litCss()",
                        from: "rollup-plugin-lit-css",
                        importName: "litCss",
                        namedExport: true,
                        when: "after",
                    },
                ],
                styleOptions: {
                    loaders: ["tailwindcss"],
                    mode: "emit",
                    sourceMap: "inline",
                },
                title: "emit-sourcemap-inline",
            },
        ] as WriteData[])(
            "should work with tailwind-oxide processed $title css",
            async ({ title, ...data }: WriteData) => {
                await installPackage(temporaryDirectoryPath, "tailwindcss");

                // eslint-disable-next-line vitest/no-conditional-in-test
                if (data.styleOptions.mode === "emit") {
                    await installPackage(
                        temporaryDirectoryPath,
                        "rollup-plugin-lit-css",
                    );
                }

                await validate(data);
            },
        );
    });

    describe("css-modules", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                input: "modules/index.js",
                styleOptions: {
                    postcss: {
                        modules: true,
                    },
                },
                title: "inject",
            },
            {
                input: "modules/index.js",
                mode: [
                    "inject",
                    (varname, id) =>
                        `console.log(${varname}, ${JSON.stringify(typeof id === "string")})`,
                ],
                styleOptions: `
                    mode: ["inject", (varname, id) => \`console.log(\${varname}, \${JSON.stringify(typeof id === "string")})\`],
                    modules: true,
                `,
                title: "inject-fn",
            },
            {
                input: "modules/index.js",
                styleOptions: {
                    mode: ["inject", { treeshakeable: true }],
                    postcss: {
                        modules: true,
                    },
                },
                title: "inject-treeshakeable",
            },
            {
                errorMessage:
                    "`inject` keyword is reserved when using `inject.treeshakeable` option",
                input: "keyword-fail/index.js",
                shouldFail: true,
                styleOptions: {
                    mode: ["inject", { treeshakeable: true }],
                    postcss: {
                        modules: true,
                    },
                },
                title: "inject-treeshakeable-keyword-fail",
            },
            // @TODO Add dts
            // {
            //     input: "modules/index.js",
            //     styleOptions: { dts: true, mode: ["inject", { treeshakeable: true }], postcss: {
            //             modules: true,
            //         }, },
            //     title: "inject-treeshakeable-dts",
            // },
            {
                input: "modules-duplication/index.js",
                styleOptions: `modules: { generateScopedName: (name) => \`\${name}hacked\` }`,
                title: "generate-scoped-name",
            },
            {
                input: "named-exports/index.js",
                styleOptions: { modules: true, namedExports: true },
                title: "named-exports",
            },
            {
                input: "named-exports/index.js",
                shouldFail: true,
                styleOptions: {
                    mode: ["inject", { treeshakeable: true }],
                    namedExports: true,
                    postcss: {
                        modules: true,
                    },
                },
                title: "named-exports-treeshakeable-fail",
            },
            {
                input: "treeshake-module/index.js",
                styleOptions: {
                    mode: ["inject", { treeshakeable: true }],
                    namedExports: true,
                    postcss: {
                        modules: true,
                    },
                },
                title: "treeshake-module",
            },
            // @TODO Add dts
            // {
            //     input: "named-exports/index.js",
            //     styleOptions: { dts: true, postcss: {
            //             modules: true,
            //         }, namedExports: true },
            //     title: "named-exports-dts",
            // },
            {
                input: "named-exports/index.js",
                styleOptions: `
                    modules: true,
                    namedExports: (name) => \`\${name}hacked\`,
                `,
                title: "named-exports-custom-class-name",
            },
            {
                input: "modules/index.js",
                styleOptions: {
                    mode: "extract",
                    postcss: {
                        modules: true,
                    },
                },
                title: "extract",
            },
            {
                input: "modules/index.js",
                styleOptions: {
                    mode: "extract",
                    postcss: {
                        modules: true,
                    },
                    sourceMap: true,
                },
                title: "extract-sourcemap-true",
            },
            {
                input: "modules/index.js",
                styleOptions: {
                    mode: "extract",
                    postcss: {
                        modules: true,
                    },
                    sourceMap: "inline",
                },
                title: "extract-sourcemap-inline",
            },
            {
                input: "auto-modules/index.js",
                styleOptions: { autoModules: true },
                title: "auto-modules",
            },
            {
                input: "auto-modules/index.js",
                styleOptions: { autoModules: false },
                title: "auto-modules-off",
            },
            {
                input: "auto-modules/index.js",
                styleOptions: { autoModules: /(?<!\.module\.)\.styl/ },
                title: "auto-modules-regexp",
            },
            {
                input: "auto-modules/index.js",
                styleOptions: `autoModules: (id) => id.endsWith(".less")`,
                title: "auto-modules-fn",
            },
            {
                input: "modules-duplication/index.js",
                styleOptions: {
                    mode: "extract",
                    postcss: {
                        modules: true,
                    },
                },
                title: "duplication",
            },
        ] as WriteData[])(
            "should work with processed modules $title css",
            async ({ title, ...data }: WriteData) => {
                await validate(data);
            },
        );
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
                input: [
                    "code-splitting/index.js",
                    "code-splitting/indextwo.js",
                ],
                outputOpts: { preserveModules: true },
                styleOptions: {
                    mode: "extract",
                    sourceMap: true,
                },
                title: "preserve-modules-multi-entry",
            },
            {
                input: [
                    "code-splitting/index.js",
                    "code-splitting/indextwo.js",
                ],
                styleOptions: {
                    mode: "extract",
                    sourceMap: true,
                },
                title: "multi-entry",
            },
            {
                input: [
                    "code-splitting/index.js",
                    "code-splitting/indextwo.js",
                ],
                styleOptions: {
                    mode: ["extract", "extracted.css"],
                    sourceMap: true,
                },
                title: "multi-entry-single",
            },
        ] as WriteData[])(
            "should work with processed $title css",
            async ({ title, ...data }: WriteData) => {
                await validate(data);
            },
        );
    });

    it("should work with onExtract function", async () => {
        expect.assertions(7);

        const result = (await build({
            input: "simple/index.js",
            mode: "extract",
            styleOptions: `mode: "extract",
            onExtract(): boolean {
                return false;
            },`,
        })) as WriteResult;

        for (const f of result.js()) {
            expect(f).toMatchSnapshot("js");
        }

        expect(result.isCss()).toBe(false);
        expect(result.isMap()).toBe(false);
    });

    describe("emit", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                dependencies: {
                    "rollup-plugin-lit-css": "*",
                },
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
                styleOptions: {
                    mode: "emit",
                    plugins: [
                        ["autoprefixer", { overrideBrowserslist: ["> 0%"] }],
                    ],
                },
                title: "basic-emit",
            },
            {
                dependencies: {
                    "rollup-plugin-lit-css": "*",
                },
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
                dependencies: {
                    "rollup-plugin-lit-css": "*",
                },
                input: "emit/index.js",
                mode: "emit",
                packemPlugins: [
                    {
                        code: "litCss()",
                        from: "rollup-plugin-lit-css",
                        importName: "litCss",
                        namedExport: true,
                        when: "after",
                    },
                ],

                sourceMap: [
                    true,
                    { transform: (map) => (map.sources = ["virt"]) },
                ],
                styleOptions: `mode: "emit", sourceMap: [true, { transform: (m) => (m.sources = ["virt"]) }]`,
                title: "sourcemap-transform",
            },
            {
                input: "emit-with-modules/index.js",
                packemPlugins: [
                    {
                        code: `{
                            name: "expose-styles-meta",
                            transform(_code, id) {
                                const stylesMeta = this.getModuleInfo(id)?.meta.styles;

                                if (stylesMeta) {
                                    const { icssDependencies = [], moduleContents = "" } = stylesMeta;
                                    return \`export var deps = \${JSON.stringify(icssDependencies)};\\n\${moduleContents}\`;
                                }
                            },
                        }`,
                        when: "after",
                    },
                ],
                styleOptions: {
                    mode: "emit",
                    postcss: {
                        modules: true,
                    },
                },
                title: "meta",
            },
        ] as WriteData[])(
            "should work with emitted processed $title css",
            async ({ title, ...data }: WriteData) => {
                await installPackage(temporaryDirectoryPath, "lit");

                // eslint-disable-next-line vitest/no-conditional-in-test
                if (data.dependencies !== undefined) {
                    await installPackage(
                        temporaryDirectoryPath,
                        "rollup-plugin-lit-css",
                    );
                }

                await validate(data);
            },
        );
    });
});
