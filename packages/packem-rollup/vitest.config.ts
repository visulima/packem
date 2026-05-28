import { getVitestConfig } from "../../tools/get-vitest-config";

// `pool: "forks"` avoids an esbuild service teardown SIGSEGV that fires when
// vitest tears down thread workers after esbuild-using suites — tests pass,
// only the worker exit is unclean.
const config = getVitestConfig({
    test: {
        pool: "forks",
    },
});

export default config;
