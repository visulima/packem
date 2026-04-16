import { browserslistToTargets, transform } from "lightningcss";
import type { CSSModuleExports, CSSModuleReference } from "lightningcss";

import type { LightningCSSOptions } from "../types";
import { generateJsExports } from "../utils/generate-js-exports";
import type { Loader } from "./types";
import ensureAutoModules from "./utils/ensure-auto-modules";

/**
 * Flattens a lightningcss `CSSModuleExports` map into a deterministic
 * `{ originalName: "local-name [composed-name ...]" }` record — the same
 * shape postcss-modules produces via ICSS messages.
 *
 * Composed references are resolved in order:
 *  - `local`  → appended as-is (already-compiled local name)
 *  - `global` → appended as the raw global name
 *  - `dependency` → skipped (cross-file composes; would require an
 *    ICSS-style dependency pipeline, which lightningcss does not expose
 *    synchronously at this stage)
 *
 * Entries are sorted alphabetically to work around
 * https://github.com/parcel-bundler/lightningcss/issues/291
 */
const normalizeModulesExports = (exports: CSSModuleExports): Record<string, string> => {
    const normalized: Record<string, string> = {};

    const sortedEntries = Object.entries(exports).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    for (const [name, entry] of sortedEntries) {
        const parts: string[] = [entry.name];

        for (const composed of entry.composes as CSSModuleReference[]) {
            if (composed.type === "local" || composed.type === "global") {
                parts.push(composed.name);
            }
        }

        normalized[name] = parts.join(" ");
    }

    return normalized;
};

/**
 * LightningCSS loader for processing CSS files with the LightningCSS transformer.
 *
 * Supports:
 * - CSS transformation (vendor prefixes, modern syntax → legacy, etc.)
 * - CSS modules with deterministic export ordering and composes resolution
 * - Source map generation
 * - Browser targets via the shared browserslist config
 * - TypeScript declaration generation when `dts: true` is set
 */
const lightningCSSLoader: Loader<LightningCSSOptions> = {
    name: "lightningcss",

    // eslint-disable-next-line sonarjs/cognitive-complexity
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
            sourceMap: Boolean(this.sourceMap),
            targets: browserslistToTargets(this.browserTargets),
        });

        if (result.warnings.length > 0) {
            this.logger.warn({ message: `warnings when transforming css:\n${result.warnings.map((w) => w.message).join("\n")}` });
        }

        const css = result.code.toString();
        const resultMap = result.map ? Buffer.from(result.map).toString() : undefined;

        // Extract module exports (if any). Non-module CSS leaves `result.exports`
        // undefined and we fall through with an empty mapping.
        const modulesExports: Record<string, string> = result.exports
            ? normalizeModulesExports(result.exports)
            : {};

        const jsExportResult = generateJsExports({
            css,
            cwd: this.cwd as string,
            dts: this.dts,
            emit: this.emit,
            extract: this.extract,
            icssDependencies: [],
            id: this.id,
            inject: this.inject,
            inline: this.inline,
            logger: this.logger,
            map: resultMap,
            modulesExports,
            namedExports: this.namedExports,
            supportModules,
        });

        if (this.extract) {
            return {
                code: jsExportResult.code,
                extracted: { css, id: this.id, map: resultMap },
                map: jsExportResult.map,
                meta: jsExportResult.meta,
                moduleSideEffects: jsExportResult.moduleSideEffects,
            };
        }

        return {
            code: jsExportResult.code,
            map: jsExportResult.map,
            meta: jsExportResult.meta,
            moduleSideEffects: jsExportResult.moduleSideEffects,
        };
    },

    test: /\.css$/i,
};

export default lightningCSSLoader;
