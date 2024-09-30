import type { Loader } from "esbuild";

export const DEFAULT_EXTENSIONS: string[] = [".mjs", ".js", ".json", ".node", ".cjs", ".ts", ".cts", ".mts", ".tsx", ".ctsx", ".mtsx", ".jsx"];

export const DEFAULT_LOADERS: Record<string, Loader> = {
    ".aac": "file",
    ".cjs": "js",
    ".css": "file",
    ".cts": "ts",
    ".ctsx": "ts",
    ".eot": "file",
    ".flac": "file",
    ".gif": "file",
    ".jpeg": "file",
    ".jpg": "file",
    ".js": "js",
    ".jsx": "jsx",
    ".mjs": "js",
    ".mp3": "file",
    ".mp4": "file",
    ".mts": "ts",
    ".mtsx": "ts",
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
export const ENDING_RE: RegExp = /(?:\.d\.[mc]?tsx?|\.\w+)$/;

export const CHUNKS_PACKEM_FOLDER = "packem_chunks";
export const SHARED_PACKEM_FOLDER = "packem_shared";

// eslint-disable-next-line @typescript-eslint/no-inferrable-types
export const ALLOWED_TRANSFORM_EXTENSIONS_REGEX: RegExp = /\.(?:m|c)?(?:j|t)sx?$/;
