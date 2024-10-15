import { basename, dirname, isAbsolute, join, normalize } from "@visulima/path";
import type { Declaration, PluginCreator } from "postcss";
import type { Node, ParsedValue } from "postcss-value-parser";
import valueParser from "postcss-value-parser";

import { mm } from "../../../utils/sourcemap";
import { DATA_URI_REGEXP, FIRST_EXTENSION_REGEXP } from "../constants";
import generateName from "./generate";
import inlineFile from "./inline";
import type { UrlFile, UrlResolve } from "./url-resolve";
import { urlResolve } from "./url-resolve";
import { isDeclWithUrl, walkUrls } from "./utils";

const name = "styles-url";
const placeholderHashDefault = "assets/[name]-[hash][extname]";
const placeholderNoHashDefault = "assets/[name][extname]";
const defaultPublicPath = "./assets/";
const defaultAssetDirectory = ".";

// eslint-disable-next-line sonarjs/cognitive-complexity
const plugin: PluginCreator<UrlOptions> = (userOptions) => {
    const options = {
        alias: {},
        assetDir: defaultAssetDirectory,
        inline: false,
        resolve: urlResolve,
        ...userOptions,
    };
    const placeholder = (options.hash ?? true) ? (typeof options.hash === "string" ? options.hash : placeholderHashDefault) : placeholderNoHashDefault;

    return {
        async Once(css, { result }) {
            if (!css.source?.input.file) {
                return;
            }

            const { file } = css.source.input;

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            const map = mm(css.source.input.map?.text ?? undefined)
                .resolve(dirname(file))
                .toConsumer();

            const urlList: {
                baseDirs: Set<string>;
                decl: Declaration;
                node: Node;
                parsed: ParsedValue;
                url: string;
            }[] = [];

            const imported = new Set(result.messages.filter((message) => message.type === "dependency").map((message) => message.file as string));

            css.walkDecls((decl) => {
                if (!isDeclWithUrl(decl)) {
                    return;
                }

                const parsed = valueParser(decl.value);

                walkUrls(parsed, (url, node) => {
                    // Resolve aliases
                    for (const [from, to] of Object.entries(options.alias)) {
                        if (url !== from && !url.startsWith(`${from}/`)) {
                            // eslint-disable-next-line no-continue
                            continue;
                        }

                        // eslint-disable-next-line no-param-reassign
                        url = normalize(to) + url.slice(from.length);
                    }

                    // Empty URL
                    if (!node || url.length === 0) {
                        decl.warn(result, `Empty URL in \`${decl.toString()}\``);
                        return;
                    }

                    // Skip Data URI
                    if (DATA_URI_REGEXP.test(url)) {
                        return;
                    }

                    // Skip Web URLs
                    if (!isAbsolute(url)) {
                        try {
                            // eslint-disable-next-line no-new
                            new URL(url);

                            return;
                        } catch {
                            // Is not a Web URL, continuing
                        }
                    }

                    const baseDirectories = new Set<string>();

                    // Use PostCSS imports
                    if (decl.source?.input.file && imported.has(decl.source.input.file)) {
                        baseDirectories.add(dirname(decl.source.input.file));
                    }

                    // Use SourceMap
                    if (decl.source?.start) {
                        const pos = decl.source.start;
                        const realPos = map?.originalPositionFor(pos);
                        const basedir = realPos?.source && dirname(realPos.source);

                        if (basedir) {
                            baseDirectories.add(normalize(basedir));
                        }
                    }

                    // Use current file
                    baseDirectories.add(dirname(file));

                    urlList.push({ baseDirs: baseDirectories, decl, node, parsed, url });
                });
            });

            const usedNames = new Map<string, string>();

            for await (const { baseDirs, decl, node, parsed, url } of urlList) {
                let resolved: UrlFile | undefined;

                try {
                    if (!resolved) {
                        resolved = await options.resolve(url, [...baseDirs]);
                    }
                } catch {
                    /* noop */
                }

                if (!resolved) {
                    decl.warn(result, `Unresolved URL \`${url}\` in \`${decl.toString()}\``);
                    // eslint-disable-next-line no-continue
                    continue;
                }

                const { from, source, urlQuery } = resolved;

                if (!(source instanceof Uint8Array) || typeof from !== "string") {
                    decl.warn(result, `Incorrectly resolved URL \`${url}\` in \`${decl.toString()}\``);
                    // eslint-disable-next-line no-continue
                    continue;
                }

                result.messages.push({ file: from, plugin: name, type: "dependency" });

                if (options.inline) {
                    node.type = "string";
                    node.value = inlineFile(from, source);
                } else {
                    const unsafeTo = normalize(generateName(placeholder, from, source));
                    let to = unsafeTo;

                    // Avoid file overrides
                    const hasExtension = FIRST_EXTENSION_REGEXP.test(unsafeTo);

                    // eslint-disable-next-line no-plusplus
                    for (let index = 1; usedNames.has(to) && usedNames.get(to) !== from; index++) {
                        to = hasExtension ? unsafeTo.replace(FIRST_EXTENSION_REGEXP, `${String(index)}$1`) : `${unsafeTo}${String(index)}`;
                    }

                    usedNames.set(to, from);

                    const resolvedPublicPath =
                        typeof options.publicPath === "string"
                            ? options.publicPath + (/[/\\]$/.test(options.publicPath) ? "" : "/") + basename(to)
                            : `${defaultPublicPath}${basename(to)}`;

                    node.type = "string";
                    node.value = typeof options.publicPath === "function" ? options.publicPath(node.value, resolvedPublicPath, file) : resolvedPublicPath;

                    if (urlQuery) {
                        node.value += urlQuery;
                    }

                    if (typeof options.assetDir === "string") {
                        to = join(options.assetDir, to);
                    } else if (typeof options.assetDir === "function") {
                        to = options.assetDir(from, to, file);
                    }

                    result.messages.push({ plugin: name, source, to, type: "asset" });
                }

                // eslint-disable-next-line @typescript-eslint/no-base-to-string
                decl.value = parsed.toString();
            }
        },
        postcssPlugin: name,
    };
};

plugin.postcss = true;

/** URL handler options */
export interface UrlOptions {
    /**
     * Aliases for URL paths.
     * Overrides the global `alias` option.
     * - ex.: `{"foo":"bar"}`
     */
    alias?: Record<string, string>;
    /**
     * Directory path for outputted CSS assets,
     * which is not included into resulting URL
     * @default "."
     */
    assetDir?: string | ((original: string, resolved: string, file: string) => string);
    /**
     * Enable/disable name generation with hash for outputted CSS assets
     * or provide your own placeholder with the following blocks:
     * - `[extname]`: The file extension of the asset including a leading dot, e.g. `.png`.
     * - `[ext]`: The file extension without a leading dot, e.g. `png`.
     * - `[hash(:<num>)]`: A hash based on the name and content of the asset (with optional length).
     * - `[name]`: The file name of the asset excluding any extension.
     *
     * Forward slashes / can be used to place files in sub-directories.
     * @default "assets/[name]-[hash][extname]" ("assets/[name][extname]" if false)
     */
    hash?: boolean | string;
    /**
     * Inline files instead of copying
     * @default true for `inject` mode, otherwise false
     */
    inline?: boolean;
    /**
     * Public Path for URLs in CSS files
     * @default "./"
     */
    publicPath: string | ((original: string, resolved: string, file: string) => string);
    /**
     * Provide custom resolver for URLs
     * in place of the default one
     */
    resolve?: UrlResolve;
}

export default plugin;
