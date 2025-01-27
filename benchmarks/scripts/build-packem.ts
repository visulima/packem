import { packem } from "@visulima/packem";
import { errorToString, getArguments, getMetrics } from "./utils";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import esbuildTransformer from "@visulima/packem/transformer/esbuild";
import swcTransformer from "@visulima/packem/transformer/swc";
import sucraseTransformer from "@visulima/packem/transformer/sucrase";
import oxcTransformer from "@visulima/packem/transformer/oxc";

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

(async () => {
    try {
        const { project, preset = SUPPORTED_PRESETS.esbuild, entrypoint = "src/index.tsx" } = getArguments();

        if (!project || !existsSync(`./projects/${project}`)) {
            throw new Error("Invalid project");
        } else if (!isSupportedPreset(preset)) {
            throw new Error("Unsupported preset");
        } else if (!existsSync(`./projects/${project}/${entrypoint}`)) {
            throw new Error(`Invalid entrypoint ${entrypoint}`);
        }

        const buildPaths = {
            appEntrypoint: `./${entrypoint}`,
            appBuild: "./builds/build-packem",
        };

        await rm(buildPaths.appBuild, {
            recursive: true,
            force: true,
        });

        const startTime = Date.now();

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
                }
            }
        });

        console.log("\n");
        console.log(getMetrics(startTime, buildPaths.appBuild));
        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
