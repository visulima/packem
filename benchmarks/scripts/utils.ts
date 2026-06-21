import { gzipSync, brotliCompressSync } from "node:zlib";
import { table } from "table";
import { bold, cyan, green, magenta, yellow } from "@visulima/colorize";
import { formatBytes, duration } from "@visulima/humanizer";
import { readFile, isAccessible, walk } from "@visulima/fs";

interface BenchmarkResult {
    builderName: string;
    project?: string;
    /** Representative runtime (median across samples) in milliseconds. */
    runtime: number;
    /** Fastest sample in milliseconds, when more than one sample was taken. */
    runtimeMin?: number;
    /** Slowest sample in milliseconds, when more than one sample was taken. */
    runtimeMax?: number;
    /** Population standard deviation across samples in milliseconds. */
    runtimeStdDev?: number;
    /** Number of measured (post-warmup) samples that produced the runtime. */
    samples?: number;
    sourceFile: string;
    originalSize: number;
    gzipSize: number;
    brotliSize: number;
}

export interface RuntimeStats {
    /** Median of the samples — used as the representative runtime. */
    median: number;
    min: number;
    max: number;
    mean: number;
    /** Population standard deviation. */
    stdDev: number;
    /** Number of samples summarized. */
    samples: number;
}

const KEY_REGEX = /^--(.*)/;

/**
 * Summarize a set of runtime samples into robust statistics. The median is used
 * as the representative value because it is resistant to the occasional GC pause
 * or disk hiccup that would skew a single measurement (the previous behaviour)
 * or a plain mean.
 * @param samples - Measured runtimes in milliseconds (must be non-empty).
 */
export const summarizeSamples = (samples: number[]): RuntimeStats => {
    if (samples.length === 0) {
        throw new Error("summarizeSamples requires at least one sample");
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];

    const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length;

    return {
        median,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean,
        stdDev: Math.sqrt(variance),
        samples: sorted.length,
    };
};

/**
 * Format and display benchmark results
 * @param results - Array of benchmark results to display
 */
export const displayBenchmarkResults = (results: BenchmarkResult[]): void => {
    const formatRuntime = (ms: number) => duration(ms, { units: ["m", "s", "ms"], round: true });

    // Only show the spread column when at least one row carries multi-sample
    // statistics, so single-run callers (e.g. getMetrics) keep the compact table.
    const hasSpread = results.some((result) => (result.samples ?? 1) > 1);

    const header = [bold("Builder"), bold("Project"), bold("Runtime (median)")];

    if (hasSpread) {
        header.push(bold("Spread (min…max ±σ)"));
    }

    header.push(bold("Source Files"), bold("Original Size"), bold("Gzip Size"), bold("Brotli Size"));

    const data = [
        header,
        ...results.map((result) => {
            const row = [
                cyan(result.builderName),
                cyan(result.project || "-"),
                yellow(formatRuntime(result.runtime)),
            ];

            if (hasSpread) {
                const spread =
                    (result.samples ?? 1) > 1 && result.runtimeMin !== undefined && result.runtimeMax !== undefined
                        ? `${formatRuntime(result.runtimeMin)}…${formatRuntime(result.runtimeMax)} ±${formatRuntime(result.runtimeStdDev ?? 0)} (n=${result.samples})`
                        : "-";

                row.push(yellow(spread));
            }

            row.push(
                green(result.sourceFile),
                magenta(formatBytes(result.originalSize, { decimals: 2 })),
                magenta(formatBytes(result.gzipSize, { decimals: 2 })),
                magenta(formatBytes(result.brotliSize, { decimals: 2 })),
            );

            return row;
        }),
    ];

    const config = {
        border: {
            topBody: "─",
            topJoin: "┬",
            topLeft: "┌",
            topRight: "┐",
            bottomBody: "─",
            bottomJoin: "┴",
            bottomLeft: "└",
            bottomRight: "┘",
            bodyLeft: "│",
            bodyRight: "│",
            bodyJoin: "│",
            joinBody: "─",
            joinLeft: "├",
            joinRight: "┤",
            joinJoin: "┼",
        },
    };

    console.log("\nBenchmark Results:");
    console.log(table(data, config));
};

export const getArguments = (): Record<string, boolean | string> => {
    const args = process.argv.slice(2);

    return args.reduce((acc, arg, index, args) => {
        if (!KEY_REGEX.test(arg)) {
            return acc;
        } else if (!args[index + 1] || (args[index + 1] && KEY_REGEX.test(args[index + 1]))) {
            return { ...acc, [arg.slice(2)]: true };
        }

        return { ...acc, [arg.slice(2)]: args[index + 1] };
    }, {});
};

export const getFileMetrics = async (buildPath: string): Promise<{ size: number; sizeGzip: number; sizeBrotli: number }> => {
    if (!(await isAccessible(buildPath))) {
        return { size: 0, sizeGzip: 0, sizeBrotli: 0 };
    }

    const metrics = { size: 0, sizeGzip: 0, sizeBrotli: 0 };

    // Use walk to recursively process all files
    for await (const entry of walk(buildPath, { followSymlinks: false })) {
        if (entry.isFile()) {
            const contents = await readFile(entry.path);

            metrics.size += Buffer.byteLength(contents);
            metrics.sizeGzip += gzipSync(contents).length;
            metrics.sizeBrotli += brotliCompressSync(contents).length;
        }
    }

    return metrics;
};

export const getMetrics = async (builderName: string, runtime: number, buildPath: string, project?: string): Promise<void> => {
    const { size, sizeGzip, sizeBrotli } = await getFileMetrics(buildPath);

    displayBenchmarkResults([
        {
            builderName,
            project,
            runtime,
            sourceFile: buildPath,
            originalSize: size,
            gzipSize: sizeGzip,
            brotliSize: sizeBrotli,
        },
    ]);
};

export const errorToString = (error: unknown) => {
    return error instanceof Error ? error.message : "Something went wrong";
};
