import { performance } from "node:perf_hooks";
import { bunBuilder } from "../builders/bun";
import { buncheeBuilder } from "../builders/bunchee";
import { esbuildBuilder } from "../builders/esbuild";
import { packemBuilder } from "../builders/packem";
import { parcelBuilder } from "../builders/parcel";
import { rollupBuilder } from "../builders/rollup";
import { rspackBuilder } from "../builders/rspack";
import { tsdownBuilder } from "../builders/tsdown";
import { tsupBuilder } from "../builders/tsup";
import { viteBuilder } from "../builders/vite";
import { webpackBuilder } from "../builders/webpack";
import { errorToString, getArguments, getFileMetrics } from "./utils";
import { displayBenchmarkResults } from "./utils";
import type { Builder, BuilderOptions } from "../builders/types";
import { readdir } from "node:fs/promises";

interface BuilderResult {
    builderName: string;
    project: string;
    runtime: number;
    sourceFile: string;
    originalSize: number;
    gzipSize: number;
    brotliSize: number;
}

interface BuilderWithPreset {
    builder: Builder;
    preset?: string;
    bundler?: "rollup" | "rolldown";
}

// Create separate builder instances for each preset
const getBuilderInstances = (): BuilderWithPreset[] => {
    const builders: BuilderWithPreset[] = [];

    if (typeof Bun !== "undefined") {
        builders.push({ builder: bunBuilder });
    }

    // Add builders without presets
    [
        buncheeBuilder,
        esbuildBuilder,
        parcelBuilder,
        //rspackBuilder,
        tsdownBuilder,
        tsupBuilder,
        viteBuilder,
    ].forEach(builder => {
        builders.push({ builder });
    });

    // Add Rollup with its presets
    ['babel', 'esbuild', 'swc'].forEach(preset => {
        builders.push({ builder: rollupBuilder, preset });
    });

    // Add Packem across both bundler backends (rollup + rolldown) and its transformer presets
    (['rollup', 'rolldown'] as const).forEach(bundler => {
        ['esbuild', 'swc', 'sucrase', 'oxc'].forEach(preset => {
            builders.push({ builder: packemBuilder, preset, bundler });
        });
    });

    // Add Webpack (currently no presets)
    builders.push({ builder: webpackBuilder });

    return builders;
};

const runBuilder = async (builderWithPreset: BuilderWithPreset, baseOptions: BuilderOptions): Promise<BuilderResult | null> => {
    const { builder, preset, bundler } = builderWithPreset;
    const options = { ...baseOptions, preset, bundler };
    const builderName = [builder.name, bundler, preset].filter(Boolean).join("-");

    try {
        await builder.cleanup?.(options);

        const start = performance.now();
        const buildPath = await builder.build(options);
        const end = performance.now();

        await builder.move?.(options);

        const { size, sizeGzip, sizeBrotli } = await getFileMetrics(buildPath);

        return {
            builderName,
            project: options.project,
            runtime: end - start,
            sourceFile: buildPath,
            originalSize: size,
            gzipSize: sizeGzip,
            brotliSize: sizeBrotli,
        };
    } catch (error) {
        console.error(`Error running ${builderName}:`, errorToString(error));
        return null;
    }
};

const PROJECTS_DIR = "./projects";
const DEFAULT_ENTRYPOINT = "src/index.tsx";
const DEFAULT_OUTDIR = "./builds";

const getProjects = async (): Promise<string[]> => {
    const projects = await readdir(PROJECTS_DIR);
    return projects.filter(project => !project.startsWith("."));
};

const runBenchmark = async (project: string): Promise<void> => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Running benchmark for project: ${project}`);
    console.log(`Entry: ${DEFAULT_ENTRYPOINT}\n`);

    const options: BuilderOptions = {
        project,
        entrypoint: DEFAULT_ENTRYPOINT,
        outDir: DEFAULT_OUTDIR,
    };

    const builders = getBuilderInstances();
    console.log(`Running ${builders.length} builders...`);
    console.log(builders.map(b => [b.builder.name, b.bundler, b.preset].filter(Boolean).join("-")).join(", ") + "\n");

    // Run all builders in parallel
    const results = await Promise.all(
        builders.map(builder => runBuilder(builder, options))
    );

    // Filter out failed builds and sort by runtime
    const successfulResults = results.filter((result): result is BuilderResult => result !== null);
    successfulResults.sort((a, b) => a.runtime - b.runtime);

    console.log(`\nBenchmark Results for ${project} (${successfulResults.length} successful builds, sorted by runtime):`);
    displayBenchmarkResults(successfulResults);
};

(async () => {
    try {
        const { project, projects: projectsArg } = getArguments();

        // Optional filter: --project <name> or --projects <a,b,c>
        const filter = [
            ...(typeof project === "string" ? [project] : []),
            ...(typeof projectsArg === "string" ? projectsArg.split(",").map((p) => p.trim()).filter(Boolean) : []),
        ];

        let projects = await getProjects();

        if (filter.length > 0) {
            const unknown = filter.filter((p) => !projects.includes(p));

            if (unknown.length > 0) {
                throw new Error(`Unknown project(s): ${unknown.join(", ")}. Available: ${projects.join(", ")}`);
            }

            projects = projects.filter((p) => filter.includes(p));
        }

        console.log(`Found ${projects.length} projects: ${projects.join(", ")}\n`);

        // Run benchmarks for each project sequentially
        for (const project of projects) {
            await runBenchmark(project);
        }

        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
