import type { PreRenderedChunk } from "rollup";

export const RE_JS: RegExp = /\.([cm]?)jsx?$/;
export const RE_TS: RegExp = /\.([cm]?)tsx?$/;
export const RE_DTS: RegExp = /\.d\.([cm]?)ts$/;
export const RE_DTS_MAP: RegExp = /\.d\.([cm]?)ts\.map$/;
export const RE_NODE_MODULES: RegExp = /[\\/]node_modules[\\/]/;
export const RE_CSS: RegExp = /\.(?:css|scss|sass|less|styl|stylus)$/;
export const RE_VUE: RegExp = /\.vue$/;
export const RE_JSON: RegExp = /\.json$/;

export const filenameJsToDts = (id: string): string => id.replace(RE_JS, ".d.$1ts");
export const filenameToDts = (id: string): string =>
    id.replace(RE_VUE, ".vue.ts").replace(RE_TS, ".d.$1ts").replace(RE_JS, ".d.$1ts").replace(RE_JSON, ".json.d.ts");
export const filenameDtsTo = (id: string, extension: "js" | "ts"): string => id.replace(RE_DTS, `.$1${extension}`);

export const resolveTemplateFunction = (function_: ((chunk: PreRenderedChunk) => string) | string, chunk: PreRenderedChunk): string =>
    typeof function_ === "function" ? function_(chunk) : function_;

export const replaceTemplateName = (template: string, name: string): string => template.replaceAll("[name]", name);

/**
 * Map a JS/DTS `entryFileNames` template to its declaration-file equivalent.
 *
 * The single variable that drives the extension handling is whether the chunk name
 * already carries a `.d` suffix (`hasDExtension`). DTS templates only need their
 * `[name]` placeholder filled, stripping the `.d` from the name when the name already
 * carries it (else it doubles up). JS templates with a `.d`-bearing `[name]` inherit
 * the `.d` from the name, so they only swap js to ts; every other JS template (fixed
 * strings, or a `[name]` without a `.d` suffix) needs the full declaration extension.
 *
 * Returns `undefined` when the template is neither a JS nor a DTS template, so callers
 * can fall through to their default. See sxzz/rolldown-plugin-dts#208.
 */
export const dtsEntryFileName = (template: string, name: string, hasDExtension: boolean): string | undefined => {
    if (RE_DTS.test(template)) {
        return replaceTemplateName(template, hasDExtension ? name.slice(0, -2) : name);
    }

    if (RE_JS.test(template)) {
        if (hasDExtension) {
            return template.includes("[name]") ? template.replace(RE_JS, ".$1ts") : filenameJsToDts(template);
        }

        return filenameJsToDts(template);
    }

    return undefined;
};
