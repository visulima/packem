import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { createInterface } from "node:readline/promises";

import type { Cli } from "@visulima/cerebro";
import type { Pail } from "@visulima/pail";

import packageJson from "../../../package.json";

/**
 * Minimal structural logger contract used by this command.
 * The runtime logger (Pail) is structurally assignable to this; the command
 * narrows to the precise subset of methods it actually uses.
 */
interface CommandLogger {
    error: (...message: unknown[]) => void;
    info: (...message: unknown[]) => void;
    success: (...message: unknown[]) => void;
    warn: (...message: unknown[]) => void;
}

/** Parsed package.json shape this command reads and rewrites. */
interface MigratablePackageJson {
    [field: string]: unknown;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
}

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
    dependencies: `^${packageJson.version}`,
    devDependencies: `^${packageJson.version}`,
    peerDependencies: "*",
} as const;

/**
 * Renames a key in an object while preserving key order.
 * @param object The object to modify
 * @param oldKey The key to rename
 * @param newKey The new key name
 * @param newValue Optional new value for the key
 * @returns The modified object
 */
const renameKey = (object: Record<string, string>, oldKey: string, newKey: string, newValue?: string): Record<string, string> => {
    const newObject: Record<string, string> = {};

    for (const key of Object.keys(object)) {
        if (key === oldKey) {
            newObject[newKey] = newValue ?? object[oldKey];
        } else {
            newObject[key] = object[key];
        }
    }

    return newObject;
};

const UNBUILD_SCRIPT_REGEXP = /\bunbuild\b/g;
const BUNCHEE_SCRIPT_REGEXP = /\bbunchee\b/g;
const TSUP_SCRIPT_REGEXP = /\btsup(?:-node)?/g;
const BUILD_SCRIPT_REGEXP = /\bbuild\b/g;

/**
 * Common bundler invocation patterns and how to rewrite them to packem.
 * Order is significant and matches the historical migration order.
 */
const COMMON_SCRIPT_PATTERNS: { from: string; rewrite: (script: string) => string }[] = [
    // Avoid double build by collapsing any resulting `build` token.
    { from: "tsup", rewrite: (script) => script.replaceAll(TSUP_SCRIPT_REGEXP, "packem build").replaceAll(BUILD_SCRIPT_REGEXP, "build") },
    { from: "unbuild", rewrite: (script) => script.replaceAll(UNBUILD_SCRIPT_REGEXP, "packem build") },
    { from: "bunchee", rewrite: (script) => script.replaceAll(BUNCHEE_SCRIPT_REGEXP, "packem build") },
];

/**
 * Migrates a single script entry, rewriting bundler invocations to `packem`.
 * @param key The script name (used for logging)
 * @param value The original script command
 * @param logger Logger instance for output
 * @returns The rewritten command, or `undefined` when nothing changed
 */
const migrateScript = (key: string, value: string, logger: CommandLogger): string | undefined => {
    let next = value;
    let changed = false;

    // Replace bundler commands
    for (const oldCmd of Object.keys(DEP_MIGRATIONS)) {
        if (next.includes(oldCmd)) {
            logger.info(`Migrating \`${key}\` script from ${oldCmd} to packem`);
            changed = true;
            next = next.replaceAll(new RegExp(String.raw`\b${oldCmd}\b`, "g"), "packem").replaceAll(new RegExp(String.raw`\b${oldCmd}-node\b`, "g"), "packem");
        }
    }

    // Handle common script patterns
    for (const { from, rewrite } of COMMON_SCRIPT_PATTERNS) {
        if (next.includes(from)) {
            logger.info(`Migrating \`${key}\` script from ${from} to packem`);
            changed = true;
            next = rewrite(next);
        }
    }

    return changed ? next : undefined;
};

/**
 * Migrates every entry in the `scripts` block, returning the rewritten map.
 * @param scripts The package.json scripts map (not mutated)
 * @param logger Logger instance for output
 * @returns The rewritten scripts map and whether anything changed
 */
const migrateScripts = (scripts: Record<string, string>, logger: CommandLogger): { found: boolean; scripts: Record<string, string> } => {
    const result: Record<string, string> = { ...scripts };
    let found = false;

    for (const key of Object.keys(result)) {
        const migrated = migrateScript(key, result[key], logger);

        if (migrated !== undefined) {
            result[key] = migrated;
            found = true;
        }
    }

    return { found, scripts: result };
};

/**
 * Rewrites bundler dependency entries to packem across the known dependency
 * fields, returning an updated package.json copy.
 * @param parsedPkg The parsed package.json (not mutated)
 * @param logger Logger instance for output
 * @returns The updated package.json and whether anything changed
 */
const migrateDependencies = (parsedPkg: MigratablePackageJson, logger: CommandLogger): { found: boolean; pkg: MigratablePackageJson } => {
    const result: MigratablePackageJson = { ...parsedPkg };
    let found = false;

    for (const [field, semver] of Object.entries(DEP_FIELDS)) {
        let fieldValue = result[field] as Record<string, string> | undefined;

        for (const [oldDep, newDep] of Object.entries(DEP_MIGRATIONS)) {
            if (fieldValue?.[oldDep]) {
                logger.info(`Migrating \`${field}\` from ${oldDep} to ${newDep}.`);
                found = true;
                fieldValue = renameKey(fieldValue, oldDep, newDep, semver);
                result[field] = fieldValue;
            }
        }
    }

    return { found, pkg: result };
};

/**
 * Warns about inline bundler config blocks that require manual migration.
 * @param parsedPkg The parsed package.json
 * @param logger Logger instance for output
 */
const warnInlineConfigFields = (parsedPkg: MigratablePackageJson, logger: CommandLogger): void => {
    const configFields = ["tsup", "unbuild", "bunchee"];

    for (const field of configFields) {
        if (parsedPkg[field]) {
            logger.info(`Found \`${field}\` config field in package.json. Consider moving to packem.config.ts`);
            // Note: We don't automatically migrate config here as it requires manual conversion
        }
    }
};

/**
 * Migrates package.json dependencies, scripts, and config fields.
 * @param dryRun Whether to perform a dry run
 * @param logger Logger instance for output
 * @returns Whether any migration was performed
 */
const migratePackageJson = async (dryRun: boolean | undefined, logger: CommandLogger): Promise<boolean> => {
    if (!existsSync("package.json")) {
        logger.error("No package.json found");

        return false;
    }

    const pkgRaw = await readFile("package.json", "utf8");
    const initialPkg = JSON.parse(pkgRaw) as MigratablePackageJson;

    const { found: depsFound, pkg: parsedPkg } = migrateDependencies(initialPkg, logger);
    let found = depsFound;

    // Migrate scripts
    if (parsedPkg.scripts) {
        const { found: scriptsFound, scripts: migratedScripts } = migrateScripts(parsedPkg.scripts, logger);

        if (scriptsFound) {
            parsedPkg.scripts = migratedScripts;
            found = true;
        }
    }

    warnInlineConfigFields(parsedPkg, logger);

    if (!found) {
        logger.info("No migratable bundler dependencies found in package.json");

        return false;
    }

    const pkgString = `${JSON.stringify(parsedPkg, undefined, pkgRaw.includes("\t") ? "\t" : 2)}\n`;

    if (dryRun) {
        logger.info("[dry-run] package.json changes:");
        logger.info("Old content:");
        // eslint-disable-next-line no-console -- dry-run intentionally prints the raw file content to stdout for an unprefixed diff preview.
        console.info(pkgRaw);
        logger.info("New content:");
        // eslint-disable-next-line no-console -- dry-run intentionally prints the raw file content to stdout for an unprefixed diff preview.
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
 * @param logger Logger instance for output
 * @returns Whether any migration was performed
 */
const migrateConfigFiles = (logger: CommandLogger): boolean => {
    let found = false;

    for (const file of CONFIG_FILES) {
        if (!existsSync(file)) {
            continue;
        }

        logger.info(`Found config file \`${file}\`. Consider creating packem.config.ts instead.`);
        logger.info(`Manual migration required for config files. See https://www.visulima.com/docs/package/packem`);

        // For now, we just warn about config files but don't auto-migrate them
        // as config migration is complex and requires understanding the specific bundler config
        found = true;
    }

    if (!found) {
        logger.info("No bundler config files found");
    }

    return found;
};

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
const migrate = async ({ cwd, dryRun, logger }: { cwd?: string; dryRun?: boolean; logger: CommandLogger }): Promise<void> => {
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

    if (cwd) {
        process.chdir(cwd);
    }

    let migrated = false;

    // Migrate package.json
    if (await migratePackageJson(dryRun, logger)) {
        migrated = true;
    }

    // Migrate config files
    if (migrateConfigFiles(logger)) {
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
const createMigrateCommand = (cli: Cli<Pail>): void => {
    cli.addCommand({
        description: "Migrate from other bundlers (tsup, unbuild, bunchee, etc.) to packem",

        execute: async ({ logger, options: rawOptions }): Promise<void> => {
            const options = rawOptions as { cwd?: string; dryRun?: boolean };

            await migrate({
                cwd: options.cwd,
                dryRun: options.dryRun,
                logger: logger as unknown as CommandLogger,
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
