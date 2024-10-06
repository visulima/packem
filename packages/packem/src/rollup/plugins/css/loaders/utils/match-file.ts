import type { Loader } from "../types";

const matchFile = (file: string, condition: Loader["test"]): boolean => {
    if (!condition) {
        return false;
    }

    if (typeof condition === "function") {
        return condition(file);
    }

    if (typeof condition.test === "function") {
        return condition.test(file);
    }

    throw new Error("Invalid condition type");
};

export default matchFile;
