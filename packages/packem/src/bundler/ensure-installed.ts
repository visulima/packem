import { createRequire } from "node:module";

import { installPackage } from "@antfu/install-pkg";
import { confirm, isCancel, spinner } from "@clack/prompts";
import type { TransformerName } from "@visulima/packem-plugins";
import { join } from "@visulima/path";

import { getRolldownBuild } from "../rolldown/get-rolldown";
import type { BundlerName } from "./build";
import { getRollupBuild } from "./get-rollup";
import { buildInstallHint, TRANSFORMER_PACKAGE } from "./installer";

/**
 * Minimal structural logger contract. `@visulima/pail`'s shipped `Pail` type
 * re-exports from a non-existent `./pail.d.ts`, so the structural alias below
 * keeps the methods we call fully type-checked without the broken import.
 */
interface Logger {
    error: (message: string, ...arguments_: unknown[]) => void;
}

const isBundlerAvailable = async (bundler: BundlerName): Promise<boolean> => {
    try {
        await (bundler === "rolldown" ? getRolldownBuild() : getRollupBuild());

        return true;
    } catch {
        return false;
    }
};

// Use a synchronous require.resolve probe instead of `await import(name)`.
// Rollup's @rollup/plugin-dynamic-import-vars rejects dynamic imports with
// variable specifiers during packem's own build; require.resolve is invisible
// to that static analysis and behaves the same for "is this installed".
//
// Probe the user's project root first, then fall back to packem's own module
// graph: the transformer plugin ships with packem and loads its engine from
// packem's node_modules, so an engine resolvable to packem is usable even when
// it isn't hoisted into the consumer project (e.g. test fixtures in a tmp dir).
const isModuleAvailable = (packageName: string, rootDirectory: string): boolean => {
    const probes = [join(rootDirectory, "noop.js"), import.meta.url];

    for (const from of probes) {
        try {
            createRequire(from).resolve(packageName);

            return true;
        } catch {
            // Try the next resolution context.
        }
    }

    return false;
};

const promptAndInstall = async (
    packageName: string,
    promptMessage: string,
    rootDirectory: string,
    logger: Logger,
    verifyInstalled: () => Promise<boolean>,
): Promise<void> => {
    const isInteractive = process.stdout.isTTY && !process.env.CI;

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

    if (!await verifyInstalled()) {
        logger.error(`Installed ${packageName} but it still cannot be loaded. Try restarting packem.`);

        throw new Error(`${packageName} was installed but is not loadable in the current process. Re-run packem to pick it up.`);
    }
};

/**
 * Ensure the chosen bundler runtime is installed. If missing in a TTY, prompt
 * the user to install it via the local package manager. In CI / non-TTY, throw
 * with an actionable error so the failure mode is loud, not silent.
 */
export const ensureBundlerInstalled = async (bundler: BundlerName, rootDirectory: string, logger: Logger): Promise<void> => {
    if (await isBundlerAvailable(bundler)) {
        return;
    }

    await promptAndInstall(bundler, `${bundler} is required as the bundler but is not installed. Install it now?`, rootDirectory, logger, () =>
        isBundlerAvailable(bundler));
};

/**
 * Ensure the runtime package for the chosen transformer is installed. The
 * transformer plugin itself ships with packem; only its underlying engine
 * (esbuild, `@swc/core`, oxc-transform, sucrase) is the install target.
 */
export const ensureTransformerInstalled = async (transformer: TransformerName, rootDirectory: string, logger: Logger): Promise<void> => {
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
