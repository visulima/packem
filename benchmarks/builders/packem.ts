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

const SUPPORTED_BUNDLERS = ["rollup", "rolldown"] as const;

type SupportedBundler = (typeof SUPPORTED_BUNDLERS)[number];

const isSupportedBundler = (bundler: unknown): bundler is SupportedBundler => {
    return typeof bundler === "string" && (SUPPORTED_BUNDLERS as readonly string[]).includes(bundler);
};

/**
 * Unique output directory per (bundler, preset) so concurrent packem variants
 * in build-all don't clobber a shared directory.
 */
const buildDir = (outDir: string, bundler: SupportedBundler, preset: string): string =>
    join(outDir, `build-packem-${bundler}-${preset}`);

export const packemBuilder: Builder = {
    name: "packem",
    supportedPresets: Object.values(SUPPORTED_PRESETS),
    supportedBundlers: [...SUPPORTED_BUNDLERS],

    async build({ project, entrypoint = "src/index.tsx", outDir = "./builds", preset = SUPPORTED_PRESETS.esbuild, bundler = "rollup" }: BuilderOptions) {
        if (!isSupportedPreset(preset)) {
            throw new Error("Unsupported preset");
        }

        if (!isSupportedBundler(bundler)) {
            throw new Error("Unsupported bundler");
        }

        const buildPaths = {
            appEntrypoint: `./${entrypoint}`,
            appBuild: buildDir(outDir, bundler, preset),
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
            bundler,
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

    async cleanup({ outDir = "./builds", preset = SUPPORTED_PRESETS.esbuild, bundler = "rollup" }: BuilderOptions) {
        if (!isSupportedBundler(bundler)) {
            return;
        }

        const buildPath = buildDir(outDir, bundler, preset);

        await rm(buildPath, { force: true, recursive: true });
    },
};
