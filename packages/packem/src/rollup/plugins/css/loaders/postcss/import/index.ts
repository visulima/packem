/**
 * Modified copy of https://github.com/csstools/postcss-plugins/blob/main/plugin-packs/postcss-bundler/src/postcss-import/index.ts
 *
 * MIT No Attribution (MIT-0)
 * Copyright © CSSTools Contributors
 */
import type { Helpers, PluginCreator, Root } from "postcss";

import applyConditions from "./apply-conditions";
import applyRaws from "./apply-raws";
import applyStyles from "./apply-styles";
import { importResolve } from "./import-resolve";
import parseStyles from "./parser/parse-styles";
import type { ImportOptions, State } from "./types";
import loadContent from "./utils/load-content";

const name = "css-import";
const extensionsDefault = [".css", ".pcss", ".postcss", ".sss"];

const plugin: PluginCreator<Partial<{ root: string } & ImportOptions>> = (options) => {
    const config: ImportOptions = {
        alias: options?.alias ?? {},
        extensions: options?.extensions ?? extensionsDefault,
        load: loadContent,
        plugins: [],
        resolve: options?.resolve ?? importResolve,
        skipDuplicates: false,
        ...options,
    };

    return {
        async Once(styles: Root, { atRule, postcss, result }: Helpers) {
            const state: State = {
                hashFiles: {},
                importedFiles: {},
            };

            if (styles.source?.input.file) {
                state.importedFiles[styles.source.input.file] = {};
            }

            if (!Array.isArray(config.plugins)) {
                throw new TypeError("plugins option must be an array");
            }

            const bundle = await parseStyles(config as { root: string } & ImportOptions, result, styles, state, null, [], [], postcss);

            applyRaws(bundle);
            applyConditions(bundle, atRule);
            applyStyles(bundle, styles);
        },
        postcssPlugin: name,
    };
};

plugin.postcss = true;

export default plugin;
