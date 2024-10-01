import type { Plugin } from "postcss";
import type Processor from "postcss/lib/processor";
import extractImports from "postcss-modules-extract-imports";
import localByDefault from "postcss-modules-local-by-default";
import modulesScope from "postcss-modules-scope";
import modulesValues from "postcss-modules-values";

import generateScopedNameDefault from "./generate";
import type { InternalStyleOptions } from "../../../types";

/** Options for [CSS Modules](https://github.com/css-modules/css-modules) */
export interface ModulesOptions {
    /** Export global classes */
    exportGlobals?: boolean;
    /** Fail on wrong order of composition */
    failOnWrongOrder?: boolean;
    /**
     * Placeholder or function for scoped name generation.
     * Allowed blocks for placeholder:
     * - `[dir]`: The directory name of the asset.
     * - `[name]`: The file name of the asset excluding any extension.
     * - `[local]`: The original value of the selector.
     * - `[hash(:<num>)]`: A hash based on the name and content of the asset (with optional length).
     * @default "[name]_[local]__[hash:8]"
     */
    generateScopedName?: string | ((name: string, file: string, css: string) => string);
    /**
     * Default mode for classes
     * @default "local"
     */
    mode?: "global" | "local" | "pure"
    /**
     * Files to include for [CSS Modules](https://github.com/css-modules/css-modules)
     * for files named `[name].module.[ext]`
     * (e.g. `foo.module.css`, `bar.module.stylus`),
     * or pass your own function or regular expression
     * @default false
     */;
    include?: InternalStyleOptions["postcss"]["autoModules"];
}

export default (options: ModulesOptions): (Plugin | Processor)[] => {
    const config = {
        mode: "local" as const,
        ...options,
        generateScopedName:
            typeof options.generateScopedName === "function" ? options.generateScopedName : generateScopedNameDefault(options.generateScopedName),
    };

    return [
        modulesValues(),
        localByDefault({ mode: config.mode }),
        extractImports({ failOnWrongOrder: config.failOnWrongOrder }),
        modulesScope({
            exportGlobals: config.exportGlobals,
            generateScopedName: config.generateScopedName,
        }),
    ];
};
