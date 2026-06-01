import { rollup } from "rollup";
import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import esbuild from "rollup-plugin-esbuild";
import replace from "@rollup/plugin-replace";
import resolve from "@rollup/plugin-node-resolve";
import swc from "rollup-plugin-swc3";
import terser from "@rollup/plugin-terser";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { Builder, BuilderOptions } from "./types";

const SUPPORTED_PRESETS = {
    babel: "babel",
    esbuild: "esbuild",
    swc: "swc",
} as const;

type SupportedPreset = keyof typeof SUPPORTED_PRESETS;

const isSupportedPreset = (preset: unknown): preset is SupportedPreset => {
    return typeof preset === "string" && Object.values<string>(SUPPORTED_PRESETS).includes(preset);
};

const resolvePlugins = (preset: SupportedPreset) => {
    switch (preset) {
        case SUPPORTED_PRESETS.babel:
            return [
                babel({
                    babelHelpers: "bundled",
                    exclude: /node_modules/,
                    extensions: [".jsx", ".ts", ".tsx"],
                    presets: [["@babel/preset-react", { runtime: "automatic" }], "@babel/preset-typescript"],
                }),
                terser({
                    format: {
                        comments: false,
                    },
                }),
            ];
        case SUPPORTED_PRESETS.esbuild:
            return [
                esbuild({
                    exclude: /node_modules/,
                    minify: true,
                    target: ["es2015"],
                    jsx: "automatic",
                }),
            ];
        case SUPPORTED_PRESETS.swc:
            return [
                swc({
                    exclude: /node_modules/,
                    minify: true,
                    jsc: {
                        target: "es2015",
                        parser: {
                            syntax: "typescript",
                            tsx: true,
                        },
                        transform: {
                            react: {
                                runtime: "automatic",
                            },
                        },
                    },
                }),
            ];
    }
};

export const rollupBuilder: Builder = {
    name: "rollup",
    supportedPresets: Object.values(SUPPORTED_PRESETS),

    async build({ project, entrypoint = "src/index.tsx", outDir = "./builds", preset = SUPPORTED_PRESETS.babel }: BuilderOptions) {
        if (!isSupportedPreset(preset)) {
            throw new Error("Unsupported preset");
        }

        const buildPaths = {
            appEntrypoint: `./projects/${project}/${entrypoint}`,
            appBuild: join(outDir, "build-rollup"),
        };

        const bundler = await rollup({
            input: buildPaths.appEntrypoint,
            output: {
                file: join(buildPaths.appBuild, "index.js"),
                format: "commonjs",
            },
            plugins: [
                commonjs({
                    include: /node_modules/,
                    extensions: [".js"],
                }),
                resolve({
                    preferBuiltins: true,
                    browser: true,
                    extensions: [".js", ".jsx", ".ts", ".tsx"],
                }),
                ...resolvePlugins(preset),
                replace({
                    preventAssignment: true,
                    values: {
                        "process.env.NODE_ENV": JSON.stringify("production"),
                    },
                }),
            ],
            onwarn: () => {},
        });

        await bundler.write({ dir: buildPaths.appBuild });
        await bundler.close();

        return buildPaths.appBuild;
    },

    async cleanup({ outDir = "./builds" }: BuilderOptions) {
        const buildPath = join(outDir, "build-rollup");

        await rm(buildPath, { force: true, recursive: true });
    },
};
