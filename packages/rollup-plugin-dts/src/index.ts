import Debug from "debug";
import type { Plugin } from "rolldown";

import { createBannerPlugin } from "./banner.ts";
import { createDtsInputPlugin } from "./dts-input.ts";
import { createFakeJsPlugin } from "./fake-js.ts";
import { createGeneratePlugin } from "./generate.ts";
import type { Options } from "./options.ts";
import { resolveOptions } from "./options.ts";
import { createDtsResolvePlugin } from "./resolver.ts";

export { createFakeJsPlugin } from "./fake-js.ts";

const debug = Debug("rolldown-plugin-dts:options");

export function dts(options: Options = {}): Plugin[] {
    debug("resolving dts options");
    const resolved = resolveOptions(options);

    debug("resolved dts options %o", resolved);

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
}

export { RE_CSS, RE_DTS, RE_DTS_MAP, RE_JS, RE_NODE_MODULES, RE_TS, RE_VUE } from "./filename.ts";
export { createGeneratePlugin } from "./generate.ts";
export { type Options, resolveOptions } from "./options.ts";
