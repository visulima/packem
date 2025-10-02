import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

import { ensureSymlink } from "@visulima/fs";
import { join, resolve } from "@visulima/path";

const installPackage = async (fixturePath: string, packageName: string): Promise<void> => {
    const nodeModulesDirectory = join(fixturePath, "node_modules");

    await mkdir(nodeModulesDirectory, { recursive: true });

    const linkPath = join(nodeModulesDirectory, packageName);

    if (existsSync(linkPath)) {
        throw new Error(`Package ${packageName} does not exist on ${linkPath}`);
    }

    await ensureSymlink(resolve(`node_modules/${packageName}`), linkPath);
};

export default installPackage;
