import { detectPackageManager } from "@antfu/install-pkg";
import type { TransformerName } from "@visulima/packem-plugins";

/**
 * Map of supported transformer names to the npm package that provides
 * the underlying runtime engine. The packem-side plugin ships with packem;
 * only the engine is the install target.
 */
export const TRANSFORMER_PACKAGE: Record<TransformerName, string> = {
    esbuild: "esbuild",
    oxc: "oxc-transform",
    sucrase: "sucrase",
    swc: "@swc/core",
};

/**
 * Build a package-manager-aware install command (e.g. `pnpm add -D foo`)
 * for use in error messages and CI hints. Falls back to npm when the
 * package manager can't be detected.
 */
export const buildInstallHint = async (packages: string | string[], rootDirectory: string): Promise<string> => {
    const list = Array.isArray(packages) ? packages : [packages];
    const agent = await detectPackageManager(rootDirectory).catch(() => undefined);

    let command: string;

    if (agent === "yarn" || agent === "bun") {
        command = `${agent} add -D`;
    } else if (agent === "pnpm") {
        command = "pnpm add -D";
    } else {
        command = "npm install -D";
    }

    return `${command} ${list.join(" ")}`;
};
