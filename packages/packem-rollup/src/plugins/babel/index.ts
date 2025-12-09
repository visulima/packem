import type { PluginItem, TransformOptions } from "@babel/core";
import { transformAsync as babelTransform } from "@babel/core";
import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { EXCLUDE_REGEXP } from "@visulima/packem-share/constants";
import type { Plugin } from "rollup";

const tsRE = /\.tsx?$/;

/**
 * Helper function to find React Compiler plugin in Babel plugins array.
 * Used for React Compiler-specific optimizations like annotation mode filtering.
 */
const getReactCompilerPlugin = (plugins: PluginItem[]): PluginItem | undefined => {
    if (!plugins) {
        return undefined;
    }

    return plugins.find((p: PluginItem) => p === "babel-plugin-react-compiler" || (Array.isArray(p) && p[0] === "babel-plugin-react-compiler"));
};

/**
 * Filters React Compiler plugin based on annotation mode.
 * When compilationMode is "annotation", only files with "use memo" directive are processed.
 * @see https://react.dev/learn/react-compiler/incremental-adoption#annotation-mode-configuration
 */
const filterReactCompilerByAnnotation = (plugins: PluginItem[], sourcecode: string): void => {
    if (!plugins || !Array.isArray(plugins) || plugins.length === 0) {
        return;
    }

    const reactCompilerPlugin = getReactCompilerPlugin(plugins);
    const compilerAnnotationRE = /['"]use memo['"]/;

    if (!reactCompilerPlugin || !Array.isArray(reactCompilerPlugin)) {
        return;
    }

    const compilerOptions = reactCompilerPlugin[1] as { compilationMode?: string } | undefined;

    if (compilerOptions?.compilationMode === "annotation" && !compilerAnnotationRE.test(sourcecode)) {
        // Remove React Compiler plugin if annotation mode and no "use memo" directive
        const pluginIndex = plugins.indexOf(reactCompilerPlugin);

        if (pluginIndex !== -1) {
            plugins.splice(pluginIndex, 1);
        }
    }
};

export interface BabelPluginConfig extends Omit<TransformOptions, "filename" | "sourceFileName" | "exclude" | "include"> {
    exclude?: FilterPattern;
    filename?: string;
    include?: FilterPattern;
    sourceFileName?: string;
}

export const babelTransformPlugin = ({ exclude, filename, generatorOpts, include, sourceFileName, ...transformOptions }: BabelPluginConfig): Plugin => {
    const filter = createFilter(include, exclude ?? EXCLUDE_REGEXP);

    return <Plugin>{
        name: "packem:babel",

        async transform(sourcecode, id) {
            if (!filter(id)) {
                return undefined;
            }

            // Get plugins array (create a copy to avoid mutating the original)
            let plugins: PluginItem[] = [];

            if (transformOptions.plugins && Array.isArray(transformOptions.plugins)) {
                plugins = [...(transformOptions.plugins as PluginItem[])];
            }

            // Apply React Compiler-specific filtering (annotation mode)
            // This must happen at transform time since we need access to source code
            if (plugins.length > 0) {
                filterReactCompilerByAnnotation(plugins, sourcecode);
            }

            // Determine parser plugins based on file extension
            // Always initialize with at least jsx for JSX/TSX files (matching vite-plugin-solid behavior)
            const parserPlugins: NonNullable<NonNullable<TransformOptions["parserOpts"]>["plugins"]> = [];

            if (id.endsWith(".jsx") || id.endsWith(".tsx")) {
                parserPlugins.push("jsx");
            }

            if (tsRE.test(id)) {
                parserPlugins.push("typescript");
            }

            // Merge with user-provided parser plugins
            // User-provided plugins should come first to allow overrides
            const existingPlugins = transformOptions.parserOpts?.plugins;

            if (existingPlugins && Array.isArray(existingPlugins)) {
                parserPlugins.unshift(...existingPlugins);
            }

            // Remove duplicates while preserving order (keep first occurrence)
            const uniqueParserPlugins = [...new Set(parserPlugins)];

            const result = await babelTransform(sourcecode, {
                ...transformOptions,
                filename: filename ?? id,
                generatorOpts: {
                    ...generatorOpts,
                    decoratorsBeforeExport: true,
                    // import attributes parsing available without plugin since 7.26
                    importAttributesKeyword: "with",
                },
                parserOpts: {
                    ...transformOptions.parserOpts,
                    allowAwaitOutsideFunction: true,
                    plugins: uniqueParserPlugins.length > 0 ? (uniqueParserPlugins as NonNullable<TransformOptions["parserOpts"]>["plugins"]) : [],
                    sourceType: "module",
                },
                plugins: plugins.length > 0 ? plugins : [],
                sourceFileName: sourceFileName ?? id,
            });

            if (!result || !result.code) {
                return undefined;
            }

            return {
                code: result.code,
                map: result.map || undefined,
            };
        },
    };
};
