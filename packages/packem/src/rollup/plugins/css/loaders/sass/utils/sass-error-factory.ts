type SassError = { column?: number; id: string; line?: number } & Error;

const errorFactory = (error: { formatted?: string; span?: { start: { column: number; line: number } } } & Error, file: string): SassError => {
    // Keep original error if `sassError.formatted` is unavailable
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const rawMessage = error.formatted ?? error.message ?? String(error);
    const message = rawMessage.replace(/^.*?Error:\s*/i, "");

    const newError = new Error(message, { cause: error }) as SassError;

    newError.name = error.name;
    newError.stack = undefined;
    newError.id = file;

    // modern api lacks `line` and `column` property. extract from `e.span`.
    // NOTE: the values are 0-based so +1 is required.
    if (error.span?.start) {
        newError.line = error.span.start.line + 1;
        newError.column = error.span.start.column + 1;
    }

    return newError;
};

export default errorFactory;
