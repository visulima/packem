import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { createInterface } from "node:readline/promises";

import type { Cli } from "@visulima/cerebro";

import pkg from "../../../package.json" with { type: "json" };

/**
 * Migrates a project from other bundlers to packem.
 * @param options Migration options
 * @param options.cwd Working directory to migrate
 * @param options.dryRun Whether to perform a dry run
 * @param options.logger Logger instance for output
 * @returns Promise that resolves when migration is complete
 * @example
 * ```typescript
 * await migrate({
 *   cwd: "./my-project",
 *   dryRun: false,
 *   logger: myLogger
 * });
 * ```
 */
const migrate = async ({ cwd, dryRun, logger }: { cwd?: string; dryRun?: boolean; logger: any }): Promise<void> => {
    if (dryRun) {
        logger.info("Dry run enabled. No changes will be made.");
    } else {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        logger.warn(
            `\n\n`
            + `Before proceeding, review the migration guide at https://www.visulima.com/docs/package/packem, as this process will modify your files.\n`
            + `Uncommitted changes will be lost. Use the --dry-run flag to preview changes without applying them.`,
        );
        const input = await rl.question(`Continue? (Y/n) `);

        rl.close();

        const confirm = input.toLowerCase() === "y" || input === "";

        if (!confirm) {
            logger.error("Migration cancelled.");
            process.exitCode = 1;

            return;
        }
    }

    if (cwd)
        process.chdir(cwd);

    let migrated = false;

    // Migrate package.json
    if (await migratePackageJson(dryRun, logger)) {
        migrated = true;
    }

    // Migrate config files
    if (await migrateConfigFiles(dryRun, logger)) {
        migrated = true;
    }

    if (migrated) {
        logger.success("Migration completed. Remember to run install command with your package manager.");
    } else {
        logger.error("No migration performed.");
        process.exitCode = 1;
    }
};

/**
 * Migration mapping for dependencies from various bundlers to packem.
 */
const DEP_MIGRATIONS = {
    // From bunchee
    bunchee: "@visulima/packem",
    // From tsup
    tsup: "@visulima/packem",

    "tsup-node": "@visulima/packem",

    // From unbuild
    unbuild: "@visulima/packem",

    // Add more bundlers as needed
} as const;

/**
 * Fields in package.json that may contain bundler dependencies.
 */
const DEP_FIELDS = {
    dependencies: `^${pkg.version}`,
    devDependencies: `^${pkg.version}`,
    peerDependencies: "*",
} as const;

/**
 * Migrates package.json dependencies, scripts, and config fields.
 * @param dryRun Whether to perform a dry run
 * @param logger Logger instance for output
 * @returns Whether any migration was performed
 */
const migratePackageJson = async (dryRun?: boolean, logger: any): Promise<boolean> => {
    if (!existsSync("package.json")) {
        logger.error("No package.json found");

        return false;
    }

    const pkgRaw = await readFile("package.json", "utf8");
    const pkg = JSON.parse(pkgRaw);
    let found = false;

    // Migrate dependencies
    for (const [field, semver] of Object.entries(DEP_FIELDS)) {
        for (const [oldDep, newDep] of Object.entries(DEP_MIGRATIONS)) {
            if (pkg[field]?.[oldDep]) {
                logger.info(`Migrating \`${field}\` from ${oldDep} to ${newDep}.`);
                found = true;
                pkg[field] = renameKey(pkg[field], oldDep, newDep, semver);
            }
        }
    }

    // Migrate scripts
    if (pkg.scripts) {
        for (const key of Object.keys(pkg.scripts)) {
            let scriptChanged = false;

            // Replace bundler commands
            for (const [oldCmd, newCmd] of Object.entries(DEP_MIGRATIONS)) {
                if (pkg.scripts[key].includes(oldCmd)) {
                    logger.info(`Migrating \`${key}\` script from ${oldCmd} to packem`);
                    found = true;
                    scriptChanged = true;
                    pkg.scripts[key] = pkg.scripts[key]
                        .replaceAll(new RegExp(String.raw`\b${oldCmd}\b`, "g"), "packem")
                        .replaceAll(new RegExp(String.raw`\b${oldCmd}-node\b`, "g"), "packem");
                }
            }

            // Handle common script patterns
            if (pkg.scripts[key].includes("tsup")) {
                logger.info(`Migrating \`${key}\` script from tsup to packem`);
                found = true;
                scriptChanged = true;
                pkg.scripts[key] = pkg.scripts[key].replaceAll(/\btsup(?:-node)?/g, "packem build").replaceAll(/\bbuild\b/g, "build"); // Avoid double build
            }

            if (pkg.scripts[key].includes("unbuild")) {
                logger.info(`Migrating \`${key}\` script from unbuild to packem`);
                found = true;
                scriptChanged = true;
                pkg.scripts[key] = pkg.scripts[key].replaceAll(/\bunbuild\b/g, "packem build");
            }

            if (pkg.scripts[key].includes("bunchee")) {
                logger.info(`Migrating \`${key}\` script from bunchee to packem`);
                found = true;
                scriptChanged = true;
                pkg.scripts[key] = pkg.scripts[key].replaceAll(/\bbunchee\b/g, "packem build");
            }
        }
    }

    // Migrate config fields
    const configFields = ["tsup", "unbuild", "bunchee"];

    for (const field of configFields) {
        if (pkg[field]) {
            logger.info(`Found \`${field}\` config field in package.json. Consider moving to packem.config.ts`);
            // Note: We don't automatically migrate config here as it requires manual conversion
        }
    }

    if (!found) {
        logger.warn("No migratable bundler dependencies found in package.json");

        return false;
    }

    const pkgString = `${JSON.stringify(pkg, null, pkgRaw.includes("\t") ? "\t" : 2)}\n`;

    if (dryRun) {
        logger.info("[dry-run] package.json changes:");
        logger.info("Old content:");
        console.info(pkgRaw);
        logger.info("New content:");
        console.info(pkgString);
    } else {
        await writeFile("package.json", pkgString);
        logger.success("Migrated `package.json`");
    }

    return true;
};

/**
 * Config files to migrate from various bundlers.
 */
const CONFIG_FILES = [
    // tsup configs
    "tsup.config.ts",
    "tsup.config.cts",
    "tsup.config.mts",
    "tsup.config.js",
    "tsup.config.cjs",
    "tsup.config.mjs",
    "tsup.config.json",

    // unbuild configs
    "build.config.ts",
    "build.config.cts",
    "build.config.mts",
    "build.config.js",
    "build.config.cjs",
    "build.config.mjs",

    // bunchee configs
    "bunchee.config.ts",
    "bunchee.config.cts",
    "bunchee.config.mts",
    "bunchee.config.js",
    "bunchee.config.cjs",
    "bunchee.config.mjs",
];

/**
 * Migrates config files from other bundlers to packem.
 * @param dryRun Whether to perform a dry run
 * @param logger Logger instance for output
 * @returns Whether any migration was performed
 */
const migrateConfigFiles = async (dryRun?: boolean, logger?: any): Promise<boolean> => {
    let found = false;

    for (const file of CONFIG_FILES) {
        if (!existsSync(file))
            continue;

        logger.info(`Found config file \`${file}\`. Consider creating packem.config.ts instead.`);
        logger.warn(`Manual migration required for config files. See https://www.visulima.com/docs/package/packem`);

        // For now, we just warn about config files but don't auto-migrate them
        // as config migration is complex and requires understanding the specific bundler config
        found = true;
    }

    if (!found) {
        logger.warn("No bundler config files found");
    }

    return found;
};

/**
 * Renames a key in an object while preserving key order.
 * @param obj The object to modify
 * @param oldKey The key to rename
 * @param newKey The new key name
 * @param newValue Optional new value for the key
 * @returns The modified object
 */
const renameKey = (object: Record<string, any>, oldKey: string, newKey: string, newValue?: any): Record<string, any> => {
    const newObject: Record<string, any> = {};

    for (const key of Object.keys(object)) {
        if (key === oldKey) {
            newObject[newKey] = newValue || object[oldKey];
        } else {
            newObject[key] = object[key];
        }
    }

    return newObject;
};

/**
 * Creates and registers the migrate command with the CLI.
 * Handles migration from other bundlers (tsup, unbuild, bunchee, etc.) to packem.
 * @param cli CLI instance to register the command with
 * @example
 * ```typescript
 * // From command line:
 * // Migrate from tsup to packem:
 * // packem migrate
 *
 * // Dry run to preview changes:
 * // packem migrate --dry-run
 *
 * // Specify custom directory:
 * // packem migrate --cwd /path/to/project
 * ```
 * @internal
 */
const createMigrateCommand = (cli: Cli): void => {
    cli.addCommand({
        description: "Migrate from other bundlers (tsup, unbuild, bunchee, etc.) to packem",
        execute: async ({ logger, options }): Promise<void> => {
            await migrate({
                cwd: options.cwd,
                dryRun: options.dryRun,
                logger,
            });
        },
        name: "migrate",
        options: [
            {
                defaultValue: ".",
                description: "The directory to migrate",
                name: "cwd",
                type: String,
            },
            {
                description: "Preview changes without applying them",
                name: "dry-run",
                type: Boolean,
            },
        ],
    });
};

export default createMigrateCommand;
