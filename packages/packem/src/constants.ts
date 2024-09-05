import { DEFAULTS as RESOLVE_DEFAULTS } from "@rollup/plugin-node-resolve";
import type { Loader } from "esbuild";

export const DEFAULT_EXTENSIONS = [...RESOLVE_DEFAULTS.extensions, ".cjs", ".ts", ".cts", ".mts", ".tsx", ".jsx"];

export const DEFAULT_LOADERS: Record<string, Loader> = {
    ".aac": "file",
    ".cjs": "js",
    ".css": "file",
    ".cts": "ts",
    ".eot": "file",
    ".flac": "file",
    ".gif": "file",
    ".jpeg": "file",
    ".jpg": "file",
    ".js": "js",
    // Add .json files support - require @rollup/plugin-json
    ".json": "json",
    ".jsx": "jsx",
    ".mjs": "js",
    ".mp3": "file",
    ".mp4": "file",
    ".mts": "ts",
    ".ogg": "file",
    ".otf": "file",
    ".png": "file",
    ".svg": "file",
    ".ts": "ts",
    ".tsx": "tsx",
    ".ttf": "file",
    ".wav": "file",
    ".webm": "file",
    ".webp": "file",
    ".woff": "file",
    ".woff2": "file",
};

export const PRODUCTION_ENV = "production";
export const DEVELOPMENT_ENV = "development";

export const RUNTIME_EXPORT_CONVENTIONS = new Set(["react-server", "react-native", "edge-light"]);
export const SPECIAL_EXPORT_CONVENTIONS = new Set([DEVELOPMENT_ENV, PRODUCTION_ENV, ...RUNTIME_EXPORT_CONVENTIONS]);

export const EXCLUDE_REGEXP = /node_modules/;

export const ENDING_RE = /(?:\.d\.[mc]?ts|\.\w+)$/;
