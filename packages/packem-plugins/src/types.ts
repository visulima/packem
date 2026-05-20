import type { Plugin } from "rollup";

// The specific transformer configs (EsbuildPluginConfig / SwcPluginConfig /
// SucrasePluginConfig) live in `@visulima/packem-rollup` because they are
// rollup-only — rolldown bundles an oxc-based transform natively and never
// invokes the transformer adapter. The OXC config remains in this package
// because rolldown reads it (via `getOxcTransformerConfig`) to seed its
// native `transform` input option.
//
// `TransformerFn` is parameterised by its config shape so concrete plugins
// can declare their own (`TransformerFn<SwcPluginConfig>`), while packem's
// transformer-dispatch slot uses the default `any` — anything typed by its
// own specific config still satisfies the slot via function-parameter
// bivariance, which `any` (but not `unknown`) provides. Typing the slot as
// the rollup-side union would also create a dependency cycle
// (packem-plugins → packem-rollup → packem-plugins).
// eslint-disable-next-line unicorn/prevent-abbreviations -- `TransformerFn` is part of the public API; renaming would be a breaking change.
export type TransformerFn<C = any> = ((
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- default `any` (not `unknown`) so concrete transformers typed for their own specific config (EsbuildPluginConfig, etc.) remain assignable to the bare `TransformerFn` slot; function-parameter positions are contravariant, and only `any` provides the bivariance needed.
    config: C,
) => Plugin) & {
    NAME?: TransformerName;
};

export type TransformerName = "esbuild" | "oxc" | "sucrase" | "swc";
