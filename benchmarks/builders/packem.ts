import { packem } from "@visulima/packem";
import esbuildTransformer from "@visulima/packem/transformer/esbuild";
import swcTransformer from "@visulima/packem/transformer/swc";
import sucraseTransformer from "@visulima/packem/transformer/sucrase";
import oxcTransformer from "@visulima/packem/transformer/oxc";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { Builder, BuilderOptions } from "./types";

const SUPPORTED_PRESETS = {
    // babel: "babel",
    esbuild: "esbuild",
    swc: "swc",
    sucrase: "sucrase",
    oxc: "oxc",
} as const;

type SupportedPreset = keyof typeof SUPPORTED_PRESETS;

const isSupportedPreset = (preset: unknown): preset is SupportedPreset => {
    return typeof preset === "string" && Object.values<string>(SUPPORTED_PRESETS).includes(preset);
};

export const packemBuilder: Builder = {
    name: "packem",
    supportedPresets: Object.values(SUPPORTED_PRESETS),

    async build({ project, entrypoint = "src/index.tsx", outDir = "./builds", preset = SUPPORTED_PRESETS.esbuild }: BuilderOptions) {
        if (!isSupportedPreset(preset)) {
            throw new Error("Unsupported preset");
        }

        const buildPaths = {
            appEntrypoint: `./${entrypoint}`,
            appBuild: join(outDir, "build-packem"),
        };

        let transformer;

        if (preset === SUPPORTED_PRESETS.esbuild) {
            transformer = esbuildTransformer;
        } else if (preset === SUPPORTED_PRESETS.swc) {
            transformer = swcTransformer;
        } else if (preset === SUPPORTED_PRESETS.oxc) {
            transformer = oxcTransformer;
        } else if (preset === SUPPORTED_PRESETS.sucrase) {
            transformer = sucraseTransformer;
        }

        await packem(`./projects/${project}/`, {
            runtime: "browser",
            environment: "production",
            outDir: "../../" + buildPaths.appBuild,
            transformer,
            clean: false,
            emitCJS: true,
            entries: [buildPaths.appEntrypoint],
            validation: false,
            rollup: {
                resolveExternals: {
                    deps: false,
                },
                replace: {
                    values: {
                        "process.env.NODE_ENV": JSON.stringify("production"),
                    },
                },
            },
        });

        return buildPaths.appBuild;
    },

    async cleanup({ outDir = "./builds" }: BuilderOptions) {
        const buildPath = join(outDir, "build-packem");

        await rm(buildPath, { force: true, recursive: true });
    },
};
