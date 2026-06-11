import { existsSync } from "node:fs";
import { parseEnv } from "node:util";

import { resolve } from "@visulima/path";

const ENV_LINE_REGEX = /^([^#:=]+)=(.*)$/;

/**
 * Manually parses .env file content and extracts environment variables.
 * @param content Raw text read from the .env file, parsed line by line.
 * @param prefix Only keys starting with this string are kept (empty keeps all).
 * @returns Record of environment variables with keys formatted as "process.env.KEY"
 */
const loadEnvFileManually = (content: string, prefix: string = "PACKEM_"): Record<string, string> => {
    const envVariables: Record<string, string> = {};

    // Parse .env file line by line
    for (const line of content.split("\n")) {
        const trimmedLine = line.trim();

        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith("#")) {
            continue;
        }

        // Parse KEY=VALUE format
        const match = ENV_LINE_REGEX.exec(trimmedLine);

        if (match?.[1]) {
            const key = match[1].trim();
            let value = match[2].trim();

            // Remove quotes if present
            if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }

            // Filter by prefix if provided
            if (!prefix || key.startsWith(prefix)) {
                envVariables[`process.env.${key}`] = JSON.stringify(value);
            }
        }
    }

    return envVariables;
};

/**
 * Loads environment variables from a .env file with optional prefix filtering.
 * Uses Node.js built-in `util.parseEnv` to parse the file content without modifying `process.env`.
 * @param envFilePath Path to the .env file (relative to rootDirectory or absolute)
 * @param rootDirectory Root directory for resolving relative paths
 * @param prefix Optional prefix to filter environment variables (e.g., "PACKEM_")
 * @returns Record of environment variables with keys formatted as "process.env.KEY"
 * @example
 * ```typescript
 * const envVars = await loadEnvFile(".env", "/path/to/project", "PACKEM_");
 * // Returns: { "process.env.PACKEM_API_URL": "\"https://api.example.com\"" }
 * ```
 */
interface EnvFileLogger {
    info: (message: string) => void;
    warn: (message: string) => void;
}

const loadEnvFile = async (
    envFilePath: string,
    rootDirectory: string,
    prefix: string = "PACKEM_",
    logger?: EnvFileLogger,
): Promise<Record<string, string>> => {
    const resolvedPath = resolve(rootDirectory, envFilePath);

    if (!existsSync(resolvedPath)) {
        // An env file was explicitly requested but doesn't exist — surface it
        // instead of silently returning no variables.
        logger?.warn(`Env file not found at "${resolvedPath}"; no environment variables were loaded.`);

        return {};
    }

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(resolvedPath, "utf8");
    const envVariables: Record<string, string> = {};

    // Use Node.js built-in util.parseEnv if available (Node.js >= 20.12.0)
    // This parses the file content without modifying process.env
    if (typeof parseEnv === "function") {
        try {
            const parsed = parseEnv(content);
            const totalCount = Object.keys(parsed).length;

            // Filter by prefix and format keys for Rollup replace plugin
            for (const [key, value] of Object.entries(parsed)) {
                if (!prefix || key.startsWith(prefix)) {
                    envVariables[`process.env.${key}`] = JSON.stringify(value);
                }
            }

            const loadedCount = Object.keys(envVariables).length;

            if (totalCount > 0 && loadedCount === 0 && prefix) {
                logger?.warn(`Loaded 0 of ${totalCount} variables from "${envFilePath}"; none matched the "${prefix}" prefix.`);
            } else {
                logger?.info(`Loaded ${loadedCount} of ${totalCount} variables from "${envFilePath}"${prefix ? ` (prefix "${prefix}")` : ""}.`);
            }
        } catch {
            // If parseEnv fails, fall back to manual parsing
            return loadEnvFileManually(content, prefix);
        }
    } else {
        // Fallback to manual parsing for older Node.js versions
        return loadEnvFileManually(content, prefix);
    }

    return envVariables;
};

export default loadEnvFile;
