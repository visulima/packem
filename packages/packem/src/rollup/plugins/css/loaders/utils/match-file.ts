import type { Loader } from "../types";

const matchFile = (file: string, condition: Loader["test"]): boolean => {
    if (!condition) {
        return false;
    }

    if (typeof condition === "function") {
        return condition(file);
    }

    return condition.test(file);
};

export default matchFile;
