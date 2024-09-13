import type { Loader } from "esbuild";

export const DEFAULT_EXTENSIONS: string[] = [".mjs", ".js", ".json", ".node", ".cjs", ".ts", ".cts", ".mts", ".tsx", ".jsx"];

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

export const RUNTIME_EXPORT_CONVENTIONS: Set<string> = new Set<string>(["react-server", "react-native", "edge-light"]);
export const SPECIAL_EXPORT_CONVENTIONS: Set<string> = new Set<string>([DEVELOPMENT_ENV, PRODUCTION_ENV, ...RUNTIME_EXPORT_CONVENTIONS]);

// eslint-disable-next-line @typescript-eslint/no-inferrable-types
export const EXCLUDE_REGEXP: RegExp = /node_modules/;

// eslint-disable-next-line @typescript-eslint/no-inferrable-types
export const ENDING_RE: RegExp = /(?:\.d\.[mc]?ts|\.\w+)$/;

export const CHUNKS_PACKEM_FOLDER = "packem_chunks";
export const SHARED_PACKEM_FOLDER = "packem_shared";

export const TYPESCRIPT_EXTENSIONS_REGEX = /\.(cjs|mjs|cts|mts|ts|tsx)$/;
