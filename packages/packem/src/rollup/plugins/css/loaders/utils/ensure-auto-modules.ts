import type { AutoModules } from "../../types";

const MODULE_FILE_PATTERN = /\.module\.[A-Za-z]+$/;

const ensureAutoModules = (am: AutoModules | undefined, id: string): boolean => {
    if (am === undefined) {
        return true;
    }

    if (typeof am === "function") {
        return am(id);
    }

    if (am instanceof RegExp) {
        return am.test(id);
    }

    return am && MODULE_FILE_PATTERN.test(id);
};

export default ensureAutoModules;
