import { build } from "vite";
import react from "@vitejs/plugin-react";
import resolve from "@rollup/plugin-node-resolve";
import { errorToString, getArguments, getMetrics } from "./utils";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";

(async () => {
    try {
        const { project, preset, entrypoint = "src/index.tsx" } = getArguments();

        if (!project || !existsSync(`./projects/${project}`)) {
            throw new Error("Invalid project");
        } else if (preset) {
            throw new Error("Presets aren't supported");
        } else if (!existsSync(`./projects/${project}/${entrypoint}`)) {
            throw new Error(`Invalid entrypoint ${entrypoint}`);
        }

        const buildPaths = {
            appEntrypoint: `./projects/${project}/${entrypoint}`,
            appBuild: "./builds/build-vite",
        };

        await rm(buildPaths.appBuild, {
            recursive: true,
            force: true,
        });

        const startTime = Date.now();

        await build({
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

        console.log(getMetrics(startTime, buildPaths.appBuild));
        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
