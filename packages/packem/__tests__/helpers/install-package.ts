import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { ensureSymlink } from "@visulima/fs";

const installPackage = async (fixturePath: string, packageName: string): Promise<void> => {
    const nodeModulesDirectory = join(fixturePath, "node_modules");

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await mkdir(nodeModulesDirectory, { recursive: true });

    await ensureSymlink(resolve("node_modules/" + packageName), join(nodeModulesDirectory, packageName));
};

export default installPackage;
