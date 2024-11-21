import type { Loader } from "esbuild";

export const DEFAULT_JS_EXTENSIONS: string[] = [".mjs", ".js", ".json", ".node", ".cjs", ".jsx"];

export const DEFAULT_EXTENSIONS: string[] = [...DEFAULT_JS_EXTENSIONS, ".ts", ".cts", ".mts", ".tsx", ".ctsx", ".mtsx"];

export const DEFAULT_LOADERS: Record<string, Loader> = {
    ".aac": "file",
    ".cjs": "js",
    ".cts": "ts",
    ".ctsx": "tsx",
    ".eot": "file",
    ".flac": "file",
    ".js": "js",
    ".jsx": "jsx",
    ".mjs": "js",
    ".mp3": "file",
    ".mp4": "file",
    ".mts": "ts",
    ".mtsx": "tsx",
    ".ogg": "file",
    ".otf": "file",
    ".ts": "ts",
    ".tsx": "tsx",
    ".ttf": "file",
    ".wav": "file",
    ".webm": "file",
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
