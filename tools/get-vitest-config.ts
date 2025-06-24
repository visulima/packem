/// <reference types="vitest" />
import type { UserConfig } from "vitest/config";
import { defineConfig, configDefaults, coverageConfigDefaults } from "vitest/config";

// https://vitejs.dev/config/
export const getVitestConfig = (options: UserConfig = {}) => {
    const VITEST_SEQUENCE_SEED = Date.now();

    console.log("VITEST_SEQUENCE_SEED", VITEST_SEQUENCE_SEED);

    return defineConfig({
        ...options,
        test: {
            ...configDefaults,
            pool: "threads",
            poolOptions: {
                threads: {
                    // Conservative thread settings for stability
                    maxThreads: 2,
                    minThreads: 1,
                    isolate: true,
                    useAtomics: true,
                },
            },
            maxConcurrency: 2,
            // Enhanced coverage configuration
            coverage: {
                ...coverageConfigDefaults,
                provider: "v8",
                reporter: ["clover", "cobertura", "lcov", "text", "html"],
                include: ["src"],
                exclude: [
                    "__fixtures__/**",
                    "__bench__/**",
                    "scripts/**",
                    "**/*.config.*",
                    "**/*.d.ts",
                    "**/types.ts",
                    "**/__tests__/**",
                    "**/node_modules/**",
                ],
                // Coverage thresholds
                thresholds: {
                    global: {
                        branches: 80,
                        functions: 80,
                        lines: 80,
                        statements: 80,
                    },
                },
            },
            environment: "node",
            reporters: process.env.CI_PREFLIGHT ? ["default", "github-actions"] : ["default"],
            sequence: {
                seed: VITEST_SEQUENCE_SEED,
                shuffle: false,
                // Disable concurrent execution to prevent expect.assertions() issues
                concurrent: false,
            },
            typecheck: {
                enabled: false,
            },
            // Better error reporting
            outputFile: {
                json: "./test-results.json",
                junit: "./test-results.xml",
            },
            ...options.test,
            exclude: [...configDefaults.exclude, "__fixtures__/**", ...(options.test?.exclude ?? [])],
        },
    });
};
