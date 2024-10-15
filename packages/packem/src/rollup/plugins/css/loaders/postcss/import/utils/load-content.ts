import { readFileSync } from "@visulima/fs";

import { contents, isValid } from "./data-url";

const loadContent = (filename: string): string => {
    if (isValid(filename)) {
        return contents(filename);
    }

    return readFileSync(filename);
};

export default loadContent;
