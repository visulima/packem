import postcssSlowPlugins from "@csstools/postcss-slow-plugins";
import { makeLegalIdentifier } from "@rollup/pluginutils";
import { basename, dirname, normalize, relative } from "@visulima/path";
import type { AcceptedPlugin, ProcessOptions } from "postcss";
import postcss from "postcss";
import type { RawSourceMap } from "source-map-js";

import type { InjectOptions, InternalStyleOptions } from "../../types";
import safeId from "../../utils/safe-id";
import { mm } from "../../utils/sourcemap";
import type { Loader } from "../types";
import ensureAutoModules from "../utils/ensure-auto-modules";
import postcssICSS from "./icss";
import postcssImport from "./import";
import loadConfig from "./load-config";
import postcssModules from "./modules";
import postcssNoop from "./noop";
import postcssUrl from "./url";

/** Variable name used for the exported CSS string */
const cssVariableName = "css";

/** Set of reserved JavaScript keywords to avoid conflicts */
const reservedWords = new Set([cssVariableName]);

/**
 * Converts a CSS class name to a legal JavaScript identifier.
 * @param name CSS class name to convert
 * @returns Legal JavaScript identifier, prefixed with underscore if it conflicts with reserved words
 * @example
 * ```typescript
 * getClassNameDefault("my-class") // "my_class"
 * getClassNameDefault("css") // "_css" (reserved word)
 * ```
 */
const getClassNameDefault = (name: string): string => {
    const id = makeLegalIdentifier(name);

    if (reservedWords.has(id)) {
        return `_${id}`;
    }

    return id;
};

/** PostCSS options combining internal options with required PostCSS properties */
type PostCSSOptions = InternalStyleOptions["postcss"] & Pick<Required<ProcessOptions>, "from" | "map" | "to">;

/**
 * PostCSS loader for processing CSS with PostCSS plugins and CSS modules.
 *
 * This loader provides comprehensive CSS processing including:
 * - PostCSS plugin pipeline execution
 * - CSS modules support with automatic detection
 * - Import resolution and dependency tracking
 * - URL processing and asset handling
 * - Source map generation and transformation
 * - JavaScript code generation for CSS injection
 *
 * The loader always processes files since PostCSS can handle any CSS content
 * and provides the base transformation layer for other preprocessors.
 * @example
 * ```typescript
 * // CSS Modules processing
 * // Input: .button { color: red; }
 * // Output: JavaScript with hashed class names and CSS injection
 *
 * // Regular CSS processing
 * // Input: @import "normalize.css"; .app { color: blue; }
 * // Output: Resolved imports and processed CSS
 * ```
 */
const loader: Loader<NonNullable<InternalStyleOptions["postcss"]>> = {
    /** Always process files since PostCSS handles all CSS */
    alwaysProcess: true,
    name: "postcss",

    /**
     * Processes CSS content through the PostCSS pipeline.
     *
     * The processing includes:
     * 1. Loading PostCSS configuration
     * 2. Determining CSS modules support
     * 3. Setting up PostCSS plugins (import, url, modules, etc.)
     * 4. Processing CSS through PostCSS
     * 5. Handling PostCSS messages (warnings, dependencies, etc.)
     * 6. Generating JavaScript output for CSS injection
     * 7. Managing source maps
     * @param payload The payload containing CSS code and metadata
     * @param payload.code CSS content to process
     * @param payload.extracted Existing extracted CSS data
     * @param payload.map Input source map
     * @returns Processed payload with transformed CSS and generated JavaScript
     */
    // eslint-disable-next-line sonarjs/cognitive-complexity
    async process({ code, extracted, map }) {
        // Load PostCSS configuration from config files
        const config = await loadConfig(this.id, this.cwd as string, this.environment, this.logger, this.options.config);
        const plugins: AcceptedPlugin[] = [];

        let supportModules = false;

        // Determine CSS modules support from various sources
        if (typeof this.options.modules === "boolean") {
            supportModules = this.options.modules;
        } else if (typeof this.options.modules === "object") {
            supportModules = ensureAutoModules(this.options.modules.include, this.id);
        }

        // Check automatic CSS modules detection
        if (this.autoModules && this.options.modules === undefined) {
            supportModules = ensureAutoModules(this.autoModules, this.id);
        }

        /** CSS modules exports mapping class names to hashed names */
        const modulesExports: Record<string, string> = {};

        /** ICSS dependencies for CSS modules */
        const icssDependencies: string[] = [];

        // Configure PostCSS processing options
        const postcssOptions: PostCSSOptions = {
            ...config.options,
            ...this.options,
            from: this.id,
            map: {
                annotation: false,
                inline: false,
                prev: mm(map).relative(dirname(this.id)).toObject(),
                sourcesContent: this.sourceMap ? this.sourceMap.content : true,
            },
            plugins: [],
            to: this.options.to ?? this.id,
        };

        // Add PostCSS Import plugin for @import resolution
        if (this.options.import) {
            plugins.push(
                postcssImport({
                    debug: this.debug,
                    extensions: this.extensions,
                    plugins: [],
                    root: this.cwd as string,
                    warnOnEmpty: true,
                    ...this.options.import,
                }),
            );
        }

        // Add PostCSS URL plugin for url() processing
        if (this.options.url) {
            plugins.push(postcssUrl({ inline: Boolean(this.inject), ...this.options.url }));
        }

        // Add user-configured plugins
        if (this.options.plugins) {
            // @ts-expect-error - @TODO - fix typing
            plugins.push(...this.options.plugins);
        }

        // Add plugins from configuration files
        plugins.push(...config.plugins);

        // Add CSS modules plugins if enabled
        if (supportModules) {
            const modulesOptions = typeof this.options.modules === "object" ? this.options.modules : {};

            plugins.push(
                ...postcssModules({
                    failOnWrongOrder: true,
                    ...modulesOptions,
                }),
                postcssICSS({ extensions: this.extensions }),
            );
        }

        // Ensure at least one plugin is present to avoid PostCSS warnings
        if (plugins.length === 0) {
            plugins.push(postcssNoop);
        }

        // Add performance monitoring in debug mode
        if (this.debug) {
            plugins.push(
                postcssSlowPlugins({
                    ignore: ["css-noop"],
                }),
            );
        }

        // Process CSS through PostCSS pipeline
        const result = await postcss(plugins).process(code, postcssOptions as ProcessOptions);

        // Handle PostCSS messages (warnings, dependencies, assets, etc.)
        for (const message of result.messages) {
            // eslint-disable-next-line default-case
            switch (message.type) {
                case "asset": {
                    this.assets.set(message.to as string, message.source as Uint8Array);
                    break;
                }

                case "dependency": {
                    this.deps.add(normalize(message.file as string));
                    break;
                }

                case "icss": {
                    Object.assign(modulesExports, message.export as Record<string, string>);
                    break;
                }

                case "icss-dependency": {
                    icssDependencies.push(message.import as string);
                    break;
                }

                case "warning": {
                    this.logger.warn({ message: message.text as string, plugin: message.plugin });
                    break;
                }
            }
        }

        // Process and resolve source maps
        // eslint-disable-next-line no-param-reassign
        map = mm(result.map.toJSON()).resolve(dirname(postcssOptions.to)).toString();

        // Handle source map processing for non-extracted CSS
        if (!this.extract && this.sourceMap) {
            const mapModifier = mm(map)
                .modify((rawMM) => {
                    // eslint-disable-next-line no-param-reassign
                    (rawMM as Partial<RawSourceMap>).file = undefined;
                })
                .relative();

            if (this.sourceMap.transform) {
                mapModifier.modify(this.sourceMap.transform);
            }

            // eslint-disable-next-line no-param-reassign
            map = mapModifier.toString();

            result.css += mapModifier.toCommentData();
        }

        // Generate safe identifiers for JavaScript output
        const saferId = (id: string): string => safeId(id, basename(this.id));
        const modulesVariableName = saferId("modules");

        // Build JavaScript output for CSS injection
        const output = [`var ${cssVariableName} = ${JSON.stringify(result.css)};`];
        const dts = [];
        const outputExports = [cssVariableName];

        // Generate named exports for CSS modules
        if (this.namedExports) {
            if (this.dts) {
                dts.push(`declare const ${cssVariableName}: string;`);
            }

            const getClassName = typeof this.namedExports === "function" ? this.namedExports : getClassNameDefault;

            // eslint-disable-next-line guard-for-in
            for (const name in modulesExports) {
                const newName = getClassName(name);

                if (name !== newName) {
                    this.logger.warn({ message: `Exported \`${name}\` as \`${newName}\` in ${relative(this.cwd as string, this.id)}` });
                }

                const fmt = JSON.stringify(modulesExports[name]);

                output.push(`var ${newName} = ${fmt};`);

                if (this.dts) {
                    dts.push(`declare const ${newName}: ${fmt};`);
                }

                outputExports.push(newName);
            }
        }

        // Handle CSS extraction for separate CSS files
        if (this.extract) {
            // eslint-disable-next-line no-param-reassign
            extracted = { css: result.css, id: this.id, map };
        }

        // Handle CSS injection for runtime styles
        if (this.inject) {
            if (typeof this.inject === "function") {
                output.push(this.inject(cssVariableName, this.id, output), `var ${modulesVariableName} = ${JSON.stringify(modulesExports)};`);
            } else {
                const { treeshakeable, ...injectorOptions } = typeof this.inject === "object" ? this.inject : ({} as InjectOptions);

                const injectorName = saferId("injector");
                const injectorCall = `${injectorName}(${cssVariableName},${JSON.stringify(injectorOptions)});`;

                output.unshift(`import { cssStyleInject as ${injectorName} } from "@visulima/css-style-inject";`);

                if (!treeshakeable) {
                    output.push(`var ${modulesVariableName} = ${JSON.stringify(modulesExports)};`, injectorCall);
                }

                if (treeshakeable) {
                    output.push("var injected = false;");

                    const injectorCallOnce = `if (!injected) { injected = true; ${injectorCall} }`;

                    if (modulesExports.inject) {
                        throw new Error("`inject` keyword is reserved when using `inject.treeshakeable` option");
                    }

                    let getters = "";

                    for (const [k, v] of Object.entries(modulesExports)) {
                        const name = JSON.stringify(k);
                        const value = JSON.stringify(v);

                        getters += `get ${name}() { ${injectorCallOnce} return ${value}; },\n`;
                    }

                    getters += `inject: function inject() { ${injectorCallOnce} },`;

                    output.push(`var ${modulesVariableName} = {${getters}};`);
                }
            }
        }

        if (!this.inject && Object.keys(modulesExports).length > 0) {
            output.push(`var ${modulesVariableName} = ${JSON.stringify(modulesExports)};`);
        }

        const defaultExport = `\nexport default ${supportModules ? modulesVariableName : cssVariableName};\n`;

        output.push(defaultExport);

        if (this.dts) {
            if (supportModules) {
                dts.push(
                    `\ninterface ModulesExports {
${Object.keys(modulesExports)
    .map((key) => `  '${key}': string;`)
    .join("\n")}
}\n`,
                    typeof this.inject === "object" && this.inject.treeshakeable ? `interface ModulesExports {inject:()=>void}` : "",
                    `declare const ${modulesVariableName}: ModulesExports;`,
                );
            }

            dts.push(defaultExport);
        }

        if (this.namedExports) {
            const namedExport = `export {\n  ${outputExports.filter(Boolean).join(",\n  ")}\n};`;

            output.push(namedExport);

            if (this.dts) {
                dts.push(namedExport);
            }
        }

        const outputString = output.filter(Boolean).join("\n");
        const types = dts.length > 0 ? dts.filter(Boolean).join("\n") : undefined;

        if (this.emit) {
            return { code: result.css, map, meta: { icssDependencies, moduleContents: outputString, types } };
        }

        return {
            code: outputString,
            extracted,
            map,
            meta: {
                types,
            },
            moduleSideEffects: supportModules || (typeof this.inject === "object" && this.inject.treeshakeable) ? false : "no-treeshake",
        };
    },
};

export default loader;
