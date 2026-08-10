import { rm } from "node:fs/promises";
import { join } from "node:path";

import { rolldown } from "rolldown";

import type { Builder, BuilderOptions } from "./types";

/**
 * Standalone rolldown, as a comparison target in its own right.
 *
 * packem's rolldown *backend* is already benchmarked through `packem.ts`; this
 * builder measures rolldown on its own so the two numbers can be read against
 * each other — how much of packem's rolldown time is rolldown, and how much is
 * packem on top of it.
 *
 * Rolldown transforms natively (oxc) and resolves node_modules itself, so there
 * is no plugin stack and no transformer matrix: the equivalent of rollup's
 * `esbuild`/`swc`/`babel` presets is a single built-in path. Config parity with
 * `rollup.ts` is kept where it is observable — minified output, `NODE_ENV`
 * folded to `production`, the automatic JSX runtime, and a browser-facing
 * resolve — so the comparison measures the bundler rather than the settings.
 */
export const rolldownBuilder: Builder = {
    async build({ entrypoint = "src/index.tsx", outDir = "./builds", project }: BuilderOptions) {
        const buildPaths = {
            appBuild: join(outDir, "build-rolldown"),
            appEntrypoint: `./projects/${project}/${entrypoint}`,
        };

        const bundle = await rolldown({
            define: {
                "process.env.NODE_ENV": JSON.stringify("production"),
            },
            input: buildPaths.appEntrypoint,
            // Silence per-module advisories so the timing is not skewed by console I/O,
            // matching `onwarn: () => {}` in the rollup builder.
            onLog: () => {},
            platform: "browser",
            resolve: {
                extensions: [".js", ".jsx", ".ts", ".tsx"],
            },
            transform: {
                jsx: "react-jsx",
            },
        });

        await bundle.write({
            dir: buildPaths.appBuild,
            format: "esm",
            minify: true,
        });

        await bundle.close();

        return buildPaths.appBuild;
    },

    async cleanup({ outDir = "./builds" }: BuilderOptions) {
        await rm(join(outDir, "build-rolldown"), { force: true, recursive: true });
    },

    name: "rolldown",
};
