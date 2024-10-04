const errorFactory = (error: { formatted?: string } & Error): Error => {
    let message;

    // eslint-disable-next-line unicorn/prefer-ternary
    if (error.formatted) {
        // eslint-disable-next-line security/detect-unsafe-regex
        message = error.formatted.replace(/^(.+)?Error: /, "");
    } else {
        // Keep original error if `sassError.formatted` is unavailable
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        message = (error.message || error.toString()).replace(/^(.+)?Error: /, "");
    }

    const newError = new Error(message, { cause: error });

    newError.name = error.name;
    newError.stack = undefined;

    return newError;
};

export default errorFactory;
