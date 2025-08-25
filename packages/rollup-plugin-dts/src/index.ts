import Debug from "debug";
import type { Plugin } from "rolldown";

import { createDtsInputPlugin } from "./dts-input";
import { createFakeJsPlugin } from "./fake-js";
import { createGeneratePlugin } from "./generate";
import type { Options } from "./options";
import { resolveOptions } from "./options";
import { createDtsResolvePlugin } from "./resolver";

export { createFakeJsPlugin } from "./fake-js";

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
} from "./filename.ts";
export { createGeneratePlugin } from "./generate.ts";
export { type Options, resolveOptions } from "./options.ts";
