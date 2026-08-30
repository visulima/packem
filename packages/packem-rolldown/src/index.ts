// Reserved for rolldown-only plugins. The rolldown backend currently shares
// every applicable plugin with rollup via `@visulima/packem-plugins` (private
// build-time-only) and skips the rollup-only plugins (json, cjs-interop,
// commonjs, node-resolve, transformer adapter, plus the plugins that call
// `this.parse()` like chunk-splitter / pure / preserve-directives /
// jsx-remove-attributes / dynamic-import-vars) that live in
// `@visulima/packem-rollup`.
//
// When a plugin lands that is needed only by rolldown — typically a
// rolldown-native rewrite of one of those rollup-only plugins — add it under
// `src/plugins/<name>/` and export it here.

export {};
