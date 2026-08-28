import type { Plugin } from "rollup";

// The specific transformer configs (EsbuildPluginConfig / SwcPluginConfig /
// SucrasePluginConfig) live in `@visulima/packem-rollup` because they are
// rollup-only — rolldown bundles an oxc-based transform natively and never
// invokes the transformer adapter. The OXC config remains in this package
// because rolldown reads it (via `getOxcTransformerConfig`) to seed its
// native `transform` input option.
//
// `TransformerFn` is parameterised by its config shape so concrete plugins
// can declare their own specific config, while packem's
// transformer-dispatch slot uses the default `any` — anything typed by its
// own specific config still satisfies the slot via function-parameter
// bivariance, which `any` (but not `unknown`) provides. Typing the slot as
// the rollup-side union would also create a dependency cycle
// (packem-plugins → packem-rollup → packem-plugins).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `TransformerFn` is public API (renaming is breaking); default `any` (not `unknown`) keeps concrete transformer configs assignable to the bare slot via parameter bivariance.
export type TransformerFn<C = any> = ((config: C) => Plugin) & {
    NAME?: TransformerName;
};

export type TransformerName = "esbuild" | "oxc" | "sucrase" | "swc";
