import { existsSync } from "node:fs";

import { join } from "@visulima/path";

const resolveFile = (extensions: string[], resolved: string, index = false): string | null => {
    const fileWithoutExtension = resolved.replace(/\.[jt]sx?$/, "");

    for (const extension of extensions) {
        const file = index ? join(resolved, `index${extension}`) : `${fileWithoutExtension}${extension}`;

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        if (existsSync(file)) {
            return file as string;
        }
    }

    return null;
};

export default resolveFile;
