import { make } from "design-system";

// No explicit annotation: TypeScript must infer the type of `value` as `InnerType`
// and synthesize an import for it in the emitted declaration. It tends to pick the
// symbol's origin module (`inner-lib`) instead of the specifier the consumer depends
// on (`design-system`) — the sxzz/rolldown-plugin-dts#227 bug.
export const value = make();
