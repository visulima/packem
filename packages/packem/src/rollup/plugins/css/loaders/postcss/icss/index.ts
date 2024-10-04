import { extractICSS, replaceSymbols, replaceValueSymbols } from "icss-utils";
import type { PluginCreator, Result } from "postcss";

import type { Load } from "./load";
import loadDefault from "./load";
import resolve from "./resolve";

const name = "styles-icss";
const extensionsDefault = [".css", ".pcss", ".postcss", ".sss"];

interface InteroperableCSSOptions {
    extensions?: string[];
    load?: Load;
}

const plugin: PluginCreator<InteroperableCSSOptions> = (options = {}) => {
    const load = options.load ?? loadDefault;
    const extensions = options.extensions ?? extensionsDefault;

    return {
        async OnceExit(css, { result }) {
            if (!css.source?.input.file) {
                return;
            }

            const resultOptions: Result["opts"] = { ...result.opts, map: undefined };

            const { icssExports, icssImports } = extractICSS(css);

            const imports = await resolve(icssImports, load, css.source.input.file, extensions, result.processor, resultOptions);

            replaceSymbols(css, imports);

            for (const [k, v] of Object.entries(icssExports)) {
                result.messages.push({
                    export: { [k]: replaceValueSymbols(v, imports) },
                    plugin: name,
                    type: "icss",
                });
            }
        },
        postcssPlugin: name,
    };
};

plugin.postcss = true;

export default plugin;
