// eslint-disable-next-line import/no-namespace
import type * as sass from "sass";
// eslint-disable-next-line import/no-namespace
import type * as sassEmbedded from "sass-embedded";

const getSassCompiler = async (
    implementation: "sass-embedded" | "sass" | undefined,
): Promise<
((sassOptions: sass.StringOptions<"sync"> & { data: string }) => sass.CompileResult) | ((sassOptions: sassEmbedded.StringOptions<"sync"> & { data: string }) => sassEmbedded.CompileResult)
> => {
    let resolvedCompiler: typeof sass.compileString | typeof sassEmbedded.compileString | undefined;

    if (implementation === undefined || implementation === "sass-embedded") {
        try {
            resolvedCompiler = await import("sass-embedded").then((d) => d.compileString) as typeof sassEmbedded;
        } catch {
            // Continue to the next implementation
        }
    }

    if (resolvedCompiler === undefined && (implementation === undefined || implementation === "sass")) {
        try {
            resolvedCompiler = await import("sass").then((d) => d.compileString) as typeof sass;
        } catch {
            // Continue to the next implementation
        }
    }

    if (resolvedCompiler === undefined) {
        throw new Error("No supported Sass implementation found. Please install 'sass-embedded' or 'sass'.");
    }

    return (sassOptions: (sass.StringOptions<"sync"> | sassEmbedded.StringOptions<"sync">) & { data: string }) => {
        const { data, ...rest } = sassOptions;

        return resolvedCompiler(data as string, rest);
    };
};

export default getSassCompiler;
