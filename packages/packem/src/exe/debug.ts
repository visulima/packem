import { debuglog } from "node:util";

const logger = debuglog("packem:exe");

const NODE_DEBUG_PATTERN = /(?:^|,)packem:exe(?:,|$)/;

interface Debug {
    (message: string, ...args: unknown[]): void;
    readonly enabled: boolean;
}

const isEnabled = (): boolean => {
    const flag = process.env.NODE_DEBUG;

    if (!flag) {
        return false;
    }

    return NODE_DEBUG_PATTERN.test(flag);
};

const createDebug = (): Debug => {
    const debug = ((message: string, ...args: unknown[]): void => {
        logger(message, ...args);
    }) as Debug;

    Object.defineProperty(debug, "enabled", {
        get: isEnabled,
    });

    return debug;
};

export type { Debug };
export { createDebug };
