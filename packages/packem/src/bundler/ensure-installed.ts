import { createRequire } from "node:module";

import { detectPackageManager, installPackage } from "@antfu/install-pkg";
import { confirm, isCancel, spinner } from "@clack/prompts";
import type { Pail } from "@visulima/pail";
import { join } from "@visulima/path";

import { getRolldownBuild } from "../rolldown/get-rolldown";
import { getRollupBuild } from "./get-rollup";

type BundlerType = "rolldown" | "rollup";
type TransformerName = "esbuild" | "oxc" | "sucrase" | "swc";

const BUNDLER_PACKAGE: Record<BundlerType, string> = {
    rolldown: "rolldown",
    rollup: "rollup",
};

const TRANSFORMER_PACKAGE: Record<TransformerName, string> = {
    esbuild: "esbuild",
    oxc: "oxc-transform",
    sucrase: "sucrase",
    swc: "@swc/core",
};

const isBundlerAvailable = async (bundler: BundlerType): Promise<boolean> => {
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

// Use a synchronous require.resolve probe instead of `await import(name)`.
// Rollup's @rollup/plugin-dynamic-import-vars rejects dynamic imports with
// variable specifiers during packem's own build; require.resolve is invisible
// to that static analysis and behaves the same for "is this installed".
const isModuleAvailable = (packageName: string, rootDirectory: string): boolean => {
    try {
        const requireFromRoot = createRequire(join(rootDirectory, "noop.js"));

        requireFromRoot.resolve(packageName);

        return true;
    } catch {
        return false;
    }
};

const buildInstallHint = async (packageName: string, rootDirectory: string): Promise<string> => {
    const agent = await detectPackageManager(rootDirectory).catch(() => undefined);
    const cmd = agent === "yarn" || agent === "bun" ? `${agent} add -D` : agent === "pnpm" ? "pnpm add -D" : "npm install -D";

    return `${cmd} ${packageName}`;
};

const promptAndInstall = async (
    packageName: string,
    promptMessage: string,
    rootDirectory: string,
    logger: Pail,
    verifyInstalled: () => Promise<boolean>,
): Promise<void> => {
    const isInteractive = Boolean(process.stdout.isTTY) && !process.env.CI;

    if (!isInteractive) {
        const hint = await buildInstallHint(packageName, rootDirectory);

        throw new Error(`${packageName} is required but is not installed. Run: ${hint}`);
    }

    const shouldInstall = await confirm({ initialValue: true, message: promptMessage });

    if (isCancel(shouldInstall) || !shouldInstall) {
        const hint = await buildInstallHint(packageName, rootDirectory);

        throw new Error(`Cannot continue without ${packageName}. Run: ${hint}`);
    }

    const s = spinner();

    s.start(`Installing ${packageName}`);

    try {
        await installPackage([packageName], { cwd: rootDirectory, dev: true, silent: true });

        s.stop(`Installed ${packageName}`);
    } catch (error) {
        s.stop(`Failed to install ${packageName}`);

        throw error;
    }

    if (!(await verifyInstalled())) {
        logger.error(`Installed ${packageName} but it still cannot be loaded. Try restarting packem.`);

        throw new Error(`${packageName} was installed but is not loadable in the current process. Re-run packem to pick it up.`);
    }
};

/**
 * Ensure the chosen bundler runtime is installed. If missing in a TTY, prompt
 * the user to install it via the local package manager. In CI / non-TTY, throw
 * with an actionable error so the failure mode is loud, not silent.
 */
export const ensureBundlerInstalled = async (bundler: BundlerType, rootDirectory: string, logger: Pail): Promise<void> => {
    if (await isBundlerAvailable(bundler)) {
        return;
    }

    const packageName = BUNDLER_PACKAGE[bundler];

    await promptAndInstall(
        packageName,
        `${packageName} is required for bundler: "${bundler}" but is not installed. Install it now?`,
        rootDirectory,
        logger,
        () => isBundlerAvailable(bundler),
    );
};

/**
 * Ensure the runtime package for the chosen transformer is installed. The
 * transformer plugin itself ships with packem; only its underlying engine
 * (esbuild, @swc/core, oxc-transform, sucrase) is the install target.
 */
export const ensureTransformerInstalled = async (transformer: TransformerName, rootDirectory: string, logger: Pail): Promise<void> => {
    const packageName = TRANSFORMER_PACKAGE[transformer];

    if (isModuleAvailable(packageName, rootDirectory)) {
        return;
    }

    await promptAndInstall(
        packageName,
        `${packageName} is required for transformer: "${transformer}" but is not installed. Install it now?`,
        rootDirectory,
        logger,
        () => Promise.resolve(isModuleAvailable(packageName, rootDirectory)),
    );
};
