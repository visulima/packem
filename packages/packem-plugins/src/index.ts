export { default as cachingPlugin } from "./plugins/cache-plugin";
export { default as fixDynamicImportExtension } from "./plugins/fix-dynamic-import-extension";
export { default as metafilePlugin } from "./plugins/metafile";
export { default as resolveFileUrlPlugin } from "./plugins/resolve-file-url";
export type { TransformerFn, TransformerName } from "./types";
export { default as createSplitChunks } from "./utils/chunks/create-split-chunks";
export { default as getCustomModuleLayer } from "./utils/chunks/get-custom-module-layer";
export { default as getModuleLayer } from "./utils/chunks/get-module-layer";
export { default as resolveAliases, type ResolveAliasesOptions } from "./utils/resolve-aliases";
