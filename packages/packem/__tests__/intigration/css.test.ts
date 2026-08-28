import type { Dirent } from "node:fs";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { isAccessibleSync, readFileSync } from "@visulima/fs";
import { dirname, join } from "@visulima/path";
import type { StyleOptions } from "@visulima/rollup-plugin-css";
import { inferModeOption, inferSourceMapOption } from "@visulima/rollup-plugin-css/utils";
import type { OutputOptions } from "rollup";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PackemConfigProperties } from "../helpers";
import { createPackageJson, createPackemConfig, execPackem, expectNoUnexpectedStderrWarnings, installPackage, normalizeRolldownOutput } from "../helpers";

const fixturePath = join(__dirname, "../..", "__fixtures__", "css");

const CSS_DTS_SUFFIX_REGEX = /\.css\.d\.ts$/;

// Warnings the css fixtures legitimately provoke on stderr. These are advisories from the
// bundler's css plugin and from packem itself — not build failures — and were always emitted;
// before @visulima/pail 4.0.0 fixed its RFC5424 stream routing they merely leaked to stdout.
// The css suite asserts CSS *output*, so tolerate these known-benign warning lines and fail
// only on unexpected warnings (or a non-zero exit code, asserted separately):
//   • sass `@import`/legacy deprecation notices
//   • css-modules identifier sanitization ("Exported `x` as `_y`")
//   • url resolution of intentionally-missing assets ("Unresolved URL")
//   • demo deps imported by fixtures but not declared (e.g. `lit`)
//   • multi-entry css chunks that share an output name
const CSS_BENIGN_STDERR_WARNING_REGEX =
    /Deprecation Warning|repetitive deprecation warnings omitted|Exported `[^`]+` as `[^`]+`|Unresolved URL|but not declared in package\.json|ould not (?:be )?resolve|overwrites a previously emitted file/;

const AUTO_MODULES_STYL_REGEX = /(?<!\.module\.)\.styl/;

// `minireset.css` is pnpm-installed as a symlink into the content-addressable
// store, whose absolute location is machine-specific (`/home/<user>/…` locally,
// `/home/runner/work/packem/packem/…` on CI). The sourcemap relativizes against
// that realpath, so the climbed-out store path leaks into the snapshot. Rewrite
// it to the stable project-local form the `~minireset.css/…` import resolves to,
// matching how the local `node_modules/foo/bar/*` sources already appear.
const MINIRESET_STORE_PATH_REGEX = /(?:\.\.\/)+[^"]*?\/node_modules\/\.pnpm\/minireset\.css@[^"/]+\/node_modules\/minireset\.css\/minireset\.min\.css/g;

const normalizeSourceMap = (content: string): string => content.replaceAll(MINIRESET_STORE_PATH_REGEX, "../node_modules/minireset.css/minireset.min.css");

type BaseWriteData = {
    dependencies?: Record<string, string>;
    errorMessage?: string;
    files?: string[];
    input: string[] | string;
    minimizer?: "cssnano" | "lightningcss";
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

type WriteData =
    | StringWriteData
    | (BaseWriteData & {
          styleOptions?: StyleOptions;
      });

interface WriteFailResult {
    exitCode: number;
    stderr: string;
}

interface WriteResult {
    css: () => string[];
    dts: () => string[];
    isCss: () => boolean;
    isDts: () => boolean;
    isFile: (file: string) => boolean;
    isMap: () => boolean;
    js: () => string[];
    map: () => string[];
}

describe.skipIf(process.env.PACKEM_PRODUCTION_BUILD)("css", () => {
    let temporaryDirectoryPath: string;

    beforeEach(() => {
        // Resolve the realpath so the temp dir matches the module ids packem/rollup
        // operate on. On macOS tmpdir() returns /var/folders/... but the resolved id
        // is /private/var/folders/...; the 'function' inject test strips this prefix
        // from the id, which only works when both sides use the same (real) path.
        temporaryDirectoryPath = realpathSync(mkdtempSync(join(tmpdir(), "packem-css-")));
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    const build = async (data: WriteData): Promise<WriteFailResult | WriteResult> => {
        const input = Array.isArray(data.input) ? data.input : [data.input];

        // copy fixtures to temporary directory
        cpSync(join(fixturePath, dirname(input[0])), temporaryDirectoryPath, { recursive: true });

        await installPackage(temporaryDirectoryPath, "minireset.css");

        const { loaders, ...otherOptions } = typeof data.styleOptions === "object" ? data.styleOptions : {};

        // The config property resolves to a recursive deep-partial of the full build
        // options type. Contextually checking the inline object literal against that
        // mapped type makes tsc exceed its instantiation depth (TS2589). The shape the
        // test actually exercises is just rollup.output, so we build it through a narrow
        // local type that the config alias still accepts.
        const rollupOutputConfig: { rollup: { output: OutputOptions } } | undefined = data.outputOpts
            ? {
                  rollup: {
                      output: {
                          ...data.outputOpts,
                      },
                  },
              }
            : undefined;

        const packemConfigProperties: PackemConfigProperties = {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- the assertion is required: without it tsc exceeds its instantiation depth on the recursive deep-partial build config type and fails with TS2589; eslint's checker does not hit that depth so it misreports the cast as unnecessary.
            config: rollupOutputConfig as PackemConfigProperties["config"],
            cssLoader: (loaders as PackemConfigProperties["cssLoader"]) ?? ["postcss", "less", "stylus", "sass", "sourcemap"],
            cssOptions: typeof data.styleOptions === "string" ? data.styleOptions : otherOptions,
            minimizer: data.minimizer,
            plugins: data.packemPlugins,
            transformer: "esbuild",
        };

        await createPackemConfig(temporaryDirectoryPath, packemConfigProperties);

        await createPackageJson(temporaryDirectoryPath, {
            dependencies: data.dependencies ?? {},
            // type-fest@0.20.2's `Exports` predates the array fallback form.
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

        expectNoUnexpectedStderrWarnings(binProcess.stderr as string, [CSS_BENIGN_STDERR_WARNING_REGEX]);

        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toSatisfy((content: string) => {
            const matches: string[] = [];

            // A fresh /g instance is required here: the loop below mutates
            // `lastIndex` to walk every match, so this regex is inherently
            // stateful and must not be shared at module scope across calls.
            const regex = /: Unresolved URL.*/g;
            let match: RegExpExecArray | null = regex.exec(content);

            while (match !== null) {
                // This is necessary to avoid infinite loops with zero-width matches
                if (match.index === regex.lastIndex) {
                    regex.lastIndex += 1;
                }

                for (const m of match) {
                    if (!m.includes("./nonexistant")) {
                        matches.push(m);
                    }
                }

                match = regex.exec(content);
            }

            return !matches.some(Boolean);
        });

        const distributionPath = join(temporaryDirectoryPath, "dist");

        const foundFiles: Dirent[] = await readdir(distributionPath, {
            recursive: true,
            withFileTypes: true,
        });

        const files: string[] = foundFiles
            .filter((dirent) => dirent.isFile())
            // @TODO: Change this readdir to @visulima/fs readdir
            .map((dirent) => join(dirent.parentPath, dirent.name));

        const css = files.filter((file) => file.endsWith(".css"));
        const cssMap = files.filter((file) => file.endsWith(".css.map"));
        const cjs = files.filter((file) => file.endsWith(".cjs"));
        const mjs = files.filter((file) => file.endsWith(".mjs"));

        // CSS module .d.ts files are written next to the source CSS,
        // so they live in the temp dir (not dist).
        const sourceFiles: Dirent[] = await readdir(temporaryDirectoryPath, {
            recursive: true,
            withFileTypes: true,
        });
        const dts = sourceFiles
            .filter((dirent) => dirent.isFile())
            .map((dirent) => join(dirent.parentPath, dirent.name))
            .filter((file) => CSS_DTS_SUFFIX_REGEX.test(file) && !file.includes(`${temporaryDirectoryPath}/dist/`))
            .toSorted((a, b) => a.localeCompare(b));

        return {
            css(): string[] {
                return css.map((file) => readFileSync(file));
            },
            dts(): string[] {
                return dts.map((file) => readFileSync(file));
            },
            isCss(): boolean {
                if (css.length === 0) {
                    return false;
                }

                return css.map((file) => isAccessibleSync(file)).every(Boolean);
            },
            isDts(): boolean {
                if (dts.length === 0) {
                    return false;
                }

                return dts.map((file) => isAccessibleSync(file)).every(Boolean);
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
                return cssMap.map((file) => normalizeSourceMap(readFileSync(file)));
            },
        };
    };

    const expectFailure = async (data: WriteData): Promise<void> => {
        const result = (await build(data)) as WriteFailResult;

        expect(result.stderr).toContain(data.errorMessage);
        expect(result.exitCode).toBe(1);
    };

    const assertCssSnapshots = (result: WriteResult, mode: ReturnType<typeof inferModeOption>): void => {
        if (!mode.extract) {
            return;
        }

        expect(result.isCss()).toBe(true);

        for (const f of result.css()) {
            expect(f).toMatchSnapshot("css");
        }
    };

    const assertSourceMapSnapshots = (
        result: WriteResult,
        mode: ReturnType<typeof inferModeOption>,
        sourceMap: ReturnType<typeof inferSourceMapOption>,
    ): void => {
        if (sourceMap && !sourceMap.inline) {
            expect(result.isMap()).toBe(Boolean(mode.extract));

            for (const f of result.map()) {
                expect(f).toMatchSnapshot("map");
            }

            return;
        }

        expect(result.isMap()).toBe(false);
    };

    const assertDtsSnapshots = (result: WriteResult, optionDts: boolean | undefined): void => {
        if (!optionDts) {
            return;
        }

        expect(result.isDts()).toBe(true);

        for (const f of result.dts()) {
            expect(f).toMatchSnapshot("dts");
        }
    };

    const validate = async (data: WriteData): Promise<void> => {
        if (data.shouldFail) {
            await expectFailure(data);

            return;
        }

        const result = (await build(data)) as WriteResult;

        for (const f of result.js()) {
            expect(normalizeRolldownOutput(f)).toMatchSnapshot("js");
        }

        const optionMode: StyleOptions["mode"] = typeof data.styleOptions === "object" ? data.styleOptions.mode : (data as StringWriteData).mode;
        const optionSourceMap: StyleOptions["sourceMap"] =
            typeof data.styleOptions === "object" ? data.styleOptions.sourceMap : (data as StringWriteData).sourceMap;

        const mode = inferModeOption(optionMode ?? "inject");

        assertCssSnapshots(result, mode);
        assertSourceMapSnapshots(result, mode, inferSourceMapOption(optionSourceMap));

        const optionDts: boolean | undefined = typeof data.styleOptions === "object" ? data.styleOptions.dts : undefined;

        assertDtsSnapshots(result, optionDts);

        for (const file of data.files ?? []) {
            expect(result.isFile(file)).toBe(true);
        }
    };

    const validateCrossFolder = async (data: WriteData): Promise<void> => {
        if (data.shouldFail) {
            const result = (await build(data)) as WriteFailResult;

            expect(result.stderr).toContain(data.errorMessage);
            expect(result.exitCode).toBe(1);

            return;
        }

        const result = (await build(data)) as WriteResult;

        for (const f of result.js()) {
            expect(normalizeRolldownOutput(f)).toMatchSnapshot("js");
        }

        const optionMode: StyleOptions["mode"] = typeof data.styleOptions === "object" ? data.styleOptions.mode : (data as StringWriteData).mode;
        const optionSourceMap: StyleOptions["sourceMap"] =
            typeof data.styleOptions === "object" ? data.styleOptions.sourceMap : (data as StringWriteData).sourceMap;

        const mode = inferModeOption(optionMode ?? "inject");

        if (mode.extract) {
            expect(result.isCss()).toBe(true);

            // Check that all expected classes from cross-folder components are present
            const cssContent = result.css().join("\n");

            // Button component classes
            expect(cssContent).toContain(".btn");
            expect(cssContent).toContain(".btn-primary");
            expect(cssContent).toContain(".btn-secondary");

            // Card component classes
            expect(cssContent).toContain(".card");
            expect(cssContent).toContain(".card-title");
            expect(cssContent).toContain(".card-content");

            // Header component classes
            expect(cssContent).toContain(".header");
            expect(cssContent).toContain(".header-container");
            expect(cssContent).toContain(".header-title");
            expect(cssContent).toContain(".header-subtitle");

            // Footer component classes
            expect(cssContent).toContain(".footer");
            expect(cssContent).toContain(".footer-container");
            expect(cssContent).toContain(".footer-content");
            expect(cssContent).toContain(".footer-copyright");
            expect(cssContent).toContain(".footer-nav");
            expect(cssContent).toContain(".footer-links");
            expect(cssContent).toContain(".footer-link-item");
            expect(cssContent).toContain(".footer-link");

            // Utility classes that should be generated
            expect(cssContent).toContain(".bg-blue-600");
            expect(cssContent).toContain(String.raw`.hover\:bg-blue-700`);
            expect(cssContent).toContain(".text-white");
            expect(cssContent).toContain(".transition-all");
            expect(cssContent).toContain(".duration-200");

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
                errorMessage: "Incorrect mode provided, allowed modes are `inject`, `extract`, `emit` or `inline`",
                input: "simple/index.js",
                shouldFail: true,
                // Intentionally invalid mode to exercise the validation error path.
                styleOptions: { mode: "mash" as unknown as StyleOptions["mode"] },
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
                styleOptions: { postcss: { plugins: ["pulverizer"] } },
                title: "plugin-fail",
            },
            {
                errorMessage: "plugins.filter is not a function or its return value is not iterable",
                input: "simple/index.js",
                shouldFail: true,
                // Intentionally invalid (string instead of array) to exercise the error path.
                styleOptions: { postcss: { plugins: "pulverizer" as unknown as NonNullable<StyleOptions["postcss"]>["plugins"] } },
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

            const { styleOptions } = data;
            const alias = typeof styleOptions === "object" ? styleOptions.alias : undefined;

            let resolvedData: WriteData = data;

            // The temporary directory path is generated on every test run, so
            // substitute the placeholder into a fresh copy rather than mutating
            // the shared test-case data object.
            // eslint-disable-next-line vitest/no-conditional-in-test -- per-case alias substitution depends on the test-case data; this is setup, not branched assertions.
            if (alias) {
                const resolvedAlias: Record<string, string> = {};

                for (const [key, value] of Object.entries(alias)) {
                    resolvedAlias[key] = value.replace("__REPLACE__", temporaryDirectoryPath);
                }

                resolvedData = { ...data, styleOptions: { ...(styleOptions as StyleOptions), alias: resolvedAlias } };
            }

            await validate(resolvedData);
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
            {
                input: "simple/index.js",
                minimizer: "cssnano" as const,
                styleOptions: { mode: "inline" },
                title: "inline",
            },
            {
                input: "simple/index.js",
                minimizer: "cssnano" as const,
                styleOptions: {
                    mode: "inline",
                    namedExports: true,
                },
                title: "inline-named-exports",
            },
            {
                input: "auto-modules/index.js",
                minimizer: "cssnano" as const,
                styleOptions: {
                    autoModules: true,
                    mode: "inline",
                },
                title: "inline-auto-modules",
            },
            {
                input: "modules/index.js",
                minimizer: "cssnano" as const,
                styleOptions: {
                    mode: "inline",
                    postcss: {
                        modules: true,
                    },
                },
                title: "inline-modules",
            },
            {
                input: "simple/index.js",
                minimizer: "lightningcss" as const,
                styleOptions: { mode: "inline" },
                title: "inline-lightningcss",
            },
            {
                input: "simple/index.js",
                minimizer: "lightningcss" as const,
                styleOptions: {
                    mode: "inline",
                    namedExports: true,
                },
                title: "inline-named-exports-lightningcss",
            },
            {
                input: "auto-modules/index.js",
                minimizer: "lightningcss" as const,
                styleOptions: {
                    autoModules: true,
                    mode: "inline",
                },
                title: "inline-auto-modules-lightningcss",
            },
            {
                input: "modules/index.js",
                minimizer: "lightningcss" as const,
                styleOptions: {
                    mode: "inline",
                    postcss: {
                        modules: true,
                    },
                },
                title: "inline-modules-lightningcss",
            },
        ] as WriteData[])("should minimize processed $title css with $minimizer", async ({ minimizer, title: _title, ...data }: WriteData) => {
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

                styleOptions: {
                    sourceMap: [true, { transform: (map) => Object.assign(map, { sources: ["virt"] }) }],
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
                    sourceMap: ["inline", { transform: (m) => Object.assign(m, { sources: ["virt"] }) }],
                },
                title: "inline-transform",
            },
            {
                input: "simple/index.js",
                styleOptions: { mode: "inline", sourceMap: true },
                title: "inline-true",
            },
            {
                input: "simple/index.js",
                styleOptions: {
                    mode: "inline",
                    sourceMap: [true, { content: false }],
                },
                title: "inline-no-content",
            },
            {
                input: "simple/index.js",
                styleOptions: {
                    mode: "inline",
                    sourceMap: [true, { transform: (map) => Object.assign(map, { sources: ["virt"] }) }],
                },
                title: "inline-transform",
            },
            {
                input: "simple/index.js",
                styleOptions: { mode: "inline", sourceMap: "inline" },
                title: "inline-inline",
            },
            {
                input: "simple/index.js",
                styleOptions: {
                    mode: "inline",
                    sourceMap: ["inline", { content: false }],
                },
                title: "inline-inline-no-content",
            },
            {
                input: "simple/index.js",
                styleOptions: {
                    mode: "inline",
                    sourceMap: ["inline", { transform: (m) => Object.assign(m, { sources: ["virt"] }) }],
                },
                title: "inline-inline-transform",
            },
            {
                input: "auto-modules/index.js",
                styleOptions: {
                    autoModules: true,
                    mode: "inline",
                    sourceMap: true,
                },
                title: "inline-auto-modules-sourcemap",
            },
            {
                input: "modules/index.js",
                styleOptions: {
                    mode: "inline",
                    postcss: {
                        modules: true,
                    },
                    sourceMap: true,
                },
                title: "inline-modules-sourcemap",
            },
        ] as WriteData[])("should generate sourcemap for processed $title css", async ({ title: _title, ...data }: WriteData) => {
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
                errorMessage: "Extraction path must be relative to the output directory,",
                input: "simple/index.js",
                shouldFail: true,
                styleOptions: {
                    mode: ["extract", join("__REPLACE__", "src", "dist/wrong.css")],
                },
                title: "absolute-path-fail",
            },
            {
                errorMessage: "Extraction path must be nested inside output directory,",
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
                    sourceMap: [true, { transform: (map) => Object.assign(map, { sources: ["virt"] }) }],
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
                    sourceMap: ["inline", { transform: (map) => Object.assign(map, { sources: ["virt"] }) }],
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
        ] as WriteData[])("should generate sourcemap for processed $title css", async ({ title: _title, ...data }: WriteData) => {
            // eslint-disable-next-line vitest/no-conditional-in-test
            if (data.styleOptions && Array.isArray((data.styleOptions as StyleOptions).mode)) {
                // eslint-disable-next-line no-param-reassign
                (data.styleOptions as StyleOptions).mode = [
                    ((data.styleOptions as StyleOptions).mode as string[])[0],
                    ((data.styleOptions as StyleOptions).mode as string[])[1].replace("__REPLACE__", temporaryDirectoryPath),
                ] as StyleOptions["mode"];
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
                styleOptions:
                    // eslint-disable-next-line no-template-curly-in-string, no-secrets/no-secrets -- this is a literal JS injector snippet written into the test packem config, not a credential; its high char entropy is incidental.
                    'mode: ["inject", (varname, id) => `console.log(${varname},${JSON.stringify(id.replace("__REPLACE__", ""))})`],',
                title: "function",
            },
        ] as WriteData[])("should work with injected processed $title css", async ({ title: _title, ...data }: WriteData) => {
            // this is needed because of the temporary directory path, that is generated on every test run
            // eslint-disable-next-line vitest/no-conditional-in-test
            if (typeof data.styleOptions === "string") {
                // eslint-disable-next-line no-param-reassign
                data.styleOptions = data.styleOptions.replace("__REPLACE__", temporaryDirectoryPath);
            }

            await validate(data);
        });
    });

    describe("inline", () => {
        // eslint-disable-next-line vitest/expect-expect,vitest/prefer-expect-assertions
        it.each([
            {
                input: "simple/index.js",
                styleOptions: { mode: "inline" },
                title: "basic",
            },
            {
                input: "simple/index.js",
                styleOptions: { mode: "inline", namedExports: true },
                title: "named-exports",
            },
            {
                input: "auto-modules/index.js",
                styleOptions: { autoModules: true, mode: "inline" },
                title: "auto-modules",
            },
            {
                input: "auto-modules/index.js",
                styleOptions: { autoModules: true, mode: "inline", namedExports: true },
                title: "auto-modules-named-exports",
            },
            {
                input: "modules/index.js",
                styleOptions: {
                    mode: "inline",
                    postcss: {
                        modules: true,
                    },
                },
                title: "modules",
            },
            {
                input: "modules/index.js",
                styleOptions: {
                    mode: "inline",
                    namedExports: true,
                    postcss: {
                        modules: true,
                    },
                },
                title: "modules-named-exports",
            },
            {
                input: "named-exports/index.js",
                styleOptions: {
                    mode: "inline",
                    namedExports: true,
                    postcss: {
                        modules: true,
                    },
                },
                title: "modules-custom-named-exports",
            },
            {
                input: "simple/index.js",
                styleOptions: {
                    mode: "inline",
                    sourceMap: true,
                },
                title: "inline-sourcemap",
            },
            {
                input: "simple/index.js",
                styleOptions: {
                    mode: "inline",
                    sourceMap: "inline",
                },
                title: "inline-sourcemap-inline",
            },
        ] as WriteData[])("should work with inline processed $title css", async ({ title: _title, ...data }: WriteData) => {
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
            {
                input: "sass-import/index.js",
                styleOptions: {
                    sass: {
                        implementation: "sass",
                    },
                },
                title: "sass - import",
            },
        ] as WriteData[])("should work with sass/scss processed $title css", async ({ title: _title, ...data }) => {
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
            {
                input: "stylus-options/index.js",
                styleOptions: {
                    stylus: {
                        additionalData: "primary-color = #bada55\nsecondary-color = #111\nmy-z-index = 5",
                    },
                },
                title: "additional-data-string",
            },
            {
                input: "stylus-options/index.js",
                styleOptions: {
                    stylus: {
                        additionalData: "@import '_data'",
                    },
                },
                title: "additional-data-import",
            },
            {
                // Numeric define value — stylus JS strings render as quoted literals,
                // so use a number here to keep the snapshot clean. Color definitions
                // are better expressed via `additionalData` or by passing a stylus
                // Color node.
                input: "stylus-options/index.js",
                styleOptions: {
                    stylus: {
                        additionalData: "primary-color = red\nsecondary-color = blue",
                        define: {
                            "my-z-index": 99,
                        },
                    },
                },
                title: "define",
            },
            {
                input: "stylus-options/index.js",
                styleOptions: {
                    stylus: {
                        import: ["./_data"],
                    },
                },
                title: "import-option",
            },
        ] as WriteData[])("should work with stylus processed $title css", async ({ title: _title, ...data }: WriteData) => {
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
                styleOptions: {
                    less: { paths: [join("__REPLACE__", "src", "sub")] },
                },
                title: "paths",
            },
        ] as WriteData[])("should work with less processed $title css", async ({ title: _title, ...data }: WriteData) => {
            const styleOptions = typeof data.styleOptions === "object" ? data.styleOptions : undefined;
            const lessOptions = styleOptions?.less;
            const paths = lessOptions?.paths;

            let resolvedData: WriteData = data;

            // The temporary directory path is generated on every test run, so
            // substitute the placeholder into a fresh copy rather than mutating
            // the shared test-case data object.
            // eslint-disable-next-line vitest/no-conditional-in-test -- per-case less path substitution depends on the test-case data; this is setup, not branched assertions.
            if (paths) {
                const resolvedPaths = paths.map((path) => path.replace("__REPLACE__", temporaryDirectoryPath));

                resolvedData = {
                    ...data,
                    styleOptions: { ...(styleOptions as StyleOptions), less: { ...lessOptions, paths: resolvedPaths } },
                };
            }

            await validate(resolvedData);
        });
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
                    loaders: ["tailwindcss"] as unknown as StyleOptions["loaders"],
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
            {
                dependencies: {
                    tailwindcss: "*",
                },
                input: "tailwind-oxide-cross-folder/index.js",
                styleOptions: {
                    loaders: ["tailwindcss"] as unknown as StyleOptions["loaders"],
                    mode: "extract",
                },
                title: "cross-folder-extract",
            },
            {
                dependencies: {
                    tailwindcss: "*",
                },
                input: "tailwind-oxide-cross-folder/index.js",
                styleOptions: {
                    loaders: ["tailwindcss"],
                    mode: "extract",
                    sourceMap: true,
                },
                title: "cross-folder-extract-sourcemap",
            },
            {
                dependencies: {
                    tailwindcss: "*",
                },
                input: "tailwind-oxide-cross-folder/index.js",
                styleOptions: {
                    loaders: ["tailwindcss"],
                    mode: "extract",
                    sourceMap: "inline",
                },
                title: "cross-folder-extract-sourcemap-inline",
            },
        ] as unknown as WriteData[])("should work with tailwind-oxide processed $title css", async (data: WriteData) => {
            await installPackage(temporaryDirectoryPath, "tailwindcss");

            // eslint-disable-next-line vitest/no-conditional-in-test
            if (typeof data.styleOptions === "object" && data.styleOptions.mode === "emit") {
                await installPackage(temporaryDirectoryPath, "rollup-plugin-lit-css");
            }

            // Use cross-folder validation for cross-folder tests
            await (data.title?.includes("cross-folder") ? validateCrossFolder(data) : validate(data));
        });
    });

    describe("tailwind-oxide-cross-folder", () => {
        it("should discover and include all classes from components in different folders", async () => {
            expect.assertions(25);

            await installPackage(temporaryDirectoryPath, "tailwindcss");

            const result = (await build({
                dependencies: {
                    tailwindcss: "*",
                },
                input: "tailwind-oxide-cross-folder/index.js",
                styleOptions: {
                    loaders: ["tailwindcss"] as unknown as StyleOptions["loaders"],
                    mode: "extract",
                },
            })) as WriteResult;

            expect(result.isCss()).toBe(true);
            expect(result.isMap()).toBe(false);

            const cssContent = result.css().join("\n");

            // Verify component-specific classes are present
            const componentClasses = [
                // Button component
                ".btn",
                ".btn-primary",
                ".btn-secondary",
                // Card component
                ".card",
                ".card-title",
                ".card-content",
                // Header component
                ".header",
                ".header-container",
                ".header-title",
                ".header-subtitle",
                // Footer component
                ".footer",
                ".footer-container",
                ".footer-content",
                ".footer-copyright",
                ".footer-nav",
                ".footer-links",
                ".footer-link-item",
                ".footer-link",
            ];

            for (const className of componentClasses) {
                expect(cssContent).toContain(className);
            }

            expect(cssContent).toMatchSnapshot();

            // Verify that the CSS is substantial (not just empty)
            expect(cssContent.length).toBeGreaterThan(1000);
        });

        describe("tailwind-oxide-cross-folder", () => {
            it("should discover and include all classes from components in different folders", async () => {
                expect.assertions(25);

                await installPackage(temporaryDirectoryPath, "tailwindcss");

                const result = (await build({
                    dependencies: {
                        tailwindcss: "*",
                    },
                    input: "tailwind-oxide-cross-folder/index.js",
                    styleOptions: {
                        loaders: ["tailwindcss"] as unknown as StyleOptions["loaders"],
                        mode: "extract",
                    },
                })) as WriteResult;

                expect(result.isCss()).toBe(true);
                expect(result.isMap()).toBe(false);

                const cssContent = result.css().join("\n");

                // Verify component-specific classes are present
                const componentClasses = [
                    // Button component
                    ".btn",
                    ".btn-primary",
                    ".btn-secondary",
                    // Card component
                    ".card",
                    ".card-title",
                    ".card-content",
                    // Header component
                    ".header",
                    ".header-container",
                    ".header-title",
                    ".header-subtitle",
                    // Footer component
                    ".footer",
                    ".footer-container",
                    ".footer-content",
                    ".footer-copyright",
                    ".footer-nav",
                    ".footer-links",
                    ".footer-link-item",
                    ".footer-link",
                ];

                for (const className of componentClasses) {
                    expect(cssContent).toContain(className);
                }

                expect(cssContent).toMatchSnapshot();

                // Verify that the CSS is substantial (not just empty)
                expect(cssContent.length).toBeGreaterThan(1000);
            });
        });
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
                mode: ["inject", (varname, id) => `console.log(${varname}, ${JSON.stringify(typeof id === "string")})`],
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
                errorMessage: "`inject` keyword is reserved when using `inject.treeshakeable` option",
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
            {
                input: "modules/index.js",
                styleOptions: {
                    dts: true,
                    mode: ["inject", { treeshakeable: true }],
                    postcss: {
                        modules: true,
                    },
                },
                title: "inject-treeshakeable-dts",
            },
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
                errorMessage: '"css" is not exported by',
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
            {
                input: "named-exports/index.js",
                styleOptions: {
                    dts: true,
                    namedExports: true,
                    postcss: {
                        modules: true,
                    },
                },
                title: "named-exports-dts",
            },
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
                    mode: "inline",
                    postcss: {
                        modules: true,
                    },
                },
                title: "inline-modules",
            },
            {
                input: "modules/index.js",
                styleOptions: {
                    mode: "inline",
                    namedExports: true,
                    postcss: {
                        modules: true,
                    },
                },
                title: "inline-modules-named-exports",
            },
            {
                input: "modules-duplication/index.js",
                styleOptions: {
                    mode: "inline",
                    postcss: {
                        modules: true,
                    },
                },
                title: "inline-duplication",
            },
            {
                input: "treeshake-module/index.js",
                styleOptions: {
                    mode: "inline",
                    namedExports: true,
                    postcss: {
                        modules: true,
                    },
                },
                title: "inline-treeshake-module",
            },
            {
                input: "named-exports/index.js",
                styleOptions: {
                    mode: "inline",
                    namedExports: true,
                    postcss: {
                        modules: true,
                    },
                },
                title: "inline-named-exports",
            },
            {
                input: "named-exports/index.js",
                styleOptions: {
                    mode: "inline",
                    namedExports: (name: string) => `${name}hacked`,
                    postcss: {
                        modules: true,
                    },
                },
                title: "inline-named-exports-custom-class-name",
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
                styleOptions: { autoModules: AUTO_MODULES_STYL_REGEX },
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
            {
                input: "named-exports/index.js",
                styleOptions: {
                    // Use [name]_[local] so the generated class names do not
                    // depend on the temp directory path (which changes per run).
                    lightningcss: {
                        modules: { pattern: "[name]_[local]" },
                    },
                    loaders: ["lightningcss", "sourcemap"],
                },
                title: "lightningcss-modules",
            },
            {
                input: "named-exports/index.js",
                styleOptions: {
                    dts: true,
                    lightningcss: {
                        modules: { pattern: "[name]_[local]" },
                    },
                    loaders: ["lightningcss", "sourcemap"],
                },
                title: "lightningcss-modules-dts",
            },
            {
                input: "named-exports/index.js",
                styleOptions: {
                    lightningcss: {
                        modules: { pattern: "[name]_[local]" },
                    },
                    loaders: ["lightningcss", "sourcemap"],
                    namedExports: true,
                },
                title: "lightningcss-modules-named-exports",
            },
        ] as WriteData[])("should work with processed modules $title css", async ({ title: _title, ...data }: WriteData) => {
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
            {
                input: "code-splitting/index.js",
                styleOptions: {
                    mode: "inline",
                    sourceMap: true,
                },
                title: "inline",
            },
            {
                input: ["code-splitting/index.js", "code-splitting/indextwo.js"],
                styleOptions: {
                    mode: "inline",
                    sourceMap: true,
                },
                title: "inline-multi-entry",
            },
        ] as WriteData[])("should work with processed $title css", async ({ title: _title, ...data }: WriteData) => {
            await validate(data);
        });
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
            expect(normalizeRolldownOutput(f)).toMatchSnapshot("js");
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
                    plugins: [["autoprefixer", { overrideBrowserslist: ["> 0%"] }]],
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

                sourceMap: [true, { transform: (map) => Object.assign(map, { sources: ["virt"] }) }],
                styleOptions: `mode: "emit", sourceMap: [true, { transform: (m) => Object.assign(m, { sources: ["virt"] }) }]`,
                title: "sourcemap-transform",
            },
            {
                input: "simple/index.js",
                styleOptions: {
                    mode: "inline",
                },
                title: "inline-basic",
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
        ] as WriteData[])("should work with emitted processed $title css", async ({ title: _title, ...data }: WriteData) => {
            await installPackage(temporaryDirectoryPath, "lit");

            // eslint-disable-next-line vitest/no-conditional-in-test
            if (data.dependencies !== undefined) {
                await installPackage(temporaryDirectoryPath, "rollup-plugin-lit-css");
            }

            await validate(data);
        });
    });

    describe("cache invalidation", () => {
        it("should update extracted CSS when source changes", async () => {
            expect.assertions(4);

            // Create minimal project with CSS extraction enabled
            await createPackemConfig(temporaryDirectoryPath, {
                cssLoader: ["postcss"],
                cssOptions: { mode: "extract" },
                transformer: "esbuild",
            });

            await createPackageJson(temporaryDirectoryPath, {
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
            });

            // Initial source files
            const sourcePath = join(temporaryDirectoryPath, "src");

            await rm(sourcePath, { force: true, recursive: true });
            // ensure src exists

            mkdirSync(sourcePath, { recursive: true });
            const stylePath = join(sourcePath, "style.css");
            const indexPath = join(sourcePath, "index.js");

            writeFileSync(stylePath, "body{color:red}");
            writeFileSync(indexPath, "import './style.css';\nexport const ok = true;\n");

            let binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.exitCode).toBe(0);

            // Find emitted CSS file and assert content
            const distributionPath = join(temporaryDirectoryPath, "dist");
            const files = await readdir(distributionPath, { recursive: true, withFileTypes: true });
            const cssFiles = files.filter((d) => d.isFile() && d.name.endsWith(".css")).map((d) => join(d.parentPath, d.name));

            const initialCss = cssFiles.map((f) => readFileSync(f)).join("\n");

            expect(initialCss).toContain("color:red");

            // Modify CSS source and rebuild
            writeFileSync(stylePath, "body{color:blue}");

            binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.exitCode).toBe(0);

            const files2 = await readdir(distributionPath, { recursive: true, withFileTypes: true });
            const cssFiles2 = files2.filter((d) => d.isFile() && d.name.endsWith(".css")).map((d) => join(d.parentPath, d.name));
            const updatedCss = cssFiles2.map((f) => readFileSync(f)).join("\n");

            expect(updatedCss).toContain("color:blue");
        });
    });
});
