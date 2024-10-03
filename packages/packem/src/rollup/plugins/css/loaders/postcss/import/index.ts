import { dirname } from "@visulima/path";
import type { AtRule, PluginCreator, Result } from "postcss";
import postcss from "postcss";
import valueParser from "postcss-value-parser";

import { isAbsolutePath, normalizePath } from "../../../utils/path";
import type { ImportResolve } from "./resolve";
import { resolve as resolveDefault } from "./resolve";

const name = "styles-import";
const extensionsDefault = [".css", ".pcss", ".postcss", ".sss"];

const plugin: PluginCreator<ImportOptions> = (options = {}) => {
    const resolve = options.resolve ?? resolveDefault;
    const alias = options.alias ?? {};
    const extensions = options.extensions ?? extensionsDefault;

    return {
        // eslint-disable-next-line sonarjs/cognitive-complexity
        async Once(css, { result }) {
            if (!css.source?.input.file) {
                return;
            }

            const resultOptions: Result["opts"] = { ...result.opts, map: undefined };

            const { file } = css.source.input;
            const importList: { rule: AtRule; url: string }[] = [];
            const basedir = dirname(file);

            css.walkAtRules(/^import$/i, (rule) => {
                // Top level only
                if (rule.parent && rule.parent.type !== "root") {
                    rule.warn(result, "`@import` should be top level");
                    return;
                }

                // Child nodes should not exist
                if (rule.nodes) {
                    rule.warn(result, "`@import` was not terminated correctly");
                    return;
                }

                const [urlNode] = valueParser(rule.params).nodes;

                // No URL detected
                if (!urlNode || (urlNode.type !== "string" && urlNode.type !== "function")) {
                    rule.warn(result, `No URL in \`${rule.toString()}\``);
                    return;
                }

                let url = "";

                if (urlNode.type === "string") {
                    url = urlNode.value;
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                } else if (urlNode.type === "function") {
                    // Invalid function
                    if (!/^url$/i.test(urlNode.value)) {
                        rule.warn(result, `Invalid \`url\` function in \`${rule.toString()}\``);
                        return;
                    }

                    const isString = urlNode.nodes[0]?.type === "string";

                    url = isString ? (urlNode.nodes[0] as valueParser.Node).value : valueParser.stringify(urlNode.nodes);
                }

                url = url.replaceAll(/^\s+|\s+$/g, "");

                // Resolve aliases
                for (const [from, to] of Object.entries(alias)) {
                    if (url !== from && !url.startsWith(`${from}/`)) {
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    url = normalizePath(to) + url.slice(from.length);
                }

                // Empty URL
                if (url.length === 0) {
                    rule.warn(result, `Empty URL in \`${rule.toString()}\``);
                    return;
                }

                // Skip Web URLs
                if (!isAbsolutePath(url)) {
                    try {
                        // eslint-disable-next-line no-new
                        new URL(url);
                        return;
                    } catch {
                        // Is not a Web URL, continuing
                    }
                }

                importList.push({ rule, url });
            });

            for await (const { rule, url } of importList) {
                try {
                    const { from, source } = await resolve(url, basedir, extensions);

                    if (!(source instanceof Uint8Array) || typeof from !== "string") {
                        rule.warn(result, `Incorrectly resolved \`@import\` in \`${rule.toString()}\``);
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    if (normalizePath(from) === normalizePath(file)) {
                        rule.warn(result, `\`@import\` loop in \`${rule.toString()}\``);
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    const imported = await postcss(plugin(options)).process(source, { ...resultOptions, from });

                    result.messages.push(...imported.messages, { file: from, plugin: name, type: "dependency" });

                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    if (imported.root) {
                        rule.replaceWith(imported.root);
                    } else {
                        rule.remove();
                    }
                } catch {
                    rule.warn(result, `Unresolved \`@import\` in \`${rule.toString()}\``);
                }
            }
        },
        postcssPlugin: name,
    };
};

plugin.postcss = true;

/** `@import` handler options */
export interface ImportOptions {
    /**
     * Aliases for import paths.
     * Overrides the global `alias` option.
     * - ex.: `{"foo":"bar"}`
     */
    alias?: Record<string, string>;
    /**
     * Import files ending with these extensions.
     * Overrides the global `extensions` option.
     * @default [".css", ".pcss", ".postcss", ".sss"]
     */
    extensions?: string[];
    /**
     * Provide custom resolver for imports
     * in place of the default one
     */
    resolve?: ImportResolve;
}

export default plugin;
