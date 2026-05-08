// Lightweight, internal typing for Rolldown's Node build API
export type RolldownOutputItem = {
    code?: string;
    dynamicImports?: string[];
    exports?: string[];
    fileName: string;
    imports?: string[];
    isEntry?: boolean;
    modules?: Record<string, { renderedLength: number }>;
    source?: string;
    type: string; // 'chunk' | 'asset'
};

export type RolldownBuildResult = {
    output: RolldownOutputItem[];
};

export type RolldownBuild = (options: unknown) => Promise<RolldownBuildResult>;

/**
 * Resolve Rolldown's build function from either '@rolldown/node' (preferred) or 'rolldown'.
 * Throws a helpful error if neither package is installed.
 *
 * Both packages are optional peer deps so they're not declared in package.json.
 * Type imports are suppressed via ts-ignore to allow building without them installed.
 */
export async function getRolldownBuild(): Promise<RolldownBuild> {
    try {
        // @ts-ignore optional peer dependency
        const mod = (await import("@rolldown/node")) as unknown as { build?: RolldownBuild };
        if (typeof mod.build === "function") {
            return mod.build as RolldownBuild;
        }
    } catch {
        // not installed — try fallback
    }

    try {
        // @ts-ignore optional peer dependency
        const mod = (await import("rolldown")) as unknown as { build?: RolldownBuild };
        if (typeof mod.build === "function") {
            return mod.build as RolldownBuild;
        }
    } catch {
        // not installed
    }

    throw new Error("Rolldown is not installed. Please install '@rolldown/node' or 'rolldown' to use bundler: 'rolldown'.");
}
