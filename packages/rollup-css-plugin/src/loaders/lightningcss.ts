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
            this.warn(`warnings when transforming css:\n${result.warnings.map((w) => w.message).join("\n")}`);
        }

        // /**
        //  * Addresses non-deterministic exports order:
        //  * https://github.com/parcel-bundler/lightningcss/issues/291
        //  */
        // const exports = Object.fromEntries(
        //     Object.entries(
        //         // `exports` is defined if cssModules is true
        //         // eslint-disable-next-line @typescript-eslint/no-non-undefined-assertion
        //         result.exports!,
        //     ).sort(
        //         // Cheap alphabetical sort (localCompare is expensive)
        //         ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
        //     ),
        // );

        return {
            code: result.code.toString(),
            map: result.map ? (JSON.parse(Buffer.from(result.map).toString()) as string) : undefined,
            moduleSideEffects: supportModules || (typeof this.inject === "object" && this.inject.treeshakeable) ? false : "no-treeshake",
        };
    },
    test: /\.css$/i,
};

export default lightningCSSLoader;
