import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { expect } from "vitest";

const assertContainFiles = (directory: string, filePaths: string[]): void => {
    const results = [];

    for (const filePath of filePaths) {
        const fullPath = resolve(directory, filePath);
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const existed = existsSync(fullPath);

        if (existed) {
            results.push(filePath);
        }
    }

    expect(results).toStrictEqual(filePaths);
};

export default assertContainFiles;
