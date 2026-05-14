/* eslint-disable import/no-extraneous-dependencies */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { BuildConfig } from "@visulima/packem/config";
import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

// Older @visulima/rollup-plugin-dts versions (used by published packem to bootstrap-build
// this package) rename `declare global { ... }` to `declare _0 { ... }`, which is invalid
// TS. Our own src fixes that rename, but the bootstrap can't use it. Patch the emitted
// `.d.ts` chunks back to `declare global { ... }` so downstream tsc consumers pass.
const patchDeclareGlobal = async (distDir: string): Promise<void> => {
    const stack: string[] = [distDir];

    while (stack.length > 0) {
        const dir = stack.pop() as string;
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                stack.push(fullPath);
            } else if (entry.isFile() && entry.name.endsWith(".d.ts")) {
                const source = await readFile(fullPath, "utf8");
                const patched = source.replace(/^declare _\d+ \{$/gm, "declare global {");

                if (patched !== source) {
                    await writeFile(fullPath, patched);
                }
            }
        }
    }
};

export default defineConfig({
    externals: ["rollup"],
    hooks: {
        "build:done": async (context) => {
            await patchDeclareGlobal(join(context.options.rootDir, context.options.outDir));
        },
    },
    node10Compatibility: {
        typeScriptVersion: ">=5.5",
        writeToPackageJson: true,
    },
    rollup: {
        license: {
            path: "./LICENSE.md",
        },
    },
    runtime: "node",
    transformer,
}) as BuildConfig;
