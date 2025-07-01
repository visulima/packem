/**
 * Build environment types
 * @public
 */
export type Environment = "production" | "development" | undefined;

/**
 * Build mode types
 * @public
 */
export type Mode = "build" | "jit" | "watch";

/**
 * Output format types
 * @public
 */
export type Format = "cjs" | "esm";

/**
 * Runtime environment types
 * @public
 */
export type Runtime =
    | "browser"
    | "bun"
    | "deno"
    | "edge-light"
    | "electron"
    | "node"
    | "react-native"
    | "react-server"
    | "workerd"
    | undefined;
