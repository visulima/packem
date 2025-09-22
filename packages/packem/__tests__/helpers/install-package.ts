import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { ensureSymlink } from "@visulima/fs";

const installPackage = async (fixturePath: string, packageName: string): Promise<void> => {
    const nodeModulesDirectory = join(fixturePath, "node_modules");

    await mkdir(nodeModulesDirectory, { recursive: true });

    const linkPath = join(nodeModulesDirectory, packageName);

    if (existsSync(linkPath)) {
        return;
    }

    await ensureSymlink(resolve(`node_modules/${packageName}`), linkPath);
};

export default installPackage;
