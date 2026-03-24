import type { PreRenderedChunk } from "rollup";

export const RE_JS: RegExp = /\.([cm]?)jsx?$/;
export const RE_TS: RegExp = /\.([cm]?)tsx?$/;
export const RE_DTS: RegExp = /\.d\.([cm]?)ts$/;
export const RE_DTS_MAP: RegExp = /\.d\.([cm]?)ts\.map$/;
export const RE_NODE_MODULES: RegExp = /[\\/]node_modules[\\/]/;
export const RE_CSS: RegExp = /\.(?:css|scss|sass|less|styl|stylus)$/;
export const RE_VUE: RegExp = /\.vue$/;
export const RE_JSON: RegExp = /\.json$/;

export const filename_js_to_dts = (id: string): string => id.replace(RE_JS, ".d.$1ts");
export const filename_to_dts = (id: string): string =>
    id.replace(RE_VUE, ".vue.ts").replace(RE_TS, ".d.$1ts").replace(RE_JS, ".d.$1ts").replace(RE_JSON, ".json.d.ts");
export const filename_dts_to = (id: string, extension: "js" | "ts"): string => id.replace(RE_DTS, `.$1${extension}`);

export const resolveTemplateFn = (function_: ((chunk: PreRenderedChunk) => string) | string, chunk: PreRenderedChunk): string =>
    typeof function_ === "function" ? function_(chunk) : function_;

export const replaceTemplateName = (template: string, name: string): string => template.replaceAll("[name]", name);
