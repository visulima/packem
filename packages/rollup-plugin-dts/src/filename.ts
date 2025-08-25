import type { ChunkFileNamesFunction, PreRenderedChunk } from "rolldown";

export const RE_JS: RegExp = /\.([cm]?)jsx?$/;
export const RE_TS: RegExp = /\.([cm]?)tsx?$/;
export const RE_DTS: RegExp = /\.d\.([cm]?)ts$/;
export const RE_DTS_MAP: RegExp = /\.d\.([cm]?)ts\.map$/;
export const RE_NODE_MODULES: RegExp = /[\\/]node_modules[\\/]/;
export const RE_CSS: RegExp = /\.css$/;
export const RE_VUE: RegExp = /\.vue$/;

export function filename_js_to_dts(id: string): string {
    return id.replace(RE_JS, ".d.$1ts");
}
export function filename_to_dts(id: string): string {
    return id
        .replace(RE_VUE, ".vue.ts")
        .replace(RE_TS, ".d.$1ts")
        .replace(RE_JS, ".d.$1ts");
}
export function filename_dts_to(id: string, extension: "js" | "ts"): string {
    return id.replace(RE_DTS, `.$1${extension}`);
}

export function resolveTemplateFn(
    function_: string | ChunkFileNamesFunction,
    chunk: PreRenderedChunk,
): string {
    return typeof function_ === "function" ? function_(chunk) : function_;
}

export function replaceTemplateName(template: string, name: string): string {
    return template.replaceAll("[name]", name);
}
