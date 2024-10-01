import { fileURLToPath } from "node:url";

import { makeLegalIdentifier } from "@rollup/pluginutils";
import { isAccessibleSync, writeFileSync } from "@visulima/fs";
import { basename, dirname, join } from "@visulima/path";
import cssnano from "cssnano";
import type { AcceptedPlugin, ProcessOptions } from "postcss";
import postcss from "postcss";
import type { RawSourceMap } from "source-map-js";

import type { InjectOptions, InternalStyleOptions } from "../../types";
import { humanlizePath, normalizePath } from "../../utils/path";
import { resolveAsync } from "../../utils/resolve";
import safeId from "../../utils/safe-id";
import { mm } from "../../utils/sourcemap";
import type { Loader } from "../types";
import loadConfig from "./config";
import postcssICSS from "./icss";
import postcssImport from "./import";
import postcssModules from "./modules";
import postcssNoop from "./noop";
import postcssUrl from "./url";

const baseDirectory = dirname(fileURLToPath(import.meta.url));

let injectorId: string;
const testing = process.env.NODE_ENV === "test";

const cssVariableName = "css";
const reservedWords = new Set([cssVariableName]);

const getClassNameDefault = (name: string): string => {
    const id = makeLegalIdentifier(name);

    if (reservedWords.has(id)) {
        return `_${id}`;
    }

    return id;
};

const ensureAutoModules = (am: InternalStyleOptions["postcss"]["autoModules"] | undefined, id: string): boolean => {
    if (am === undefined) {
        return true;
    }

    if (typeof am === "function") {
        return am(id);
    }

    if (am instanceof RegExp) {
        return am.test(id);
    }

    return am && /\.module\.[A-Za-z]+$/.test(id);
};

type PostCSSOptions = InternalStyleOptions["postcss"] & Pick<Required<ProcessOptions>, "from" | "map" | "to">;

const loader: Loader<InternalStyleOptions["postcss"]> = {
    alwaysProcess: true,
    name: "postcss",
    // eslint-disable-next-line sonarjs/cognitive-complexity
    async process({ code, extracted, map }) {
        const config = await loadConfig(this.id, this.options.config);
        const plugins: AcceptedPlugin[] = [];
        const autoModules = ensureAutoModules(this.options.autoModules, this.id);
        const supportModules = Boolean((this.options.modules && ensureAutoModules(this.options.modules.include, this.id)) || autoModules);
        const modulesExports: Record<string, string> = {};

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
            to: this.options.to ?? this.id,
        };

        delete postcssOptions.plugins;

        if (this.import) {
            plugins.push(postcssImport({ extensions: this.extensions, ...this.import }));
        }

        if (this.url) {
            plugins.push(postcssUrl({ inline: Boolean(this.inject), ...this.url }));
        }

        if (this.options.plugins) {
            plugins.push(...this.options.plugins);
        }

        if (config.plugins) {
            plugins.push(...config.plugins);
        }

        if (supportModules) {
            const modulesOptions = typeof this.options.modules === "object" ? this.options.modules : {};

            plugins.push(
                ...postcssModules({
                    failOnWrongOrder: true,
                    generateScopedName: testing ? "[name]_[local]" : undefined,
                    ...modulesOptions,
                }),
                postcssICSS({ extensions: this.extensions }),
            );
        }

        if (this.minimize) {
            const cssnanoOptions = typeof this.minimize === "object" ? this.minimize : {};

            plugins.push(cssnano(cssnanoOptions));
        }

        // Avoid PostCSS warning
        if (plugins.length === 0) {
            plugins.push(postcssNoop);
        }

        const result = await postcss(plugins).process(code, postcssOptions);

        for (const message of result.messages) {
            // eslint-disable-next-line default-case
            switch (message.type) {
                case "warning": {
                    this.warn({ message: message.text as string, plugin: message.plugin });
                    break;
                }

                case "icss": {
                    Object.assign(modulesExports, message.export as Record<string, string>);
                    break;
                }

                case "dependency": {
                    this.deps.add(normalizePath(message.file as string));
                    break;
                }

                case "asset": {
                    this.assets.set(message.to as string, message.source as Uint8Array);
                    break;
                }
            }
        }

        map = mm(result.map.toJSON()).resolve(dirname(postcssOptions.to)).toString();

        if (!this.extract && this.sourceMap) {
            const m = mm(map)
                .modify((map) => void delete (map as Partial<RawSourceMap>).file)
                .relative();

            if (this.sourceMap.transform) {
                m.modify(this.sourceMap.transform);
            }

            map = m.toString();

            result.css += m.toCommentData();
        }

        if (this.emit) {
            return { code: result.css, map };
        }

        const saferId = (id: string): string => safeId(id, basename(this.id));
        const modulesVariableName = saferId("modules");

        const output = [`var ${cssVariableName} = ${JSON.stringify(result.css)};`];
        const dts = [`var ${cssVariableName}: string;`];
        const outputExports = [cssVariableName];

        if (this.namedExports) {
            const getClassName = typeof this.namedExports === "function" ? this.namedExports : getClassNameDefault;

            // eslint-disable-next-line guard-for-in
            for (const name in modulesExports) {
                const newName = getClassName(name);

                if (name !== newName) {
                    this.warn(`Exported \`${name}\` as \`${newName}\` in ${humanlizePath(this.id)}`);
                }

                // eslint-disable-next-line security/detect-object-injection
                const fmt = JSON.stringify(modulesExports[name]);

                output.push(`var ${newName} = ${fmt};`);

                if (this.dts) {
                    dts.push(`var ${newName}: ${fmt};`);
                }

                outputExports.push(newName);
            }
        }

        if (this.extract) {
            // eslint-disable-next-line no-param-reassign
            extracted = { css: result.css, id: this.id, map };
        }

        if (this.inject) {
            if (typeof this.inject === "function") {
                output.push(this.inject(cssVariableName, this.id, output), `var ${modulesVariableName} = ${JSON.stringify(modulesExports)};`);
            } else {
                const { treeshakeable, ...injectorOptions } = typeof this.inject === "object" ? this.inject : ({} as InjectOptions);

                const injectorName = saferId("injector");
                const injectorCall = `${injectorName}(${cssVariableName},${JSON.stringify(injectorOptions)});`;

                if (!injectorId) {
                    injectorId = await resolveAsync(["./runtime/inject-css"], { basedirs: [join(testing ? process.cwd() : join(baseDirectory, ".."))] });
                    injectorId = `"${normalizePath(injectorId)}"`;
                }

                output.unshift(`import ${injectorName} from ${injectorId};`);

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

        if (!this.inject) {
            output.push(`var ${modulesVariableName} = ${JSON.stringify(modulesExports)};`);
        }

        const defaultExport = `export default ${supportModules ? modulesVariableName : cssVariableName};`;

        const namedExport = `export {\n  ${outputExports.filter(Boolean).join(",\n  ")}\n};`;
        output.push(defaultExport, namedExport);

        if (this.dts && isAccessibleSync(this.id)) {
            if (supportModules)
                dts.push(
                    `interface ModulesExports {${Object.keys(modulesExports)
                        .map((key) => `  '${key}': string;`)
                        .join("\n")}
}`,
                    typeof this.inject === "object" && this.inject.treeshakeable ? `interface ModulesExports {inject:()=>void}` : "",
                    `declare const ${modulesVariableName}: ModulesExports;`,
                );

            dts.push(defaultExport, namedExport);

            writeFileSync(`${this.id}.d.ts`, dts.filter(Boolean).join("\n"));
        }

        return { code: output.filter(Boolean).join("\n"), extracted, map };
    },
};

export default loader;
