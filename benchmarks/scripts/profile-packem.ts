// Localize packem's per-phase cost on react-empty by monkey-patching key
// internals. Single-purpose diagnostic; not part of the bench suite.
import { performance } from "node:perf_hooks";
import { rm } from "node:fs/promises";

const marks = new Map<string, { calls: number; total: number }>();

const tap = <T extends (...arguments_: any[]) => any>(label: string, fn: T): T => {
    return ((...arguments_: Parameters<T>) => {
        const start = performance.now();
        const result = fn(...arguments_);

        if (result && typeof (result as Promise<unknown>).then === "function") {
            return (result as Promise<unknown>).finally(() => {
                const entry = marks.get(label) ?? { calls: 0, total: 0 };

                entry.calls += 1;
                entry.total += performance.now() - start;
                marks.set(label, entry);
            });
        }

        const entry = marks.get(label) ?? { calls: 0, total: 0 };

        entry.calls += 1;
        entry.total += performance.now() - start;
        marks.set(label, entry);

        return result;
    }) as T;
};

const ensureModule = await import("@visulima/packem/dist/bundler/ensure-installed.js" as string).catch(() => null);
const tsconfigModule = await import("@visulima/packem/dist/config/utils/load-tsconfig.js" as string).catch(() => null);
const prepareEntriesModule = await import("@visulima/packem/dist/config/utils/prepare-entries.js" as string).catch(() => null);
const cleanModule = await import("@visulima/packem/dist/utils/clean-distribution-directories.js" as string).catch(() => null);

if (ensureModule) {
    ensureModule.ensureBundlerInstalled = tap("ensureBundlerInstalled", ensureModule.ensureBundlerInstalled);
    ensureModule.ensureTransformerInstalled = tap("ensureTransformerInstalled", ensureModule.ensureTransformerInstalled);
}

if (tsconfigModule?.default) {
    tsconfigModule.default = tap("loadTsconfig", tsconfigModule.default);
}

if (prepareEntriesModule?.default) {
    prepareEntriesModule.default = tap("prepareEntries", prepareEntriesModule.default);
}

if (cleanModule?.default) {
    cleanModule.default = tap("cleanDistributionDirectories", cleanModule.default);
}

const { packem } = await import("@visulima/packem");
const esbuildTransformer = (await import("@visulima/packem/transformer/esbuild")).default;

const PROJECT = process.argv[2] ?? "react-empty";
const OUT_DIR = `./builds/profile-packem-${PROJECT}`;

await rm(OUT_DIR, { force: true, recursive: true });

const RUNS = 3;
const runs: number[] = [];

for (let i = 0; i < RUNS; i++) {
    marks.clear();

    const t0 = performance.now();

    await packem(`./projects/${PROJECT}/`, {
        runtime: "browser",
        environment: "production",
        bundler: "rollup",
        outDir: "../../" + OUT_DIR,
        transformer: esbuildTransformer,
        clean: true,
        emitESM: true,
        entries: [`./src/index.tsx`],
        validation: false,
        rollup: {
            resolveExternals: { deps: false },
            replace: {
                values: { "process.env.NODE_ENV": JSON.stringify("production") },
            },
        },
    });

    const total = performance.now() - t0;

    runs.push(total);

    console.log(`\n=== Run ${i + 1}: ${total.toFixed(0)}ms ===`);

    const sorted = [...marks.entries()].sort((a, b) => b[1].total - a[1].total);

    for (const [label, entry] of sorted) {
        console.log(`  ${label}: ${entry.total.toFixed(0)}ms (x${entry.calls})`);
    }
}

const avg = runs.reduce((a, b) => a + b, 0) / runs.length;

console.log(`\n=== Average packem total: ${avg.toFixed(0)}ms ===`);
