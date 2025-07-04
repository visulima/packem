import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { expect } from "vitest";

const assertContainFiles = (directory: string, filePaths: string[]): void => {
    const results = [];

    for (const filePath of filePaths) {
        if (existsSync(resolve(directory, filePath))) {
            results.push(filePath);
        }
    }

    expect(results).toStrictEqual(filePaths);
};

export default assertContainFiles;
