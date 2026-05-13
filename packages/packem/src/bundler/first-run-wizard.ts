import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

import { installPackage } from "@antfu/install-pkg";
import { cancel, intro, isCancel, log, outro, select, spinner } from "@clack/prompts";
import { cyan } from "@visulima/colorize";
import { isAccessible } from "@visulima/fs";
import type { Pail } from "@visulima/pail";
import { join } from "@visulima/path";

type BundlerName = "rolldown" | "rollup";
type TransformerName = "esbuild" | "oxc" | "sucrase" | "swc";

const BUNDLER_PACKAGES: Record<BundlerName, string> = {
    rolldown: "rolldown",
    rollup: "rollup",
};

// Each transformer name maps to the npm package that provides its runtime.
const TRANSFORMER_PACKAGES: Record<TransformerName, string> = {
    esbuild: "esbuild",
    oxc: "oxc-transform",
    sucrase: "sucrase",
    swc: "@swc/core",
};

const isResolvable = (packageName: string, rootDirectory: string): boolean => {
    try {
        const require = createRequire(join(rootDirectory, "noop.js"));

        require.resolve(packageName);

        return true;
    } catch {
        return false;
    }
};

const PACKEM_CONFIG_FILES = [
    "packem.config.js",
    "packem.config.mjs",
    "packem.config.cjs",
    "packem.config.ts",
    "packem.config.cts",
    "packem.config.mts",
];

const hasPackemConfig = async (rootDirectory: string): Promise<boolean> => {
    for (const file of PACKEM_CONFIG_FILES) {
        // eslint-disable-next-line no-await-in-loop
        if (await isAccessible(join(rootDirectory, file))) {
            return true;
        }
    }

    return false;
};

// Detection is based on whether the package is resolvable from rootDirectory
// (so it works for transitive resolutions and monorepo node_modules), then
// cross-referenced with package.json so we don't install a bundler that's
// already declared. The wizard only triggers when nothing is resolvable.
const detectInstalledBundler = (rootDirectory: string): BundlerName | undefined => {
    if (isResolvable(BUNDLER_PACKAGES.rolldown, rootDirectory)) {
        return "rolldown";
    }

    if (isResolvable(BUNDLER_PACKAGES.rollup, rootDirectory)) {
        return "rollup";
    }

    return undefined;
};

const detectInstalledTransformer = (rootDirectory: string): TransformerName | undefined => {
    for (const [name, packageName] of Object.entries(TRANSFORMER_PACKAGES) as [TransformerName, string][]) {
        if (isResolvable(packageName, rootDirectory)) {
            return name;
        }
    }

    return undefined;
};

const isDeclaredInPackageJson = (
    packageName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    packageJson: { dependencies?: Record<string, any>; devDependencies?: Record<string, any>; peerDependencies?: Record<string, any> },
): boolean => Boolean(
    packageJson.dependencies?.[packageName]
    || packageJson.devDependencies?.[packageName]
    || packageJson.peerDependencies?.[packageName],
);

const generatePackemConfig = (bundler: BundlerName, transformer: TransformerName): string =>
    `import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/${transformer}";

export default defineConfig({
    bundler: "${bundler}",
    transformer,
});
`;

const promptBundler = async (): Promise<BundlerName> => {
    const value = await select<BundlerName>({
        initialValue: "rollup",
        message: "Which bundler do you want to use?",
        options: [
            {
                hint: "stable, full feature set, supports DTS",
                label: "rollup",
                value: "rollup",
            },
            {
                hint: "experimental, fast — falls back to rollup for DTS",
                label: "rolldown",
                value: "rolldown",
            },
        ],
    });

    if (isCancel(value)) {
        cancel("Setup cancelled.");
        throw new Error("Packem setup was cancelled.");
    }

    return value;
};

const promptTransformer = async (): Promise<TransformerName> => {
    const value = await select<TransformerName>({
        initialValue: "esbuild",
        message: "Which transformer do you want to use?",
        options: [
            { hint: "fast, widely used", label: "esbuild", value: "esbuild" },
            { hint: "fastest, Rust-based", label: "oxc", value: "oxc" },
            { hint: "TypeScript-aware, Rust-based", label: "swc", value: "swc" },
            { hint: "minimal, JS-based", label: "sucrase", value: "sucrase" },
        ],
    });

    if (isCancel(value)) {
        cancel("Setup cancelled.");
        throw new Error("Packem setup was cancelled.");
    }

    return value;
};

const installPackagesWithSpinner = async (packages: string[], rootDirectory: string): Promise<void> => {
    if (packages.length === 0) {
        return;
    }

    const s = spinner();

    s.start(`Installing ${packages.join(", ")}`);

    try {
        await installPackage(packages, {
            cwd: rootDirectory,
            dev: true,
            silent: true,
        });

        s.stop(`Installed ${packages.join(", ")}`);
    } catch (error) {
        s.stop(`Failed to install ${packages.join(", ")}`);

        throw error;
    }
};

const writePackemConfig = async (rootDirectory: string, bundler: BundlerName, transformer: TransformerName): Promise<string> => {
    const targetPath = join(rootDirectory, "packem.config.ts");

    await writeFile(targetPath, generatePackemConfig(bundler, transformer), "utf8");

    return targetPath;
};

interface WizardResult {
    configCreated: boolean;
    configPath: string | undefined;
    installed: string[];
}

/**
 * On first run, when packem.config is absent OR no supported bundler/transformer
 * is installed, prompt the user to pick a bundler + transformer, install them via
 * the local package manager, and write a minimal packem.config.ts. In CI or
 * non-TTY environments the function throws with an actionable message so the
 * failure is loud, not silent.
 *
 * Returns `undefined` when no setup is needed (config + deps already in place).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const runFirstRunWizard = async (rootDirectory: string, packageJson: any, logger: Pail): Promise<WizardResult | undefined> => {
    const existingBundler = detectInstalledBundler(rootDirectory);
    const existingTransformer = detectInstalledTransformer(rootDirectory);
    const configPresent = await hasPackemConfig(rootDirectory);

    if (configPresent && existingBundler && existingTransformer) {
        return undefined;
    }

    const isInteractive = Boolean(process.stdout.isTTY) && !process.env.CI;

    if (!isInteractive) {
        const missing: string[] = [];

        if (!configPresent) {
            missing.push("packem.config");
        }

        if (!existingBundler) {
            missing.push("a bundler (rollup or rolldown)");
        }

        if (!existingTransformer) {
            missing.push("a transformer (esbuild, swc, oxc, or sucrase)");
        }

        throw new Error(
            `Packem first-run setup needed: missing ${missing.join(", ")}. `
            + `Run packem in an interactive terminal to set up, or install manually: `
            + `npm install -D rollup esbuild && create a packem.config.ts.`,
        );
    }

    intro(cyan("Packem first-run setup"));

    if (!configPresent) {
        log.info("No packem.config found — let's create one.");
    } else if (!existingBundler || !existingTransformer) {
        log.info("Required dependencies are missing — let's install them.");
    }

    const bundler = existingBundler ?? (await promptBundler());
    const transformer = existingTransformer ?? (await promptTransformer());

    // Only install packages that are missing from this package's package.json
    // (transitive resolution from a parent node_modules is fine for execution,
    // but a published package needs an explicit declaration). Rollup is
    // required for DTS regardless of bundler choice, since
    // @visulima/rollup-plugin-dts isn't rolldown-compatible yet.
    const toInstall: string[] = [];

    if (!isDeclaredInPackageJson(BUNDLER_PACKAGES[bundler], packageJson) && !isResolvable(BUNDLER_PACKAGES[bundler], rootDirectory)) {
        toInstall.push(BUNDLER_PACKAGES[bundler]);
    }

    if (bundler === "rolldown" && !isDeclaredInPackageJson(BUNDLER_PACKAGES.rollup, packageJson) && !isResolvable(BUNDLER_PACKAGES.rollup, rootDirectory)) {
        toInstall.push(BUNDLER_PACKAGES.rollup);
    }

    if (!isDeclaredInPackageJson(TRANSFORMER_PACKAGES[transformer], packageJson) && !isResolvable(TRANSFORMER_PACKAGES[transformer], rootDirectory)) {
        toInstall.push(TRANSFORMER_PACKAGES[transformer]);
    }

    await installPackagesWithSpinner(toInstall, rootDirectory);

    let configPath: string | undefined;

    if (!configPresent) {
        configPath = await writePackemConfig(rootDirectory, bundler, transformer);

        log.success(`Created ${configPath}`);
    }

    outro("Setup complete — continuing with build.");

    logger.info("Packem first-run setup finished.");

    return {
        configCreated: !configPresent,
        configPath,
        installed: toInstall,
    };
};
