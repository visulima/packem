/* eslint-disable sonarjs/no-nested-conditional, unicorn/no-nested-ternary */
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { writeFile } from "@visulima/fs";
import { dirname } from "@visulima/path";
import type { StyleOptions } from "@visulima/rollup-css-plugin";

import type { BuildConfig } from "../../src/types";
import installPackage from "./install-package";

const distributionPath = join(dirname(fileURLToPath(import.meta.url)), "../../dist");

export type PackemConfigProperties = {
    config?: BuildConfig | string | undefined;
    cssLoader?: ("less" | "lightningcss" | "postcss" | "sass" | "sourcemap" | "stylus")[];
    cssOptions?: StyleOptions | string | undefined;
    experimental?: Record<string, boolean>;
    isolatedDeclarationTransformer?: "oxc" | "swc" | "typescript" | undefined;
    minimizer?: "cssnano" | "lightningcss" | undefined;
    plugins?: {
        code: string;
        from?: string;
        importName?: string;
        namedExport?: boolean;
        when: "after" | "before";
    }[];
    runtime?: "browser" | "node";
    transformer?: "esbuild" | "oxc" | "sucrase" | "swc";
};

export const createPackemConfig = async (
    fixturePath: string,
    {
        config = undefined,
        cssLoader = [],
        cssOptions = undefined,
        experimental = {},
        isolatedDeclarationTransformer = undefined,
        minimizer = undefined,
        plugins = [],
        runtime = "node",
        transformer = "esbuild",
    }: PackemConfigProperties = {},
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<void> => {
    await installPackage(fixturePath, transformer === "swc" ? "@swc" : (transformer === "oxc" ? "oxc-transform" : transformer));

    let rollupConfig = "";

    if (typeof config === "object" || cssLoader.length > 0 || plugins.length > 0) {
        rollupConfig = "\n    rollup: {\n";
    }

    if (config === undefined) {
        // eslint-disable-next-line no-param-reassign
        config = "";
    } else if (typeof config === "object") {
        const { rollup, ...rest } = config;

        if (rollup?.css && cssLoader.length > 0) {
            throw new Error("Cannot use both `rollup.css` and `cssLoader` options in the same configuration");
        }

        if (rollup) {
            rollupConfig += `${JSON.stringify(rollup, undefined, 4).slice(1, -1)},\n`;
        }

        if (typeof rest === "object") {
            // eslint-disable-next-line no-param-reassign
            config = JSON.stringify(rest, undefined, 4).slice(1, -1);

            if (config !== "") {
                // eslint-disable-next-line no-param-reassign
                config += ",";
            }
        }
    }

    if (cssLoader.length > 0) {
        rollupConfig += `        css: {\n        loaders: [${cssLoader.map((loader) => `${loader}Loader`).join(", ")}],${minimizer ? `\n        minifier: ${minimizer},` : ""}${typeof cssOptions === "string" ? cssOptions : typeof cssOptions === "object" ? JSON.stringify(cssOptions, undefined, 4).slice(1, -1) : ""}
    },`;
    }

    const pluginImports: string[] = [];
    const pluginCode: string[] = [];

    for (const plugin of plugins) {
        if (plugin.namedExport !== undefined && plugin.importName && plugin.from) {
            pluginImports.push(
                `import ${plugin.namedExport ? `{${plugin.importName}}` : plugin.importName} from "${plugin.from.replace("__dist__", distributionPath)}";`,
            );
        }

        pluginCode.push(`{ ${plugin.when}: "packem:${transformer}", plugin: ${plugin.code}, }`);
    }

    if (pluginCode.length > 0) {
        rollupConfig += `\n    plugins: [\n        ${pluginCode.join(",\n")}\n    ],`;
    }

    if (rollupConfig !== "") {
        rollupConfig += "\n},";
    }

    await writeFile(
        join(fixturePath, "packem.config.ts"),
        `import { defineConfig } from "${distributionPath}/config";
import transformer from "${distributionPath}/rollup/plugins/${transformer}/${transformer === "swc" ? "swc-plugin" : transformer === "oxc" ? "oxc-transformer" : "index"}";
${isolatedDeclarationTransformer ? `import isolatedDeclarationTransformer from "${distributionPath}/rollup/plugins/${isolatedDeclarationTransformer}/isolated-declarations-${isolatedDeclarationTransformer}-transformer";` : ""}
${cssLoader.map((loader) => `import ${loader}Loader from "${distributionPath}/rollup/plugins/css/loaders/${loader}";`).join("\n")}
${minimizer ? `import ${minimizer} from "${distributionPath}/rollup/plugins/css/minifiers/${minimizer}";` : ""}${pluginImports.join("\n")}
// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    runtime: "${runtime}",
    experimental: ${JSON.stringify(experimental, undefined, 4)},
    transformer,${isolatedDeclarationTransformer ? `\n    isolatedDeclarationTransformer,` : ""}${config as string}${rollupConfig}
});
`,
        {
            overwrite: true,
        },
    );
};
