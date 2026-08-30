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
const populateSourcemapContent = (sourcemap: RawSourceMap, basePath: string): (string | null)[] | undefined => {
    if (sourcemap.sourcesContent) {
        return undefined;
    }

    // Keep one entry per `sources` index. Missing files become `null`
    // placeholders so every remaining `sourcesContent` entry stays aligned with
    // its corresponding `sources` entry (filtering them out would shift the
    // indices and associate contents with the wrong source).
    return sourcemap.sources.map((source) => {
        const file = normalize(join(basePath, source));

        if (!existsSync(file)) {
            // `null` is the source-map spec value for a missing `sourcesContent` entry.
            // eslint-disable-next-line unicorn/no-null -- spec-mandated sourcesContent sentinel
            return null;
        }

        return readFileSync(file);
    });
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
    sourcemap?: RawSourceMap;
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
        const loaded: unknown = await loadModule(implementation, cwd, logger);

        if (typeof loaded !== "function") {
            throw new TypeError(`The Stylus implementation "${implementation}" is not a function.`);
        }

        return loaded as StylusImplementation;
    }

    return stylus as unknown as StylusImplementation;
};

const applyDefinitions = (style: StylusInstance, define: StylusLoaderOptions["define"]): void => {
    if (!define) {
        return;
    }

    const entries: StylusDefinition[] = Array.isArray(define) ? define : Object.entries(define);

    for (const entry of entries) {
        const [name, value, raw] = entry;

        style.define(name, value, raw);
    }
};

const applyPlugins = async (style: StylusInstance, use: StylusPlugin[] | undefined, cwd: string, logger: RollupLogger): Promise<void> => {
    if (!use || use.length === 0) {
        return;
    }

    for (const plugin of use) {
        if (typeof plugin === "function") {
            style.use(plugin);

            continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const loaded: unknown = await loadModule(plugin, cwd, logger);

        if (typeof loaded !== "function") {
            throw new TypeError(`Failed to load "${plugin}" Stylus plugin. Are you sure it's installed and exports a function?`);
        }

        const pluginFactory = loaded as (...args: unknown[]) => unknown;
        const factoryResult = pluginFactory();
        const pluginCallback = (typeof factoryResult === "function" ? factoryResult : pluginFactory) as (renderer: unknown) => void;

        style.use(pluginCallback);
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
        const cwd = this.cwd ?? process.cwd();

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

            data = typeof additionalData === "function" ? await additionalData(data, context) : `${additionalData}\n${data}`;
        }

        const impl = await resolveImplementation(implementation, cwd, this.logger);

        const style = impl(data, renderOptions).set("filename", this.id).set("paths", paths).set("sourcemap", { basePath, comment: false });

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
            style.render((error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });

        // Track file dependencies for watch mode
        for (const dependency of style.deps()) {
            this.deps.add(normalize(dependency));
        }

        // Populate sourcesContent since Stylus doesn't generate it
        if (style.sourcemap) {
            // The sourcemap spec permits `null` entries in `sourcesContent`; the
            // source-map-js type only models `string[]`, hence the cast.
            style.sourcemap.sourcesContent = populateSourcemapContent(style.sourcemap, basePath) as string[] | undefined;
        }

        return { code: css, map: mm(style.sourcemap).toString() ?? map };
    },

    test: /\.(styl|stylus)$/i,
};

export default loader;
export type { StylusDefinition, StylusLoaderContext, StylusLoaderOptions, StylusPlugin } from "./types";
