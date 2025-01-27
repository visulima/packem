import packem from "@visulima/packem";
import { errorToString, getArguments, getMetrics } from "./utils";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pail } from "@visulima/pail";

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

(async () => {
    try {
        const { project, preset = SUPPORTED_PRESETS.babel, entrypoint = "src/index.tsx" } = getArguments();

        if (!project || !existsSync(`./projects/${project}`)) {
            throw new Error("Invalid project");
        } else if (!isSupportedPreset(preset)) {
            throw new Error("Unsupported preset");
        } else if (!existsSync(`./projects/${project}/${entrypoint}`)) {
            throw new Error(`Invalid entrypoint ${entrypoint}`);
        }

        const buildPaths = {
            appEntrypoint: `./projects/${project}/${entrypoint}`,
            appBuild: "./builds/build-packem",
        };

        await rm(buildPaths.appBuild, {
            recursive: true,
            force: true,
        });

        const startTime = Date.now();

        await packem(`./projects/${project}`, "build", "production", pail, {
            debug: false,
            runtime: "browser",
        });

        console.log(getMetrics(startTime, buildPaths.appBuild));
        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
