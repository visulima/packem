// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dumpObject = (object: Record<string, any>): string =>
    `{ ${Object.keys(object)
        // eslint-disable-next-line security/detect-object-injection
        .map((key) => `${key}: ${JSON.stringify(object[key])}`)
        .join(", ")} }`;

export default dumpObject;
