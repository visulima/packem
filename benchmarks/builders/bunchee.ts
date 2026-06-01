import { bundle } from "bunchee";
import { mkdir, readdir, rm } from "node:fs/promises";
import process from "node:process";
import { move } from "@visulima/fs";
import type { Builder, BuilderOptions } from "./types";
import { join } from "node:path";

export const buncheeBuilder: Builder = {
    name: "bunchee",

    async build({ project, entrypoint = "src/index.tsx", outDir = "./builds" }: BuilderOptions) {
        const nodeEnvBackup = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";

        await bundle(`./projects/${project}/${entrypoint}`, {
            //tsconfig: `./projects/${project}/tsconfig.json`,
            format: "cjs",
            minify: true,
            target: "es2015",
            env: ["NODE_ENV"],
            cwd: `./projects/${project}`,
            external: null,
        });

        process.env.NODE_ENV = nodeEnvBackup;

        return join(outDir, "build-bunchee");
    },

    move: async ({ project, outDir = "./builds" }: BuilderOptions): Promise<void> => {
        const appBuild = join(outDir, "build-bunchee");
        const dist = `./projects/${project}/dist`;

        // Workaround for bunchee not supporting output directory
        await mkdir(appBuild, {
            recursive: true,
        });

        for (const files of await readdir(dist, { withFileTypes: true })) {
            if (files.isFile()) {
                await move(`${dist}/${files.name}`, join(appBuild, files.name));
            }
        }
    },

    async cleanup({ project, outDir = "./builds" }: BuilderOptions) {
        // Clean up the build directory
        await rm(join(outDir, "build-bunchee"), {
            recursive: true,
            force: true,
        });

        // Clean up the temporary dist directory
        await rm(`./projects/${project}/dist`, {
            recursive: true,
            force: true,
        });
    },
};
