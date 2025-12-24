import { existsSync } from "node:fs";
import { parseEnv } from "node:util";

import { resolve } from "@visulima/path";

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
const loadEnvFile = async (envFilePath: string, rootDirectory: string, prefix: string = "PACKEM_"): Promise<Record<string, string>> => {
    const resolvedPath = resolve(rootDirectory, envFilePath);

    if (!existsSync(resolvedPath)) {
        return {};
    }

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(resolvedPath, "utf-8");
    const envVariables: Record<string, string> = {};

    // Use Node.js built-in util.parseEnv if available (Node.js >= 20.12.0)
    // This parses the file content without modifying process.env
    if (typeof parseEnv === "function") {
        try {
            const parsed = parseEnv(content);

            // Filter by prefix and format keys for Rollup replace plugin
            for (const [key, value] of Object.entries(parsed)) {
                if (!prefix || key.startsWith(prefix)) {
                    envVariables[`process.env.${key}`] = JSON.stringify(value);
                }
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

/**
 * Manually parses .env file content and extracts environment variables.
 * @param content The content of the .env file
 * @param prefix Optional prefix to filter environment variables
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
        const match = trimmedLine.match(/^([^=:#]+)=(.*)$/);

        if (match && match[1] && match[2] !== undefined) {
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

export default loadEnvFile;




