import { installPackage } from "@antfu/install-pkg";
import { confirm, isCancel, spinner } from "@clack/prompts";
import type { Pail } from "@visulima/pail";

import { getRolldownBuild } from "../rolldown/get-rolldown";
import { getRollupBuild } from "./get-rollup";

type BundlerType = "rolldown" | "rollup";

const PACKAGE_FOR: Record<BundlerType, string> = {
    rolldown: "rolldown",
    rollup: "rollup",
};

const isAvailable = async (bundler: BundlerType): Promise<boolean> => {
    try {
        if (bundler === "rolldown") {
            await getRolldownBuild();
        } else {
            await getRollupBuild();
        }

        return true;
    } catch {
        return false;
    }
};

/**
 * Ensure the chosen bundler runtime is installed. If missing in a TTY, prompt
 * the user to install it via the local package manager. In CI / non-TTY, throw
 * with an actionable error so the failure mode is loud, not silent.
 */
export const ensureBundlerInstalled = async (
    bundler: BundlerType,
    rootDirectory: string,
    logger: Pail,
): Promise<void> => {
    if (await isAvailable(bundler)) {
        return;
    }

    const packageName = PACKAGE_FOR[bundler];
    const isInteractive = Boolean(process.stdout.isTTY) && !process.env.CI;

    if (!isInteractive) {
        throw new Error(
            `${packageName} is not installed but bundler is set to "${bundler}". Run: npm install ${packageName}`,
        );
    }

    const shouldInstall = await confirm({
        initialValue: true,
        message: `${packageName} is required for bundler: "${bundler}" but is not installed. Install it now?`,
    });

    if (isCancel(shouldInstall) || !shouldInstall) {
        throw new Error(
            `Cannot continue without ${packageName}. Run: npm install ${packageName}`,
        );
    }

    const s = spinner();

    s.start(`Installing ${packageName}`);

    try {
        await installPackage([packageName], {
            cwd: rootDirectory,
            dev: true,
            silent: true,
        });

        s.stop(`Installed ${packageName}`);
    } catch (error) {
        s.stop(`Failed to install ${packageName}`);

        throw error;
    }

    if (!(await isAvailable(bundler))) {
        logger.error(`Installed ${packageName} but it still cannot be loaded. Try restarting packem.`);

        throw new Error(`${packageName} was installed but is not loadable in the current process. Re-run packem to pick it up.`);
    }
};
