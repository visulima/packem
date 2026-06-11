import type { PluginItem, TransformOptions } from "@babel/core";
import { transformAsync as babelTransform } from "@babel/core";

const tsRE = /\.tsx?$/;
const COMPILER_ANNOTATION_RE = /['"]use memo['"]/;

/**
 * Stable key under which the (constant-per-build) transform options are cached in
 * each worker, so they are sent across the thread boundary once rather than cloned
 * per file. There is exactly one options object per plugin instance.
 */
const OPTIONS_KEY = "babel-options" as const;

/**
 * Error message a worker throws when it has not yet received the full options for a
 * given {@link OPTIONS_KEY}. The main thread detects it and retries that single call
 * with the options payload attached.
 */
const MISSING_OPTIONS_SENTINEL = "__packem_babel_missing_options__" as const;

/**
 * Helper function to find React Compiler plugin in Babel plugins array.
 * Used for React Compiler-specific optimizations like annotation mode filtering.
 */
const getReactCompilerPlugin = (plugins: PluginItem[]): PluginItem | undefined =>
    plugins.find((p: PluginItem) => p === "babel-plugin-react-compiler" || (Array.isArray(p) && p[0] === "babel-plugin-react-compiler"));

/**
 * Filters React Compiler plugin based on annotation mode.
 * When compilationMode is "annotation", only files with "use memo" directive are processed.
 * @see https://react.dev/learn/react-compiler/incremental-adoption#annotation-mode-configuration
 */
const filterReactCompilerByAnnotation = (plugins: PluginItem[], sourcecode: string): void => {
    if (plugins.length === 0) {
        return;
    }

    const reactCompilerPlugin = getReactCompilerPlugin(plugins);

    if (!reactCompilerPlugin || !Array.isArray(reactCompilerPlugin)) {
        return;
    }

    const compilerOptions = reactCompilerPlugin[1] as { compilationMode?: string } | undefined;

    if (compilerOptions?.compilationMode === "annotation" && !COMPILER_ANNOTATION_RE.test(sourcecode)) {
        // Remove React Compiler plugin if annotation mode and no "use memo" directive
        const pluginIndex = plugins.indexOf(reactCompilerPlugin);

        if (pluginIndex !== -1) {
            plugins.splice(pluginIndex, 1);
        }
    }
};

export interface TransformCodeOptions extends Omit<TransformOptions, "filename" | "sourceFileName"> {
    filename?: string;
    sourceFileName?: string;
}

export interface TransformCodeResult {
    code: string;
    map: TransformOptions["inputSourceMap"] | undefined;
}

/**
 * Runs a single Babel transform for one module.
 *
 * This holds all the per-file logic shared between the in-process (main thread)
 * and worker-thread code paths: React Compiler annotation-mode filtering, parser
 * plugin selection based on the file extension, and the actual `transformAsync`
 * call. Inputs and outputs are intentionally plain/serializable so the exact same
 * function can be invoked across a worker boundary.
 */
export const transformCode = async (
    sourcecode: string,
    id: string,
    // `filename`/`sourceFileName` are intentionally ignored: a single build-wide
    // value would be applied to EVERY module, silently changing per-file preset
    // behaviour (Babel keys overrides/`only`/`ignore`/config lookup off `filename`).
    // The per-module `id` is the correct filename for each transform, so it always
    // wins. The fields remain accepted for backwards-compatible call sites.
    { filename: _filename, generatorOpts, sourceFileName: _sourceFileName, ...transformOptions }: TransformCodeOptions,
): Promise<TransformCodeResult | undefined> => {
    // Get plugins array (create a copy to avoid mutating the original)
    let plugins: PluginItem[] = [];

    if (transformOptions.plugins && Array.isArray(transformOptions.plugins)) {
        plugins = [...transformOptions.plugins];
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
        filename: id,
        generatorOpts: {
            ...generatorOpts,
            decoratorsBeforeExport: true,
            // import attributes parsing available without plugin since 7.26
            importAttributesKeyword: "with",
        },
        parserOpts: {
            ...transformOptions.parserOpts,
            allowAwaitOutsideFunction: true,
            plugins: uniqueParserPlugins.length > 0 ? uniqueParserPlugins : [],
            sourceType: "module",
        },
        plugins: plugins.length > 0 ? plugins : [],
        sourceFileName: id,
    });

    if (!result?.code) {
        return undefined;
    }

    return {
        code: result.code,
        map: result.map ?? undefined,
    };
};

export { MISSING_OPTIONS_SENTINEL, OPTIONS_KEY };
