import { gzipSync, brotliCompressSync } from "node:zlib";
import { table } from "table";
import { bold, cyan, green, magenta, yellow } from "@visulima/colorize";
import { formatBytes, duration } from "@visulima/humanizer";
import { readFile, isAccessible, walk } from "@visulima/fs";

interface BenchmarkResult {
    builderName: string;
    project?: string;
    runtime: number;
    sourceFile: string;
    originalSize: number;
    gzipSize: number;
    brotliSize: number;
}

const KEY_REGEX = /^--(.*)/;

/**
 * Format and display benchmark results
 * @param results - Array of benchmark results to display
 */
export const displayBenchmarkResults = (results: BenchmarkResult[]): void => {
    const data = [
        [bold("Builder"), bold("Project"), bold("Runtime"), bold("Source Files"), bold("Original Size"), bold("Gzip Size"), bold("Brotli Size")],
        ...results.map((result) => [
            cyan(result.builderName),
            cyan(result.project || "-"),
            yellow(duration(result.runtime, { units: ["m", "s", "ms"], round: true })),
            green(result.sourceFile),
            magenta(formatBytes(result.originalSize, { decimals: 2 })),
            magenta(formatBytes(result.gzipSize, { decimals: 2 })),
            magenta(formatBytes(result.brotliSize, { decimals: 2 })),
        ]),
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
