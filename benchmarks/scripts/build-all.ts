import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { bunBuilder } from "../builders/bun";
import { buncheeBuilder } from "../builders/bunchee";
import { esbuildBuilder } from "../builders/esbuild";
import { packemBuilder } from "../builders/packem";
import { parcelBuilder } from "../builders/parcel";
import { rolldownBuilder } from "../builders/rolldown";
import { rollupBuilder } from "../builders/rollup";
import { rspackBuilder } from "../builders/rspack";
import { tsdownBuilder } from "../builders/tsdown";
import { tsupBuilder } from "../builders/tsup";
import { viteBuilder } from "../builders/vite";
import { webpackBuilder } from "../builders/webpack";
import { errorToString, getArguments, getFileMetrics, summarizeSamples } from "./utils";
import { displayBenchmarkResults } from "./utils";
import type { Builder, BuilderOptions } from "../builders/types";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";

interface BuilderResult {
    builderName: string;
    project: string;
    runtime: number;
    runtimeMin: number;
    runtimeMax: number;
    runtimeStdDev: number;
    samples: number;
    sourceFile: string;
    originalSize: number;
    gzipSize: number;
    brotliSize: number;
}

// Defaults: take a handful of measured samples after discarding warmup runs, so
// a single GC pause or disk hiccup can't reorder the leaderboard. Override with
// `--runs <n>` and `--warmup <n>`.
const DEFAULT_RUNS = 5;
const DEFAULT_WARMUP = 1;

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
        rolldownBuilder,
        rspackBuilder,
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

    // Add Packem. The rollup backend runs the full transformer matrix.
    ['esbuild', 'swc', 'sucrase', 'oxc'].forEach(preset => {
        builders.push({ builder: packemBuilder, preset, bundler: 'rollup' });
    });

    // The rolldown backend transforms natively (oxc) and rejects an explicit
    // transformer, so the per-transformer presets produce byte-identical output —
    // run it once instead of as a redundant matrix.
    builders.push({ builder: packemBuilder, bundler: 'rolldown' });

    // Add Webpack (currently no presets)
    builders.push({ builder: webpackBuilder });

    return builders;
};

const runBuilder = async (
    builderWithPreset: BuilderWithPreset,
    baseOptions: BuilderOptions,
    runs: number,
    warmup: number,
): Promise<BuilderResult | null> => {
    const { builder, preset, bundler } = builderWithPreset;
    const options = { ...baseOptions, preset, bundler };
    const builderName = [builder.name, bundler, preset].filter(Boolean).join("-");

    try {
        const samples: number[] = [];
        let buildPath = "";

        // Each iteration is an independent cold build: clean before, time the
        // build, then move outputs. Warmup iterations prime caches/JIT and are
        // discarded so they don't pull the median around.
        for (let iteration = 0; iteration < warmup + runs; iteration += 1) {
            await builder.cleanup?.(options);

            const start = performance.now();
            buildPath = await builder.build(options);
            const end = performance.now();

            await builder.move?.(options);

            if (iteration >= warmup) {
                samples.push(end - start);
            }
        }

        const stats = summarizeSamples(samples);

        // Output is deterministic across runs, so the final build's artifacts are
        // representative — measure size once instead of per sample.
        const { size, sizeGzip, sizeBrotli } = await getFileMetrics(buildPath);

        return {
            builderName,
            project: options.project,
            runtime: stats.median,
            runtimeMin: stats.min,
            runtimeMax: stats.max,
            runtimeStdDev: stats.stdDev,
            samples: stats.samples,
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
const ENTRYPOINT_CANDIDATES = ["src/index.tsx", "src/index.jsx", "src/index.ts", "src/index.js"];

// Projects are not all TSX: the plain-JavaScript fixtures enter through
// `src/index.js`. Pick the first entry the project actually has instead of
// assuming one, so a new fixture only has to exist to be benchmarked.
const resolveEntrypoint = (project: string): string => {
    const entrypoint = ENTRYPOINT_CANDIDATES.find(candidate => existsSync(join(PROJECTS_DIR, project, candidate)));

    if (!entrypoint) {
        throw new Error(`No entrypoint found for project "${project}" (looked for ${ENTRYPOINT_CANDIDATES.join(", ")})`);
    }

    return entrypoint;
};
const DEFAULT_OUTDIR = "./builds";

const getProjects = async (): Promise<string[]> => {
    const projects = await readdir(PROJECTS_DIR);
    return projects.filter(project => !project.startsWith("."));
};

const runBenchmark = async (project: string, runs: number, warmup: number): Promise<void> => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Running benchmark for project: ${project}`);
    const entrypoint = resolveEntrypoint(project);

    console.log(`Entry: ${entrypoint}`);
    console.log(`Samples: ${runs} measured run(s) after ${warmup} warmup run(s) per builder\n`);

    const options: BuilderOptions = {
        project,
        entrypoint,
        outDir: DEFAULT_OUTDIR,
    };

    const builders = getBuilderInstances();
    console.log(`Running ${builders.length} builders...`);
    console.log(builders.map(b => [b.builder.name, b.bundler, b.preset].filter(Boolean).join("-")).join(", ") + "\n");

    // Run builders sequentially so each gets a clean CPU/IO budget. Parallel runs
    // (Promise.all) saturate resources and amplify each builder's runtime by ~10x,
    // distorting the comparison toward whoever finishes first and frees capacity.
    const results: (BuilderResult | null)[] = [];

    for (const builder of builders) {
        results.push(await runBuilder(builder, options, runs, warmup));
    }

    // Filter out failed builds and sort by runtime
    const successfulResults = results.filter((result): result is BuilderResult => result !== null);
    successfulResults.sort((a, b) => a.runtime - b.runtime);

    console.log(`\nBenchmark Results for ${project} (${successfulResults.length} successful builds, sorted by runtime):`);
    displayBenchmarkResults(successfulResults);
};

(async () => {
    try {
        const { project, projects: projectsArg, runs: runsArg, warmup: warmupArg } = getArguments();

        // Sample counts: --runs <n> (measured) and --warmup <n> (discarded).
        const parseCount = (value: unknown, fallback: number, label: string): number => {
            if (value === undefined || value === true) {
                return fallback;
            }

            const parsed = Number(value);

            if (!Number.isInteger(parsed) || parsed < 0) {
                throw new Error(`Invalid --${label}: ${String(value)}. Expected a non-negative integer.`);
            }

            return parsed;
        };

        const runs = Math.max(1, parseCount(runsArg, DEFAULT_RUNS, "runs"));
        const warmup = parseCount(warmupArg, DEFAULT_WARMUP, "warmup");

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
            await runBenchmark(project, runs, warmup);
        }

        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
