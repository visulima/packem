import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ensureSymlink } from "@visulima/fs";
import { dirname, join, resolve } from "@visulima/path";

// PACKEM_TEST_TYPESCRIPT=7 links the native compiler from the isolated `tools/typescript-7`
// install into fixtures as `typescript`; the workspace itself keeps TypeScript 6.
const isTypeScript7Request = (packageName: string): boolean => packageName === "typescript" && process.env.PACKEM_TEST_TYPESCRIPT === "7";

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
    const helpersDirectory = dirname(currentFile);
    const packemPackageDirectory = join(helpersDirectory, "../..");
    const workspaceRoot = join(packemPackageDirectory, "../..");

    // Try workspace root first, then packem package directory
    let sourcePath = isTypeScript7Request(packageName)
        ? resolve(workspaceRoot, "tools/typescript-7/node_modules/typescript")
        : resolve(workspaceRoot, `node_modules/${packageName}`);

    if (!existsSync(sourcePath) && !isTypeScript7Request(packageName)) {
        // Fallback to packem package's node_modules
        sourcePath = resolve(packemPackageDirectory, `node_modules/${packageName}`);
    }

    if (!existsSync(sourcePath)) {
        throw new Error(
            `Package ${packageName} not found. Checked:\n  - ${resolve(workspaceRoot, `node_modules/${packageName}`)}\n  - ${resolve(packemPackageDirectory, `node_modules/${packageName}`)}\nMake sure it's installed in the workspace.`,
        );
    }

    await ensureSymlink(sourcePath, linkPath);
};

export default installPackage;
