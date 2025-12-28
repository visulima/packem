import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { ensureSymlink } from "@visulima/fs";
import { dirname, join, resolve } from "@visulima/path";

const installPackage = async (fixturePath: string, packageName: string): Promise<void> => {
    const nodeModulesDirectory = join(fixturePath, "node_modules");

    await mkdir(nodeModulesDirectory, { recursive: true });

    const linkPath = join(nodeModulesDirectory, packageName);

    if (existsSync(linkPath)) {
        return; // Already installed, skip
    }

    // Resolve node_modules relative to the workspace root (packages/packem)
    // Go up from helpers directory to packages/packem, then to workspace root
    const currentFile = fileURLToPath(import.meta.url);
    const helpersDir = dirname(currentFile);
    const packemPackageDir = join(helpersDir, "../..");
    const workspaceRoot = join(packemPackageDir, "../..");

    // Try workspace root first, then packem package directory
    let sourcePath = resolve(workspaceRoot, `node_modules/${packageName}`);

    if (!existsSync(sourcePath)) {
        // Fallback to packem package's node_modules
        sourcePath = resolve(packemPackageDir, `node_modules/${packageName}`);
    }

    if (!existsSync(sourcePath)) {
        throw new Error(
            `Package ${packageName} not found. Checked:\n  - ${resolve(workspaceRoot, `node_modules/${packageName}`)}\n  - ${resolve(packemPackageDir, `node_modules/${packageName}`)}\nMake sure it's installed in the workspace.`,
        );
    }

    await ensureSymlink(sourcePath, linkPath);
};

export default installPackage;
