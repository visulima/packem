import { isAccessibleSync } from "@visulima/fs";
import { join } from "@visulima/path";

const resolveFile = (extensions: string[], resolved: string, index = false): string | null => {
    const fileWithoutExtension = resolved.replace(/\.[jt]sx?$/, "");

    for (const extension of extensions) {
        const file: string = index ? join(resolved, "index" + extension) : fileWithoutExtension + extension;

        if (isAccessibleSync(file)) {
            return file;
        }
    }

    return null;
};

export default resolveFile;
