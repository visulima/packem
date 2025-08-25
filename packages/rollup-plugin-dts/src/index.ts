import Debug from "debug";
import type { Plugin } from "rollup";

import { createDtsInputPlugin } from "./dts-input.js";
import { createFakeJsPlugin } from "./fake-js.js";
import { createGeneratePlugin } from "./generate.js";
import type { Options } from "./options.js";
import { resolveOptions } from "./options.js";
import { createDtsResolvePlugin } from "./resolver.js";

export { createFakeJsPlugin } from "./fake-js.js";

const debug = Debug("rollup-plugin-dts:options");

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

    return plugins;
}



export {
    RE_CSS,
    RE_DTS,
    RE_DTS_MAP,
    RE_JS,
    RE_NODE_MODULES,
    RE_TS,
    RE_VUE,
} from "./filename.js";
export { createGeneratePlugin } from "./generate.js";
export { type Options, resolveOptions } from "./options.js";
