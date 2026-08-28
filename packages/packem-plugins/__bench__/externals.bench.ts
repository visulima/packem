import type { InputOptions } from "rollup";
import { bench, describe } from "vitest";

import { externalsPlugin } from "../src/plugins/externals";

/**
 * Benchmarks for the two critical externals hot-path optimizations:
 *   1. isIncluded/isExcluded no longer spread the include/exclude Sets to a fresh
 *      array per import edge (snapshotted to arrays once in the closure).
 *   2. the declared-dependency check uses a precomputed Set instead of rebuilding
 *      Object.keys(...).includes four times per bare-specifier edge.
 *
 * Both live inside the closure returned by `externalsPlugin`, so the bench drives
 * the real plugin through rollup's `options.external` arbiter with a realistic
 * package.json (large dependency/devDependency lists) and many distinct import
 * edges.
 */

const makeDeps = (prefix: string, count: number): Record<string, string> => {
    const out: Record<string, string> = {};

    for (let index = 0; index < count; index++) {
        out[`${prefix}-pkg-${index}`] = "^1.0.0";
    }

    return out;
};

const buildContext = () => {
    const dependencies = makeDeps("dep", 120);
    const devDependencies = makeDeps("dev", 120);
    const peerDependencies = makeDeps("peer", 40);
    const optionalDependencies = makeDeps("opt", 20);

    const noopLogger = {
        debug() {},
        info() {},
        warn() {},
    };

    return {
        hoistedDependencies: new Set<string>(),
        implicitDependencies: new Set<string>(),
        logger: noopLogger,
        options: {
            externals: [],
            rollup: { alias: false, resolveExternals: {} },
            rootDir: "/project",
            sourceDir: "src",
            validation: { dependencies: { hoisted: { exclude: [] } } },
        },
        pkg: {
            dependencies,
            devDependencies,
            name: "@scope/bench-pkg",
            optionalDependencies,
            peerDependencies,
        },
        usedDependencies: new Set<string>(),
    } as unknown as Parameters<typeof externalsPlugin>[0];
};

const getExternalFn = () => {
    const plugin = externalsPlugin(buildContext());
    const rollupOptions = {} as InputOptions;

    // options is declared as a function on the plugin object.
    (plugin.options as (o: InputOptions) => void)(rollupOptions);

    return rollupOptions.external as (id: string, importer: string | undefined) => boolean | undefined;
};

// Realistic edge set: a mix of declared deps, node builtins (importer-dependent
// branch), unlisted bare specifiers and relative ids. Distinct ids/importers so the
// per-edge cache does not short-circuit the whole loop.
const edges: [string, string][] = [];

for (let index = 0; index < 200; index++) {
    edges.push([`dep-pkg-${index % 120}`, `/project/src/file-${index}.ts`]);
    edges.push([`dev-pkg-${index % 120}`, `/project/src/other-${index}.ts`]);
    edges.push(["node:fs", `/project/src/builtin-${index}.ts`]);
    edges.push([`unlisted-${index}`, `/project/src/unlisted-${index}.ts`]);
    edges.push([`./relative-${index}.ts`, `/project/src/rel-${index}.ts`]);
}

describe("externalsPlugin options.external over a large import graph", () => {
    bench("resolve external decision for ~1000 distinct import edges", () => {
        const external = getExternalFn();

        for (const [id, importer] of edges) {
            external(id, importer);
        }
    });
});

// Micro-benchmark isolating the two patterns the optimization replaced, so the win
// is directly measurable regardless of surrounding plugin overhead.
describe("hot-path micro patterns", () => {
    const patternSet = new Set<RegExp>();

    for (let index = 0; index < 60; index++) {
        patternSet.add(new RegExp(`^lib-${index}(?:/.+)?$`));
    }

    const patternArray = [...patternSet];
    const probe = "lib-59/sub/path";

    bench("isIncluded BEFORE: [...set].some(rx.test)", () => {
        for (let index = 0; index < 1000; index++) {
            [...patternSet].some((rx) => rx.test(probe));
        }
    });

    bench("isIncluded AFTER: prebuilt array.some(rx.test)", () => {
        for (let index = 0; index < 1000; index++) {
            patternArray.some((rx) => rx.test(probe));
        }
    });

    const deps = makeDeps("dep", 120);
    const devDeps = makeDeps("dev", 120);
    const peerDeps = makeDeps("peer", 40);
    const optDeps = makeDeps("opt", 20);
    const declaredSet = new Set<string>([...Object.keys(deps), ...Object.keys(devDeps), ...Object.keys(peerDeps), ...Object.keys(optDeps)]);
    const name = "peer-pkg-39";

    bench("declared BEFORE: 4x Object.keys().includes", () => {
        for (let index = 0; index < 1000; index++) {
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            Object.keys(deps).includes(name)
                || Object.keys(devDeps).includes(name)
                || Object.keys(peerDeps).includes(name)
                || Object.keys(optDeps).includes(name);
        }
    });

    bench("declared AFTER: Set.has", () => {
        for (let index = 0; index < 1000; index++) {
            declaredSet.has(name);
        }
    });
});
