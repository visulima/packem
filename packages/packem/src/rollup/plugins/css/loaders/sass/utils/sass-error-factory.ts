const errorFactory = (error: { formatted?: string } & Error): Error => {
    // Keep original error if `sassError.formatted` is unavailable
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const rawMessage = error.formatted ?? error.message ?? String(error);
    const message = rawMessage.replace(/^.*?Error:\s*/i, "");

    const newError = new Error(message, { cause: error });

    newError.name = error.name;
    newError.stack = undefined;

    return newError;
};

export default errorFactory;
