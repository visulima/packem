import { platform as processPlatform } from "node:process";

import type { Pail } from "@visulima/pail";
import { resolve } from "@visulima/path";
import { x } from "tinyexec";

import { createDebug } from "./debug";
import type { ExeSignOptions } from "./options";
import type { ExePlatform } from "./platform";

const debug = createDebug();

/**
 * Normalizes the user-facing `exe.macos.sign` value.
 *
 * Signing defaults to on with an ad-hoc identity, because an unsigned executable is
 * killed on sight by Gatekeeper on Apple silicon.
 * @param sign The configured value.
 * @returns The resolved options, or `undefined` when signing is disabled.
 */
const resolveSignOptions = (sign: ExeSignOptions | boolean | undefined): ExeSignOptions | undefined => {
    if (sign === false) {
        return undefined;
    }

    if (sign === undefined || sign === true) {
        return { identity: "-" };
    }

    return { identity: "-", ...sign };
};

interface SignOptions {
    logger: Pail;
    /** Absolute path of the executable to sign. */
    outputPath: string;
    /** Project root that a relative `entitlements` path is resolved against. */
    rootDir: string;
    sign: ExeSignOptions;
    targetPlatform: ExePlatform;
}

/**
 * Code-signs a macOS executable with `codesign`.
 *
 * Injecting the SEA blob invalidates the Mach-O signature that ships with `node`, so
 * every darwin target has to be re-signed or macOS refuses to run it. Signing is a
 * best-effort step: it needs the Apple toolchain, so cross-building a darwin executable
 * from Linux or Windows warns and produces an unsigned binary rather than failing.
 * @param options The binary to sign, the signing configuration, and a logger for warnings.
 * @returns `true` when the binary was signed, `false` when signing was skipped or failed.
 */
const signExecutable = async (options: SignOptions): Promise<boolean> => {
    const { logger, outputPath, rootDir, sign, targetPlatform } = options;

    if (targetPlatform !== "darwin") {
        return false;
    }

    const identity = sign.identity ?? "-";
    const commandArguments = ["--sign", identity];

    if (sign.entitlements) {
        commandArguments.push("--entitlements", resolve(rootDir, sign.entitlements));
    }

    if (sign.args) {
        commandArguments.push(...sign.args);
    }

    // `codesign` refuses to overwrite an existing signature without --force, and the
    // downloaded node binary is always already signed.
    if (!commandArguments.includes("--force") && !commandArguments.includes("-f")) {
        commandArguments.push("--force");
    }

    commandArguments.push(outputPath);

    debug("Running: codesign %O", commandArguments);

    try {
        await x("codesign", commandArguments, { nodeOptions: { stdio: "inherit" }, throwOnError: true });

        return true;
    } catch (error) {
        const hint =
            processPlatform === "darwin"
                ? `You can sign it manually using:\n  codesign --force --sign ${identity} "${outputPath}"`
                : `Automatic code signing is not available on ${processPlatform}; sign the executable on a macOS machine before distributing it.`;

        debug("codesign failed: %O", error);
        logger.warn(`Failed to code-sign the executable. ${hint}`);

        return false;
    }
};

export type { SignOptions };
export { resolveSignOptions, signExecutable };
