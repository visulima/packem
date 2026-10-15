/// <reference types="vitest" />
import codspeedPlugin from "@codspeed/vitest-plugin";
import type { ViteUserConfig } from "vitest/config";
import { defineConfig } from "vitest/config";

/**
 * Shared Vitest config for benchmark (`vitest bench`) runs.
 *
 * Kept separate from `get-vitest-config` for two reasons:
 *
 *  - The CodSpeed plugin should only load for benches. Under CodSpeed CI it
 *    instruments them; locally and in the normal test job it is a transparent
 *    pass-through, and there is no reason for the test suite to carry it.
 *  - The test config caps workers and disables concurrency for suite stability.
 *    Benches want the opposite constraints, and they must not inherit the test
 *    suite's `exclude` list or snapshot-path resolution.
 *
 * @param options Extra Vitest config merged over the defaults.
 * @returns A Vitest config for `vitest bench`.
 */
export const getBenchConfig = (options: ViteUserConfig = {}) =>
    defineConfig({
        ...options,
        plugins: [codspeedPlugin(), ...(options.plugins ?? [])],
        test: {
            environment: "node",
            // CodSpeed runs benches under cachegrind, which is roughly 50-100x slower
            // than a bare run. Setup that finishes instantly on a laptop otherwise
            // blows past Vitest's 10s hook default in CI and surfaces as a hook
            // timeout rather than as the slow instrumentation it is.
            hookTimeout: 300_000,
            // Vitest 5 runs benchmarks inside a `test()`, so this now bounds the
            // benchmarks themselves, where before it only bounded tests. The bench
            // project vitest derives from this config also clamps the value up to a
            // 60s floor, so a bench that legitimately runs for minutes has to opt out
            // per test with `{ timeout: 0 }`; several minutes is normal here (the tsc
            // resolver bench re-parses the tsconfig per call), and pre-5 benchmarks had
            // no wall clock deadline at all.
            testTimeout: 300_000,
            ...options.test,
            benchmark: {
                include: ["__bench__/**/*.bench.ts"],
                ...options.test?.benchmark,
            },
        },
    });
