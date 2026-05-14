/**
 * Shallow-clone replace-plugin options with `values` deep-copied. The plugin's
 * `RollupReplaceOptions` declares an `[str: string]: ...` index signature,
 * which TS won't let us safely spread without a cast — so the cast lives here
 * in one spot rather than at each call site.
 */
const cloneReplaceOptions = <T extends { values?: Record<string, unknown> }>(
    options: T,
    extra: Record<string, unknown> = {},
    fallbackValues: Record<string, string> = {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => ({
    ...extra,
    ...options,
    values: options.values ? { ...options.values } : { ...fallbackValues },
});

export default cloneReplaceOptions;
