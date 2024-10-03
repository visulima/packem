import type { AutoModules } from "../../types";

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

    return am && /\.module\.[A-Za-z]+$/.test(id);
};

export default ensureAutoModules;
