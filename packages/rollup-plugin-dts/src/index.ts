import type { Plugin } from "rollup";

import createBannerPlugin from "./banner";
import createDtsResolvePlugin from "./create-dts-resolve-plugin";
import createDtsInputPlugin from "./dts-input";
import createFakeJsPlugin from "./fake-js";
import { createGeneratePlugin } from "./generate";
import type { Options } from "./options";
import { resolveOptions } from "./options";

export { default as createFakeJsPlugin } from "./fake-js";

export const dts = (options: Options = {}, logger?: {
    debug: (message: string, ...arguments_: any[]) => void;
}): Plugin[] => {
    logger?.debug("resolving dts options");
    const resolved = resolveOptions(options);

    logger?.debug("resolved dts options %o", resolved);

    const plugins: Plugin[] = [];

    if (options.dtsInput) {
        plugins.push(createDtsInputPlugin());
    } else {
        plugins.push(createGeneratePlugin(resolved));
    }

    plugins.push(createDtsResolvePlugin(resolved), createFakeJsPlugin(resolved));

    if (options.banner || options.footer) {
        plugins.push(createBannerPlugin(resolved));
    }

    return plugins;
};

export { RE_CSS, RE_DTS, RE_DTS_MAP, RE_JS, RE_JSON, RE_NODE_MODULES, RE_TS, RE_VUE } from "./filename";
export { createGeneratePlugin } from "./generate";
export { type Options, resolveOptions } from "./options";
