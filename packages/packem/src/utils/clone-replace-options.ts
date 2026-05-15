/**
 * Shallow-clone replace-plugin options with `values` deep-copied. The plugin's
 * `RollupReplaceOptions` declares an `[str: string]: ...` index signature,
 * which TS won't let us safely spread without a cast — so the cast lives here
 * in one spot rather than at each call site.
 */
const cloneReplaceOptions = (
    options: Record<string, unknown> & { values?: Record<string, unknown> },
    extra: Record<string, unknown> = {},
    fallbackValues: Record<string, string> = {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- callers consume this as plugin options whose index signature TS cannot safely spread; a concrete return type would over-constrain every call site.
): any => {
    return {
        ...extra,
        ...options,
        values: options.values ? { ...options.values } : { ...fallbackValues },
    };
};

export default cloneReplaceOptions;
