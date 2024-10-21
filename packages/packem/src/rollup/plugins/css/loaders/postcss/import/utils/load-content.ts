import { readFileSync } from "@visulima/fs";

import { dataURLContents, isValidDataURL } from "./data-url";

const loadContent = (filename: string): string => {
    if (isValidDataURL(filename)) {
        return dataURLContents(filename);
    }

    return readFileSync(filename);
};

export default loadContent;
