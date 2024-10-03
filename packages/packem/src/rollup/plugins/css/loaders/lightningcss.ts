import { browserslistToTargets, transform } from "lightningcss";

import type { InternalStyleOptions } from "../types";
import type { Loader } from "./types";
import ensureAutoModules from "./utils/ensure-auto-modules";

const lightningcss: Loader<NonNullable<InternalStyleOptions["lightningcss"]>> = {
    name: "lightningcss",
    async process({ code, map }) {
        const autoModules = ensureAutoModules(this.options.autoModules, this.id);
        const supportModules = Boolean((this.options.modules && ensureAutoModules(this.options.modules.include, this.id)) || autoModules);

        const result = transform({
            ...this.options,
            code: Buffer.from(code),
            cssModules: this.options.cssModules ?? supportModules,
            filename: this.id,
            inputSourceMap: map,
            sourceMap: Boolean(this.sourceMap),
            targets: browserslistToTargets(this.browserTargets),
        });

        if (result.warnings.length > 0) {
            this.warn("warnings when processing css:\n" + result.warnings.map((w) => w.message).join("\n"));
        }

        return {
            code: result.code.toString(),
            map: "map" in result ? result.map?.toString() : undefined,
        };
    },
};

// eslint-disable-next-line import/no-unused-modules
export default lightningcss;
