import { existsSync } from "node:fs";

import { readFileSync } from "@visulima/fs";
import type { RollupLogger } from "@visulima/packem-share/utils";
import { dirname, join, normalize } from "@visulima/path";
import type { RawSourceMap } from "source-map-js";
import stylus from "stylus";

import loadModule from "../../utils/load-module";
import { mm } from "../../utils/sourcemap";
import type { Loader } from "../types";
import type { StylusDefinition, StylusLoaderContext, StylusLoaderOptions, StylusPlugin } from "./types";

/**
 * Populates the sourcesContent field in a source map by reading source files.
 *
 * Stylus compiler doesn't support sourcesContent generation, so we manually
 * read the source files and populate this field for proper source map functionality.
 */
const populateSourcemapContent = async (sourcemap: RawSourceMap, basePath: string): Promise<string[] | undefined> => {
    if (!sourcemap.sources || sourcemap.sourcesContent) {
        return undefined;
    }

    return (await Promise.all(
        sourcemap.sources
            .map(async (source) => {
                const file = normalize(join(basePath, source));

                if (!existsSync(file)) {
                    return undefined;
                }

                return readFileSync(file);
            })
            .filter(Boolean),
    )) as string[];
};

/**
 * Internal Stylus instance interface with additional properties.
 */
interface StylusInstance {
    define: (name: string, value: unknown, raw?: boolean) => StylusInstance;
    deps: (filename?: string) => string[];
    filename: string;
    import: (file: string) => StylusInstance;
    include: (path: string) => StylusInstance;
    render: (callback: (error: Error | undefined, css: string) => void) => void;
    set: (key: string, value: unknown) => StylusInstance;
    sourcemap: RawSourceMap;
    use: (plugin: (renderer: unknown) => void) => StylusInstance;
}

type StylusImplementation = (code: string, options?: unknown) => StylusInstance;

const resolveImplementation = async (
    implementation: StylusLoaderOptions["implementation"],
    cwd: string,
    logger: RollupLogger,
): Promise<StylusImplementation> => {
    if (typeof implementation === "function") {
        return implementation as StylusImplementation;
    }

    if (typeof implementation === "string") {
        const loaded = await loadModule(implementation, cwd, logger);

        if (typeof loaded !== "function") {
            throw new Error(`The Stylus implementation "${implementation}" is not a function.`);
        }

        return loaded as StylusImplementation;
    }

    return stylus as unknown as StylusImplementation;
};

const applyDefinitions = (style: StylusInstance, define: StylusLoaderOptions["define"]): void => {
    if (!define) {
        return;
    }

    const entries: StylusDefinition[] = Array.isArray(define)
        ? define
        : (Object.entries(define) as StylusDefinition[]);

    for (const entry of entries) {
        const [name, value, raw] = entry;

        style.define(name, value, raw);
    }
};

const applyPlugins = async (
    style: StylusInstance,
    use: StylusPlugin[] | undefined,
    cwd: string,
    logger: RollupLogger,
): Promise<void> => {
    if (!use || use.length === 0) {
        return;
    }

    for (const plugin of use) {
        if (typeof plugin === "function") {
            style.use(plugin);

            continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const loaded = await loadModule(plugin, cwd, logger);

        if (typeof loaded !== "function") {
            throw new Error(`Failed to load "${plugin}" Stylus plugin. Are you sure it's installed and exports a function?`);
        }

        const factoryResult = loaded();

        style.use(typeof factoryResult === "function" ? factoryResult : (loaded as (renderer: unknown) => void));
    }
};

/**
 * Stylus loader for processing Stylus stylesheets to CSS.
 */
const loader: Loader<StylusLoaderOptions> = {
    name: "stylus",

    // eslint-disable-next-line sonarjs/cognitive-complexity
    async process({ code, map }) {
        const {
            additionalData,
            define,
            disableCache,
            hoistAtrules,
            implementation,
            import: imports,
            include,
            includeCSS,
            lineNumbers,
            use,
            ...renderOptions
        } = this.options;

        const basePath = normalize(dirname(this.id));
        const cwd = (this.cwd as string) ?? process.cwd();

        // Build include paths (user paths + common roots)
        const paths = [basePath, join(basePath, "node_modules"), join(cwd, "node_modules")];

        if (renderOptions.paths) {
            paths.push(...renderOptions.paths);
        }

        // Apply additionalData before compilation
        let data = code;

        if (additionalData !== undefined) {
            const context: StylusLoaderContext = {
                environment: this.environment,
                resourcePath: this.id,
                rootContext: cwd,
            };

            data = typeof additionalData === "function"
                ? await additionalData(data, context)
                : `${additionalData}\n${data}`;
        }

        const impl = await resolveImplementation(implementation, cwd, this.logger);

        const style = impl(data, renderOptions)
            .set("filename", this.id)
            .set("paths", paths)
            .set("sourcemap", { basePath, comment: false });

        if (includeCSS) {
            style.set("include css", true);
        }

        if (hoistAtrules) {
            style.set("hoist atrules", true);
        }

        if (lineNumbers) {
            style.set("linenos", true);
        }

        if (disableCache) {
            style.set("cache", false);
        }

        // Additional include paths (besides the default resolution paths)
        if (include) {
            for (const includedPath of include) {
                style.include(includedPath);
            }
        }

        // Pre-imported files (applied to every entry)
        if (imports) {
            for (const imported of imports) {
                style.import(imported);
            }
        }

        await applyPlugins(style, use, cwd, this.logger);

        applyDefinitions(style, define);

        // Compile Stylus to CSS
        const css = await new Promise<string>((resolve, reject) => {
            style.render((error, result) => (error ? reject(error) : resolve(result)));
        });

        // Track file dependencies for watch mode
        for (const dep of style.deps()) {
            this.deps.add(normalize(dep));
        }

        // Populate sourcesContent since Stylus doesn't generate it
        if (style.sourcemap) {
            style.sourcemap.sourcesContent = await populateSourcemapContent(style.sourcemap, basePath);
        }

        return { code: css, map: mm(style.sourcemap as unknown as RawSourceMap).toString() ?? map };
    },

    test: /\.(styl|stylus)$/i,
};

export default loader;
export type { StylusDefinition, StylusLoaderContext, StylusLoaderOptions, StylusPlugin } from "./types";
