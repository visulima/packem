import { browserslistToTargets, transform } from "lightningcss";

import type { LightningCSSOptions } from "../types";
import type { Loader } from "./types";
import ensureAutoModules from "./utils/ensure-auto-modules";

const lightningCSSLoader: Loader<LightningCSSOptions> = {
    name: "lightningCSS",
    async process({ code, map }) {
        let supportModules = false;

        if (typeof this.options.modules === "boolean") {
            supportModules = this.options.modules;
        } else if (typeof this.options.modules === "object") {
            supportModules = ensureAutoModules(this.options.modules.include, this.id);
        }

        if (this.autoModules && this.options.modules === undefined) {
            supportModules = ensureAutoModules(this.autoModules, this.id);
        }

        const result = transform({
            ...this.options,
            code: Buffer.from(code),
            cssModules: this.options.modules ?? supportModules,
            filename: this.id,
            inputSourceMap: map,
            minify: false,
            sourceMap: !this.sourceMap,
            targets: browserslistToTargets(this.browserTargets),
        });

        if (result.warnings.length > 0) {
            this.warn("warnings when transforming css:\n" + result.warnings.map((w) => w.message).join("\n"));
        }

        return {
            code: result.code.toString(),
            map: "map" in result ? result.map?.toString() : undefined,
        };
    },
    test: /\.css$/i,
};

// eslint-disable-next-line import/no-unused-modules
export default lightningCSSLoader;
