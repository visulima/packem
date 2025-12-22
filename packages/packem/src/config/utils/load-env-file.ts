import { existsSync } from "node:fs";

import { resolve } from "@visulima/path";

/**
 * Loads environment variables from a .env file with optional prefix filtering.
 * Uses Node.js built-in `process.loadEnvFile` to load the file, then filters variables by prefix.
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

    const envVariables: Record<string, string> = {};

    // Use Node.js built-in process.loadEnvFile if available (Node.js >= 20.6.0)
    if (typeof process.loadEnvFile === "function") {
        try {
            // Capture current env state before loading
            const beforeEnv = new Set(Object.keys(process.env));

            // Load the .env file (this modifies process.env)
            process.loadEnvFile(resolvedPath);

            // Extract variables that were added and match the prefix
            for (const [key, value] of Object.entries(process.env)) {
                if (!beforeEnv.has(key) && (!prefix || key.startsWith(prefix))) {
                    envVariables[`process.env.${key}`] = JSON.stringify(value);
                }
            }

            // Clean up: remove variables that were added by loadEnvFile
            // Note: This is a best-effort cleanup. Some variables might have been
            // overwritten if they already existed, which we can't restore perfectly.
            for (const key of Object.keys(process.env)) {
                if (!beforeEnv.has(key)) {
                    delete process.env[key];
                }
            }
        } catch {
            // If loadEnvFile fails, fall back to manual parsing
            return loadEnvFileManually(resolvedPath, prefix);
        }
    } else {
        // Fallback to manual parsing for older Node.js versions
        return loadEnvFileManually(resolvedPath, prefix);
    }

    return envVariables;
};

/**
 * Manually parses a .env file and extracts environment variables.
 * @param filePath Path to the .env file
 * @param prefix Optional prefix to filter environment variables
 * @returns Record of environment variables with keys formatted as "process.env.KEY"
 */
const loadEnvFileManually = async (filePath: string, prefix: string = "PACKEM_"): Promise<Record<string, string>> => {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(filePath, "utf-8");
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



