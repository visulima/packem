import { build as viteBuild } from "vite";
import react from "@vitejs/plugin-react";
import resolve from "@rollup/plugin-node-resolve";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { Builder, BuilderOptions } from "./types";

export const viteBuilder: Builder = {
    name: "vite",

    async build({ project, entrypoint = "src/index.tsx", outDir = "./builds" }: BuilderOptions) {
        const buildPaths = {
            appEntrypoint: `./projects/${project}/${entrypoint}`,
            appBuild: join(outDir, "build-vite"),
        };

        await viteBuild({
            mode: "production",
            build: {
                outDir: buildPaths.appBuild,
                minify: true,
                target: "es2015",
                rollupOptions: {
                    input: buildPaths.appEntrypoint,
                    output: {
                        entryFileNames: `[name].js`,
                    },
                    plugins: [
                        resolve({
                            preferBuiltins: true,
                            browser: true,
                            extensions: [".js", ".jsx", ".ts", ".tsx"],
                        }),
                    ],
                },
            },
            plugins: [
                react({
                    jsxRuntime: "automatic",
                }),
            ],
            logLevel: "error",
        });

        return buildPaths.appBuild;
    },

    async cleanup({ outDir = "./builds" }: BuilderOptions) {
        const buildPath = join(outDir, "build-vite");

        await rm(buildPath, { force: true, recursive: true });
    },
};
